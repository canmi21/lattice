//! The thinning, as pure arithmetic: which grains exist and how long each is kept, what a bucket
//! summarizes to, and which window the budget shortens. `crate::status` does the writing. See
//! spec/architecture/probe.md, "Where the results go".

use std::collections::BTreeMap;

const MINUTE: i64 = 60_000;
const HOUR: i64 = 60 * MINUTE;
const DAY: i64 = 24 * HOUR;

/// Raw rounds are kept ten minutes, in milliseconds.
pub const RAW_WINDOW: i64 = 10 * MINUTE;

/// How long after a bucket ends it is summarized: a round belongs to the moment it started, and
/// may take a minute to end and a moment more to be archived. See `crate::checks::LONGEST`.
pub const SETTLE: i64 = 2 * MINUTE;

/// The budget of the tables in Postgres, of the free plan's 500 MB.
pub const BUDGET: u64 = 300 * 1000 * 1000;

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum Grain {
	Minute,
	Five,
	Ten,
	Thirty,
	Hour,
}

impl Grain {
	/// Finest first.
	pub const ALL: [Self; 5] = [Self::Minute, Self::Five, Self::Ten, Self::Thirty, Self::Hour];

	/// As `rollups.grain` spells it; platform/libs/probe's check constraint holds the same
	/// list.
	pub fn name(self) -> &'static str {
		match self {
			Self::Minute => "1m",
			Self::Five => "5m",
			Self::Ten => "10m",
			Self::Thirty => "30m",
			Self::Hour => "1h",
		}
	}

	/// A bucket's length, in milliseconds.
	pub fn length(self) -> i64 {
		match self {
			Self::Minute => MINUTE,
			Self::Five => 5 * MINUTE,
			Self::Ten => 10 * MINUTE,
			Self::Thirty => 30 * MINUTE,
			Self::Hour => HOUR,
		}
	}

	/// How long its buckets are kept before the budget has a say: a day, a week, a month, three
	/// months and a year.
	pub fn window(self) -> i64 {
		match self {
			Self::Minute => DAY,
			Self::Five => 7 * DAY,
			Self::Ten => 30 * DAY,
			Self::Thirty => 90 * DAY,
			Self::Hour => 365 * DAY,
		}
	}

	fn index(self) -> usize {
		Self::ALL.iter().position(|grain| *grain == self).unwrap_or_default()
	}
}

/// The start of the bucket `at` falls in; buckets are aligned to the epoch, so to the hour and
/// the day in UTC.
pub fn bucket_start(at: i64, grain: Grain) -> i64 {
	at.div_euclid(grain.length()) * grain.length()
}

/// One bucket of one check.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Summary {
	pub passed: i32,
	pub failed: i32,
	pub median_ms: i32,
	pub worst_ms: i32,
}

/// Rounds as `(ok, duration_ms)`, summarized: how many passed and failed, and the time every
/// round took at its median -- the lower of the middle two when they are even -- and worst.
pub fn summarize(rounds: &[(bool, u32)]) -> Option<Summary> {
	if rounds.is_empty() {
		return None;
	}
	let mut durations: Vec<u32> = rounds.iter().map(|(_, duration)| *duration).collect();
	durations.sort_unstable();
	let median = durations[(durations.len() - 1) / 2];
	let worst = durations[durations.len() - 1];
	let passed = rounds.iter().filter(|(ok, _)| *ok).count();
	let clamp = |value: u64| i32::try_from(value).unwrap_or(i32::MAX);
	Some(Summary {
		passed: clamp(passed as u64),
		failed: clamp((rounds.len() - passed) as u64),
		median_ms: clamp(u64::from(median)),
		worst_ms: clamp(u64::from(worst)),
	})
}

/// Rounds of many checks, as `(check, ok, duration_ms)`, summarized per check.
pub fn summarize_each(rounds: &[(String, bool, u32)]) -> BTreeMap<String, Summary> {
	let mut by_check: BTreeMap<&str, Vec<(bool, u32)>> = BTreeMap::new();
	for (check, ok, duration) in rounds {
		by_check.entry(check).or_default().push((*ok, *duration));
	}
	by_check
		.into_iter()
		.filter_map(|(check, rounds)| Some((check.to_owned(), summarize(&rounds)?)))
		.collect()
}

/// The buckets of `grain` ready to summarize, from `cursor` -- the first not yet summarized -- up
/// to what has settled by `now`, at most `most` of them. Never older than the grain's window: a
/// bucket past it would be deleted as it was written.
pub fn ready(grain: Grain, cursor: i64, window: i64, now: i64, most: usize) -> Vec<i64> {
	let oldest = bucket_start(now - window, grain) + grain.length();
	let mut start = bucket_start(cursor.max(oldest), grain);
	let mut buckets = Vec::new();
	while start + grain.length() + SETTLE <= now && buckets.len() < most {
		buckets.push(start);
		start += grain.length();
	}
	buckets
}

/// How long each grain is kept now: its window, or less once the budget has shortened it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Windows {
	kept: [i64; 5],
}

impl Default for Windows {
	fn default() -> Self {
		Self { kept: Grain::ALL.map(Grain::window) }
	}
}

impl Windows {
	pub fn of(&self, grain: Grain) -> i64 {
		self.kept[grain.index()]
	}

