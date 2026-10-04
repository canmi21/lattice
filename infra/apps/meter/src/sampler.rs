//! The meter's state: the last reading, the grains held in memory and the store of hours, moved on
//! once a second and asked for what they hold -- the machine's, and each container's apart. See
//! spec/architecture/meter.md.

use crate::containers::{self, Names};
use crate::probe::{self, Info, Reading, Roots};
use crate::retention::{Point, Tiers};
use crate::sample::{self, Sample};
use crate::store::Store;

/// Which grain a series is read at, which is also how far back it reaches.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Grain {
	/// The last minute, a point a second.
	Second,
	/// The last hour, a point a minute.
	Minute,
	/// Every hour kept, from the store, and the one still open.
	Hour,
}

/// One set of series, at every grain: the minute and the hour held in memory, the hours in a store.
pub struct Kept {
	tiers: Tiers,
	store: Store,
}

impl Kept {
	pub fn new(store: Store) -> Self {
		Self { tiers: Tiers::default(), store }
	}

	fn push(&mut self, sample: Sample) -> anyhow::Result<()> {
		if let Some(hour) = self.tiers.push(sample) {
			self.store.keep(&hour)?;
		}
		Ok(())
	}

	/// The latest sample, once there is one.
	pub fn now(&self) -> Option<&Sample> {
		self.tiers.latest()
	}

	pub fn series(
		&self,
		grain: Grain,
		metrics: &[String],
		since: i64,
		until: i64,
	) -> anyhow::Result<Vec<Point>> {
		let within = |point: &Point| point.at >= since && point.at < until;
		Ok(
			match grain {
				Grain::Second => self.tiers.seconds(),
				Grain::Minute => self.tiers.minutes(),
				Grain::Hour => {
					let mut hours = self.store.hours(metrics, since, until)?;
					if let Some(open) = self.tiers.open_hour().filter(|open| within(open)) {
						// An hour saved on the way down and still filling after a restart is one hour.
						match hours.last_mut().filter(|last| last.at == open.at) {
							Some(saved) => {
								for (name, summary) in open.values.iter() {
									let merged = saved.values.get(name).map_or(*summary, |kept| kept.merge(*summary));
									saved.values.insert(name.clone(), merged);
								}
							}
							None => hours.push(open.clone()),
						}
					}
					hours
				}
			}
			.iter()
			.filter(|point| within(point))
			.map(|point| point.only(metrics))
			.collect(),
		)
	}

	/// Keeps the hour still open, so stopping loses nothing already sampled.
	fn stop(&mut self) -> anyhow::Result<()> {
		if let Some(open) = self.tiers.open_hour() {
			self.store.keep(open)?;
		}
		Ok(())
	}
}

/// Each container's side: which is which, the last reading, and its own series.
struct Containers {
	names: Names,
	earlier: Option<containers::Reading>,
	kept: Kept,
}

pub struct Sampler {
	roots: Roots,
	info: Info,
	earlier: Option<Reading>,
	machine: Kept,
	containers: Option<Containers>,
}

impl Sampler {
	pub fn new(roots: Roots, store: Store) -> Self {
		let info = probe::info(&roots);
		Self { info, roots, earlier: None, machine: Kept::new(store), containers: None }
	}

	/// Sample each container too, named as `names` says, into a store of its own.
	pub fn with_containers(mut self, names: Names, store: Store) -> Self {
		self.containers = Some(Containers { names, earlier: None, kept: Kept::new(store) });
		self
	}

	pub fn info(&self) -> &Info {
		&self.info
	}

	pub fn machine(&self) -> &Kept {
		&self.machine
	}

	/// Each container's series; none when the meter samples the machine alone.
	pub fn containers(&self) -> Option<&Kept> {
		self.containers.as_ref().map(|containers| &containers.kept)
	}

