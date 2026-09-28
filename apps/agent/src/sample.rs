//! Two readings made into one sample: counters become percentages and rates, gauges are taken from
//! the later one. A sample is flat, one number per named metric, so keeping and summarizing them
//! is the same work whatever they measure. See spec/architecture/agent.md, "Metrics".

use crate::probe::{Reading, Times};
use std::collections::BTreeMap;

/// A metric's name to its value, in the units spec/architecture/agent.md lists.
pub type Values = BTreeMap<String, f64>;

#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct Sample {
	/// Whole seconds since the epoch.
	pub at: i64,
	pub values: Values,
}

/// Share of the ticks between two readings that `part` took, as a percentage.
fn share(part: impl Fn(&Times) -> u64, earlier: &Times, later: &Times) -> f64 {
	let total = later.total.saturating_sub(earlier.total);
	if total == 0 {
		return 0.0;
	}
	part(later).saturating_sub(part(earlier)) as f64 * 100.0 / total as f64
}

/// Per second, from two counters; a counter that went backwards was reset and says nothing.
fn rate(earlier: u64, later: u64, seconds: f64) -> f64 {
	if seconds <= 0.0 { 0.0 } else { later.saturating_sub(earlier) as f64 / seconds }
}

pub fn between(earlier: &Reading, later: &Reading) -> Sample {
	let mut values = Values::new();
	let mut put = |name: String, value: f64| {
		values.insert(name, value);
	};
	let seconds = later.at - earlier.at;

	put("cpu.usage".into(), share(|t| t.busy, &earlier.cpu, &later.cpu));
	put("cpu.iowait".into(), share(|t| t.iowait, &earlier.cpu, &later.cpu));
	for (core, (before, after)) in earlier.cores.iter().zip(&later.cores).enumerate() {
		put(format!("cpu.core.{core}.usage"), share(|t| t.busy, before, after));
	}
	for (first, frequency) in &later.frequencies {
		put(format!("cpu.frequency.{first}"), *frequency);
	}
	for (window, load) in ["1", "5", "15"].iter().zip(later.load) {
		put(format!("load.{window}"), load);
	}

	let memory = later.memory;
	put("memory.used".into(), memory.total.saturating_sub(memory.available) as f64);
	put("memory.cached".into(), memory.cached as f64);
	put("swap.used".into(), memory.swap_total.saturating_sub(memory.swap_free) as f64);

	for (zone, degrees) in &later.temperatures {
		put(format!("temperature.{zone}"), *degrees);
	}

	put("network.received".into(), rate(earlier.network.inbound, later.network.inbound, seconds));
	put("network.sent".into(), rate(earlier.network.outbound, later.network.outbound, seconds));
	put("disk.read".into(), rate(earlier.disk.inbound, later.disk.inbound, seconds));
	put("disk.written".into(), rate(earlier.disk.outbound, later.disk.outbound, seconds));
	if let Some(storage) = later.storage {
		put("storage.used".into(), storage.used as f64);
	}

	Sample { at: later.at.floor() as i64, values }
}

#[cfg(test)]
mod tests {
	use super::*;
	use crate::probe::{reading_at, tests::machine};

	const LATER: &str = "cpu  250 0 100 1500 150 0 0 0 0 0
cpu0 160 0 40 720 100 0 0 0 0 0
cpu1 90 0 60 700 50 0 0 0 0 0
btime 1780000000
";

	#[test]
	fn turns_counters_into_shares_and_rates() {
		let (_root, roots) = machine(crate::probe::tests::STAT);
		let earlier = reading_at(&roots, 100.0);
		let mut later = reading_at(&roots, 102.0);
		std::fs::write(roots.proc.join("stat"), LATER).unwrap();
		later.cpu = reading_at(&roots, 102.0).cpu;
		later.cores = reading_at(&roots, 102.0).cores;
		later.network.inbound += 4000;
		later.disk.outbound += 1024;

		let sample = between(&earlier, &later);
		let value = |name: &str| sample.values[name];
		assert_eq!(sample.at, 102);
		// 1000 ticks passed; 200 busy (user 150, system 50) and 100 waiting.
		assert_eq!(value("cpu.usage"), 20.0);
		assert_eq!(value("cpu.iowait"), 10.0);
		// cpu0: 520 ticks, 120 busy.
		assert!((value("cpu.core.0.usage") - 120.0 * 100.0 / 520.0).abs() < 1e-9);
		assert_eq!(value("cpu.frequency.0"), 1800.0);
		assert_eq!(value("network.received"), 2000.0);
		assert_eq!(value("disk.written"), 512.0);
		assert_eq!(value("memory.used"), 2_000_000.0 * 1024.0);
		assert_eq!(value("swap.used"), 250_000.0 * 1024.0);
		assert_eq!(value("temperature.soc"), 45.0);
		assert_eq!(value("load.15"), 0.1);
		assert!(sample.values.contains_key("storage.used"));
	}

	#[test]
	fn a_reset_or_a_stopped_clock_reads_as_zero() {
		let (_root, roots) = machine(crate::probe::tests::STAT);
		let earlier = reading_at(&roots, 100.0);
		let mut later = earlier.clone();
		later.network.inbound = 0;
		let sample = between(&earlier, &later);
		assert_eq!(sample.values["cpu.usage"], 0.0);
		assert_eq!(sample.values["network.received"], 0.0);
	}
}