	/// Shorten the coarsest window that is still longer than the one finer than it -- the
	/// oldest buckets of the coarsest grain go first -- by a tenth of its own window, and never
	/// below that finer one; the finest never below the raw rounds' ten minutes. Answers which
	/// grain was shortened, or `None` when every window is as short as it may be.
	pub fn shorten(&mut self) -> Option<Grain> {
		for grain in Grain::ALL.into_iter().rev() {
			let index = grain.index();
			let floor = if index == 0 { RAW_WINDOW } else { self.kept[index - 1] };
			if self.kept[index] > floor {
				let step = (grain.window() / 10).max(grain.length());
				self.kept[index] = (self.kept[index] - step).max(floor);
				return Some(grain);
			}
		}
		None
	}
}

/// Whether the tables have grown past the budget, as the budget reads it: past both the budget
/// and the size measured when a window was last shortened. Postgres reuses what a delete frees
/// rather than handing it back, so a size that stays put after shortening is the budget holding,
/// and shortening again on it would take every window to nothing. See
/// spec/architecture/probe.md, "Where the results go".
pub fn over_budget(size: u64, budget: u64, shortened_at: Option<u64>) -> bool {
	size > budget.max(shortened_at.unwrap_or(0))
}

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn a_bucket_counts_passes_and_failures_and_takes_median_and_worst() {
		let rounds = [(true, 30), (false, 900), (true, 10), (true, 20)];
		let summary = summarize(&rounds).unwrap();
		assert_eq!(summary, Summary { passed: 3, failed: 1, median_ms: 20, worst_ms: 900 });
		let odd = summarize(&[(true, 5), (true, 1), (true, 3)]).unwrap();
		assert_eq!((odd.median_ms, odd.worst_ms), (3, 5));
		assert_eq!(summarize(&[]), None);
	}

	#[test]
	fn rounds_of_many_checks_are_summarized_apart() {
		let rounds =
			[("a".to_owned(), true, 10), ("b".to_owned(), false, 50), ("a".to_owned(), false, 30)];
		let each = summarize_each(&rounds);
		assert_eq!(each["a"], Summary { passed: 1, failed: 1, median_ms: 10, worst_ms: 30 });
		assert_eq!(each["b"], Summary { passed: 0, failed: 1, median_ms: 50, worst_ms: 50 });
	}

	#[test]
	fn buckets_are_aligned_to_the_epoch() {
		let at = 7 * HOUR + 17 * MINUTE + 5_000;
		assert_eq!(bucket_start(at, Grain::Minute), 7 * HOUR + 17 * MINUTE);
		assert_eq!(bucket_start(at, Grain::Five), 7 * HOUR + 15 * MINUTE);
		assert_eq!(bucket_start(at, Grain::Thirty), 7 * HOUR);
		assert_eq!(bucket_start(at, Grain::Hour), 7 * HOUR);
	}

	#[test]
	fn a_bucket_is_ready_once_settled_and_never_past_its_window() {
		let now = 10 * DAY + 10 * MINUTE;
		let ready_now = ready(Grain::Minute, now - 10 * MINUTE, DAY, now, 100);
		// 10:00 to 10:07 have ended two minutes ago or more; 10:08 has not settled.
		assert_eq!(ready_now.len(), 8);
		assert_eq!(ready_now[0], now - 10 * MINUTE);
		assert_eq!(*ready_now.last().unwrap(), now - 3 * MINUTE);
		assert_eq!(ready(Grain::Minute, now - 10 * MINUTE, DAY, now, 3).len(), 3);
		// A cursor from long ago starts at the window's edge, not at the cursor.
		let from_zero = ready(Grain::Hour, 0, DAY, now, 1000);
		assert_eq!(from_zero[0], now - 10 * MINUTE - DAY + HOUR);
		assert!(ready(Grain::Hour, now, DAY, now, 1000).is_empty());
	}

	#[test]
	fn the_coarsest_window_is_shortened_first_and_none_below_the_finer() {
		let mut windows = Windows::default();
		assert_eq!(windows.shorten(), Some(Grain::Hour));
		assert_eq!(windows.of(Grain::Hour), 365 * DAY - 365 * DAY / 10);
		// The hour's window comes down to the thirty minutes' three months, then that one starts.
		let mut shortened = vec![];
		while let Some(grain) = windows.shorten() {
			shortened.push(grain);
			if grain != Grain::Hour {
				break;
			}
		}
		assert_eq!(windows.of(Grain::Hour), 90 * DAY);
		assert_eq!(shortened.last(), Some(&Grain::Thirty));
		// All the way down, every window ends at the one finer than it, and the finest at ten minutes.
		while windows.shorten().is_some() {}
		for grain in Grain::ALL {
			assert_eq!(windows.of(grain), RAW_WINDOW);
		}
	}

	#[test]
	fn the_budget_is_over_only_while_the_size_grows_past_it() {
		assert!(!over_budget(BUDGET, BUDGET, None));
		assert!(over_budget(BUDGET + 1, BUDGET, None));
		// Shortened at 310 MB: holding there is the budget working; growing past it is not.
		assert!(!over_budget(310_000_000, BUDGET, Some(310_000_000)));
		assert!(over_budget(311_000_000, BUDGET, Some(310_000_000)));
	}
}