	/// Reads the machine and every container, and moves every grain on.
	pub fn tick(&mut self) -> anyhow::Result<()> {
		let reading = probe::reading(&self.roots);
		let at = reading.at;
		self.take(reading)?;
		if let Some(containers) = &mut self.containers {
			let reading = containers::reading_at(&self.roots, containers.names.current(), at);
			take_containers(containers, reading, self.info.cores)?;
		}
		Ok(())
	}

	/// The first reading only starts the counters; each after it makes a sample.
	pub fn take(&mut self, reading: Reading) -> anyhow::Result<()> {
		let Some(earlier) = self.earlier.replace(reading) else { return Ok(()) };
		let later = self.earlier.as_ref().unwrap_or(&earlier);
		self.machine.push(sample::between(&earlier, later))
	}

	pub fn take_containers(&mut self, reading: containers::Reading) -> anyhow::Result<()> {
		let cores = self.info.cores;
		match &mut self.containers {
			Some(containers) => take_containers(containers, reading, cores),
			None => Ok(()),
		}
	}

	/// Keeps the hours still open, so stopping loses nothing already sampled.
	pub fn stop(&mut self) -> anyhow::Result<()> {
		self.machine.stop()?;
		if let Some(containers) = &mut self.containers {
			containers.kept.stop()?;
		}
		Ok(())
	}
}

fn take_containers(
	containers: &mut Containers,
	reading: containers::Reading,
	cores: usize,
) -> anyhow::Result<()> {
	let Some(earlier) = containers.earlier.replace(reading) else { return Ok(()) };
	let later = containers.earlier.as_ref().unwrap_or(&earlier);
	containers.kept.push(containers::between(&earlier, later, cores))
}

#[cfg(test)]
mod tests {
	use super::*;
	use crate::probe::tests::{STAT, machine};

	#[test]
	fn samples_keeps_and_answers_at_each_grain() {
		let (root, roots) = machine(STAT);
		let path = root.path().join("hours.db");
		let mut sampler = Sampler::new(roots.clone(), Store::open(&path).unwrap());
		assert_eq!(sampler.info().cores, 2);
		for at in 3590..3700 {
			sampler.take(probe::reading_at(&roots, at as f64)).unwrap();
		}
		assert_eq!(sampler.machine().now().unwrap().at, 3699);
		let everything = i64::MIN..i64::MAX;
		let series = |sampler: &Sampler, grain| {
			sampler.machine().series(grain, &["cpu".to_owned()], everything.start, everything.end)
		};

		let seconds = series(&sampler, Grain::Second).unwrap();
		assert_eq!(seconds.len(), 60);
		assert_eq!(
			seconds[0].values.keys().collect::<Vec<_>>(),
			["cpu.core.0.usage", "cpu.core.1.usage", "cpu.frequency.0", "cpu.iowait", "cpu.usage"]
		);
		assert_eq!(series(&sampler, Grain::Minute).unwrap().len(), 3);
		let hours = series(&sampler, Grain::Hour).unwrap();
		// 3591..3599 closed into the store at 3600; 3600..3699 is open.
		assert_eq!(
			hours.iter().map(|hour| (hour.at, hour.values["cpu.usage"].count)).collect::<Vec<_>>(),
			[(0, 9), (3600, 100)]
		);

		// Stopped, restarted, and sampled on inside the same hour.
		sampler.stop().unwrap();
		drop(sampler);
		let mut sampler = Sampler::new(roots.clone(), Store::open(&path).unwrap());
		for at in 3800..3811 {
			sampler.take(probe::reading_at(&roots, at as f64)).unwrap();
		}
		let hours = series(&sampler, Grain::Hour).unwrap();
		assert_eq!(hours[1].values["cpu.usage"].count, 110);
		assert!(series(&sampler, Grain::Second).unwrap().iter().all(|point| point.at >= 3801));
		assert!(sampler.machine().series(Grain::Hour, &[], 0, 3600).unwrap().len() == 1);
	}
}
