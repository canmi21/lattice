//! Samples kept at three grains: every second for the last minute and every minute for the last
//! hour, in memory, and every hour for good, handed to the store as each one closes. See
//! spec/architecture/agent.md, "Retention".

use crate::sample::Sample;
use std::collections::{BTreeMap, VecDeque};

/// How many points the two grains held in memory keep: a minute of seconds, an hour of minutes.
pub const KEPT: usize = 60;

/// One metric over one bucket of time.
#[derive(Debug, Clone, Copy, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct Summary {
	pub average: f64,
	pub minimum: f64,
	pub maximum: f64,
	/// How many samples it summarizes, which lets two summaries of one bucket be merged.
	pub count: u64,
}

impl Summary {
	pub fn of(value: f64) -> Self {
		Self { average: value, minimum: value, maximum: value, count: 1 }
	}

	pub fn merge(self, other: Self) -> Self {
		let count = self.count + other.count;
		let weighted = self.average * self.count as f64 + other.average * other.count as f64;
		Self {
			average: if count == 0 { 0.0 } else { weighted / count as f64 },
			minimum: self.minimum.min(other.minimum),
			maximum: self.maximum.max(other.maximum),
			count,
		}
	}
}

/// A bucket of time, named by when it starts, with each metric summarized over it.
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct Point {
	pub at: i64,
	pub values: BTreeMap<String, Summary>,
}

impl Point {
	fn open(at: i64) -> Self {
		Self { at, values: BTreeMap::new() }
	}

	fn add(&mut self, sample: &Sample) {
		for (name, &value) in &sample.values {
			let summary = Summary::of(value);
			self
				.values
				.entry(name.clone())
				.and_modify(|kept| *kept = kept.merge(summary))
				.or_insert(summary);
		}
	}
}

/// Whether a requested name asks for a metric: the metric itself, or a dotted prefix of it, so
/// `cpu.core` asks for every core.
pub fn asks_for(requested: &[String], metric: &str) -> bool {
	requested.is_empty()
		|| requested.iter().any(|name| {
			metric == name || (metric.starts_with(name.as_str()) && metric[name.len()..].starts_with('.'))
		})
}

impl Point {
	/// The same bucket with only the metrics asked for.
	pub fn only(&self, requested: &[String]) -> Point {
		let values = self.values.iter().filter(|(name, _)| asks_for(requested, name));
		Point { at: self.at, values: values.map(|(name, summary)| (name.clone(), *summary)).collect() }
	}
}

impl From<&Sample> for Point {
	fn from(sample: &Sample) -> Self {
		let mut point = Point::open(sample.at);
		point.add(sample);
		point
	}
}

fn start(at: i64, width: i64) -> i64 {
	at - at.rem_euclid(width)
}

#[derive(Debug, Default)]
pub struct Tiers {
	seconds: VecDeque<Sample>,
	minutes: VecDeque<Point>,
	minute: Option<Point>,
	hour: Option<Point>,
}

impl Tiers {
	/// Takes a sample; answers with the hour it closed, if it closed one, for the store to keep.
	pub fn push(&mut self, sample: Sample) -> Option<Point> {
		if self.seconds.back().is_some_and(|last| sample.at <= last.at) {
			return None;
		}
		let minute = start(sample.at, 60);
		if self.minute.as_ref().is_some_and(|open| open.at != minute) {
			self.minutes.extend(self.minute.take());
			while self.minutes.len() > KEPT {
				self.minutes.pop_front();
			}
		}
		self.minute.get_or_insert_with(|| Point::open(minute)).add(&sample);

		let hour = start(sample.at, 3600);
		let closed =
			if self.hour.as_ref().is_some_and(|open| open.at != hour) { self.hour.take() } else { None };
		self.hour.get_or_insert_with(|| Point::open(hour)).add(&sample);

		self.seconds.push_back(sample);
		while self.seconds.len() > KEPT {
			self.seconds.pop_front();
		}
		closed
	}

	/// The hour still open, which a stopping agent keeps rather than loses; the store merges it with
	/// whatever the same hour gathers after a restart.
	pub fn open_hour(&self) -> Option<&Point> {
		self.hour.as_ref()
	}

	pub fn latest(&self) -> Option<&Sample> {
		self.seconds.back()
	}

	pub fn seconds(&self) -> Vec<Point> {
		self.seconds.iter().map(Point::from).collect()
	}

	/// The closed minutes, then the one still filling, so the line reaches the present.
	pub fn minutes(&self) -> Vec<Point> {
		self.minutes.iter().chain(self.minute.as_ref()).cloned().collect()
	}
}

#[cfg(test)]
mod tests {
	use super::*;

	fn sample(at: i64, cpu: f64) -> Sample {
		Sample { at, values: [("cpu.usage".to_owned(), cpu)].into() }
	}

	#[test]
	fn a_prefix_asks_for_what_is_under_it() {
		let asked = ["cpu.core".to_owned()];
		assert!(asks_for(&asked, "cpu.core.0.usage"));
		assert!(!asks_for(&asked, "cpu.cores"));
		assert!(!asks_for(&asked, "cpu.usage"));
		assert!(asks_for(&[], "anything"));
	}

	#[test]
	fn merges_by_weight() {
		let merged = Summary { average: 10.0, minimum: 5.0, maximum: 20.0, count: 3 }.merge(Summary {
			average: 30.0,
			minimum: 1.0,
			maximum: 40.0,
			count: 1,
		});
		assert_eq!(merged, Summary { average: 15.0, minimum: 1.0, maximum: 40.0, count: 4 });
	}

	#[test]
	fn keeps_a_minute_of_seconds_and_an_hour_of_minutes() {
		let mut tiers = Tiers::default();
		for at in 0..7200 {
			tiers.push(sample(at, (at % 60) as f64));
		}
		let seconds = tiers.seconds();
		assert_eq!(seconds.len(), KEPT);
		assert_eq!(seconds.last().unwrap().at, 7199);
		let minutes = tiers.minutes();
		// Sixty closed, and the one filling.
		assert_eq!(minutes.len(), KEPT + 1);
		assert_eq!(minutes.last().unwrap().at, 7140);
		let summary = minutes[0].values["cpu.usage"];
		assert_eq!((summary.minimum, summary.maximum, summary.count), (0.0, 59.0, 60));
		assert_eq!(summary.average, 29.5);
	}

	#[test]
	fn hands_over_each_hour_as_it_closes() {
		let mut tiers = Tiers::default();
		let mut closed = Vec::new();
		for at in (3000..7300).step_by(10) {
			closed.extend(tiers.push(sample(at, if at < 3600 { 10.0 } else { 50.0 })));
		}
		// 3000..3600 is the first, partial hour; 3600..7200 the second; 7200 is still open.
		assert_eq!(closed.iter().map(|point| point.at).collect::<Vec<_>>(), [0, 3600]);
		assert_eq!(closed[0].values["cpu.usage"].count, 60);
		assert_eq!(closed[1].values["cpu.usage"].average, 50.0);
		assert_eq!(tiers.open_hour().unwrap().at, 7200);
	}

	#[test]
	fn a_gap_closes_what_was_open_and_a_late_sample_is_dropped() {
		let mut tiers = Tiers::default();
		tiers.push(sample(100, 1.0));
		assert!(tiers.push(sample(100, 2.0)).is_none());
		assert_eq!(tiers.seconds().len(), 1);
		let closed = tiers.push(sample(100_000, 3.0)).unwrap();
		assert_eq!(closed.at, 0);
		assert_eq!(tiers.minutes().iter().map(|point| point.at).collect::<Vec<_>>(), [60, 99_960]);
	}
}
