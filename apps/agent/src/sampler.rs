//! The agent's state: the last reading, the grains held in memory and the store of hours, moved on
//! once a second and asked for what they hold. See spec/architecture/agent.md.

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

pub struct Sampler {
	roots: Roots,
	info: Info,
	earlier: Option<Reading>,
	tiers: Tiers,
	store: Store,
}

impl Sampler {
	pub fn new(roots: Roots, store: Store) -> Self {
		Self { info: probe::info(&roots), roots, earlier: None, tiers: Tiers::default(), store }
	}

	pub fn info(&self) -> &Info {
		&self.info
	}

	/// Reads the machine and moves every grain on.
	pub fn tick(&mut self) -> anyhow::Result<()> {
		let reading = probe::reading(&self.roots);
		self.take(reading)
	}

	/// The first reading only starts the counters; each after it makes a sample.
	pub fn take(&mut self, reading: Reading) -> anyhow::Result<()> {
		let Some(earlier) = self.earlier.replace(reading) else { return Ok(()) };
		let later = self.earlier.as_ref().unwrap_or(&earlier);
		if let Some(hour) = self.tiers.push(sample::between(&earlier, later)) {
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
	pub fn stop(&mut self) -> anyhow::Result<()> {
		if let Some(open) = self.tiers.open_hour() {
			self.store.keep(open)?;
		}
		Ok(())
	}
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
		assert_eq!(sampler.now().unwrap().at, 3699);
		let everything = i64::MIN..i64::MAX;
		let series = |sampler: &Sampler, grain| {
			sampler.series(grain, &["cpu".to_owned()], everything.start, everything.end)
		};

		let seconds = series(&sampler, Grain::Second).unwrap();
		assert_eq!(seconds.len(), 60);
		assert_eq!(
			seconds[0].values.keys().collect::<Vec<_>>(),
			[
				"cpu.core.0.frequency",
				"cpu.core.0.usage",
				"cpu.core.1.frequency",
				"cpu.core.1.usage",
				"cpu.iowait",
				"cpu.usage"
			]
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
		assert!(sampler.series(Grain::Hour, &[], 0, 3600).unwrap().len() == 1);
	}
}
