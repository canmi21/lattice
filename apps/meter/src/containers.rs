//! What each container is doing, read from its cgroup and its network namespace. The meter has no
//! Docker socket, so which container is which app comes from host, which writes `containers.json`
//! into the meter's directory. See spec/architecture/meter.md, "Each container".

use crate::probe::{self, Roots};
use crate::sample::{Sample, Values};
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::time::SystemTime;

/// The file host keeps in the meter's directory: every container's id to its name.
pub const NAMES: &str = "containers.json";

/// A container's counters at one moment, as the kernel keeps them.
#[derive(Debug, Clone, Copy, Default, PartialEq)]
pub struct Counters {
	/// Microseconds of processor time, over every core.
	pub cpu: u64,
	/// Bytes in use: what the cgroup holds, less the page cache it could give back at once.
	pub memory: u64,
	pub read: u64,
	pub written: u64,
	pub received: u64,
	pub sent: u64,
}

/// Every container's counters at one moment, by name.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct Reading {
	pub at: f64,
	pub containers: BTreeMap<String, Counters>,
}

/// Which container is which, read again only when host has written the file since.
#[derive(Debug, Default)]
pub struct Names {
	path: PathBuf,
	written: Option<SystemTime>,
	by_id: BTreeMap<String, String>,
}

impl Names {
	pub fn at(directory: &Path) -> Self {
		Self { path: directory.join(NAMES), ..Self::default() }
	}

	/// The names as the file says now; the last ones read while it cannot be.
	pub fn current(&mut self) -> &BTreeMap<String, String> {
		let written = std::fs::metadata(&self.path).and_then(|meta| meta.modified()).ok();
		if written.is_some() && written != self.written {
			let read = std::fs::read(&self.path).ok();
			if let Some(by_id) = read.and_then(|bytes| serde_json::from_slice(&bytes).ok()) {
				self.by_id = by_id;
				self.written = written;
			}
		}
		&self.by_id
	}
}

fn field(text: &str, name: &str) -> Option<u64> {
	text.lines().find_map(|line| line.strip_prefix(name)?.strip_prefix(' ')?.trim().parse().ok())
}

/// Bytes read and written over every device, from a cgroup's `io.stat`.
fn io(stat: &str) -> (u64, u64) {
	let mut totals = (0, 0);
	for pair in stat.split_whitespace() {
		let Some((key, value)) = pair.split_once('=') else { continue };
		let value: u64 = value.parse().unwrap_or(0);
		match key {
			"rbytes" => totals.0 += value,
			"wbytes" => totals.1 += value,
			_ => {}
		}
	}
	totals
}

/// Where Docker's systemd driver keeps a container's cgroup.
pub fn cgroup(roots: &Roots, id: &str) -> PathBuf {
	roots.sys.join("fs/cgroup/system.slice").join(format!("docker-{id}.scope"))
}

/// One container's counters; none when it is not running.
pub fn counters(roots: &Roots, id: &str) -> Option<Counters> {
	let directory = cgroup(roots, id);
	let read = |name: &str| std::fs::read_to_string(directory.join(name)).ok();
	let cpu = field(&read("cpu.stat")?, "usage_usec")?;
	let current: u64 = read("memory.current")?.trim().parse().ok()?;
	let inactive = read("memory.stat").and_then(|stat| field(&stat, "inactive_file")).unwrap_or(0);
	let (read_bytes, written) = read("io.stat").map_or((0, 0), |stat| io(&stat));
	// Any process of it sees its network; one with no network of its own counts none.
	let pid = read("cgroup.procs").and_then(|procs| procs.lines().next().map(str::to_owned));
	let traffic = pid
		.and_then(|pid| std::fs::read_to_string(roots.proc.join(pid).join("net/dev")).ok())
		.map(|dev| probe::network(&dev))
		.unwrap_or_default();
	Some(Counters {
		cpu,
		memory: current.saturating_sub(inactive),
		read: read_bytes,
		written,
		received: traffic.inbound,
		sent: traffic.outbound,
	})
}

pub fn reading_at(roots: &Roots, names: &BTreeMap<String, String>, at: f64) -> Reading {
	let containers =
		names.iter().filter_map(|(id, name)| Some((name.clone(), counters(roots, id)?))).collect();
	Reading { at, containers }
}

/// Per second, from two counters; a counter that went backwards was reset and says nothing.
fn rate(earlier: u64, later: u64, seconds: f64) -> f64 {
	if seconds <= 0.0 { 0.0 } else { later.saturating_sub(earlier) as f64 / seconds }
}

/// Two readings made into one sample, `<name>.<metric>` for every container in both. Processor time
/// is a share of the whole machine, `cores` of them, as `cpu.usage` is.
pub fn between(earlier: &Reading, later: &Reading, cores: usize) -> Sample {
	let seconds = later.at - earlier.at;
	let mut values = Values::new();
	for (name, after) in &later.containers {
		let Some(before) = earlier.containers.get(name) else { continue };
		let available = seconds * 1_000_000.0 * cores.max(1) as f64;
		let cpu = if available > 0.0 {
			after.cpu.saturating_sub(before.cpu) as f64 * 100.0 / available
		} else {
			0.0
		};
		let mut put = |metric: &str, value: f64| {
			values.insert(format!("{name}.{metric}"), value);
		};
		put("cpu", cpu);
		put("memory", after.memory as f64);
		put("disk.read", rate(before.read, after.read, seconds));
		put("disk.written", rate(before.written, after.written, seconds));
		put("network.received", rate(before.received, after.received, seconds));
		put("network.sent", rate(before.sent, after.sent, seconds));
	}
	Sample { at: later.at.floor() as i64, values }
}

#[cfg(test)]
mod tests {
	use super::*;

	const ID: &str = "b9252dde2ee1";

	fn container(roots: &Roots, cpu: u64, rbytes: u64, received: u64) {
		let directory = cgroup(roots, ID);
		std::fs::create_dir_all(&directory).unwrap();
		std::fs::write(directory.join("cpu.stat"), format!("usage_usec {cpu}\nuser_usec 1\n")).unwrap();
		std::fs::write(directory.join("memory.current"), "452694016\n").unwrap();
		std::fs::write(directory.join("memory.stat"), "anon 1\nfile 3\ninactive_file 2694016\n")
			.unwrap();
		std::fs::write(
			directory.join("io.stat"),
			format!("259:0 rbytes={rbytes} wbytes=512 rios=1 wios=1\n8:0 rbytes=0 wbytes=512\n"),
		)
		.unwrap();
		std::fs::write(directory.join("cgroup.procs"), "4242\n4243\n").unwrap();
		let net = roots.proc.join("4242/net");
		std::fs::create_dir_all(&net).unwrap();
		std::fs::write(
			net.join("dev"),
			format!(
				"Inter-|\n face |\n    lo: 99 0 0 0 0 0 0 0 99 0 0 0 0 0 0 0\n  eth0: {received} 1 0 0 0 0 0 0 3943 42 0 0 0 0 0 0\n"
			),
		)
		.unwrap();
	}

	#[test]
	fn reads_a_containers_cgroup_and_network_into_a_share_and_rates() {
		let root = tempfile::tempdir().unwrap();
		let roots =
			Roots { proc: root.path().join("proc"), sys: root.path().join("sys"), storage: None };
		let names = BTreeMap::from([(ID.to_owned(), "geo".to_owned()), ("gone".into(), "old".into())]);
		container(&roots, 1_000_000, 0, 7000);
		let earlier = reading_at(&roots, &names, 100.0);
		// A container that is not running is left out rather than read as nothing.
		assert_eq!(earlier.containers.keys().collect::<Vec<_>>(), ["geo"]);
		assert_eq!(earlier.containers["geo"].memory, 450_000_000);
		assert_eq!(earlier.containers["geo"].written, 1024);
		container(&roots, 3_000_000, 4096, 9000);
		let later = reading_at(&roots, &names, 102.0);

		let sample = between(&earlier, &later, 8);
		// Two seconds of processor time over two seconds of eight cores.
		assert_eq!(sample.values["geo.cpu"], 12.5);
		assert_eq!(sample.values["geo.memory"], 450_000_000.0);
		assert_eq!(sample.values["geo.disk.read"], 2048.0);
		assert_eq!(sample.values["geo.disk.written"], 0.0);
		assert_eq!(sample.values["geo.network.received"], 1000.0);
		assert_eq!(sample.values.len(), 6);
	}

	#[test]
	fn reads_the_names_again_only_once_host_has_written_them() {
		let root = tempfile::tempdir().unwrap();
		let mut names = Names::at(root.path());
		assert!(names.current().is_empty());
		std::fs::write(root.path().join(NAMES), r#"{"abc":"geo"}"#).unwrap();
		assert_eq!(names.current()["abc"], "geo");
		// Half a file, as a write in progress might look: the last good names stand.
		std::fs::write(root.path().join(NAMES), r#"{"abc":"#).unwrap();
		assert_eq!(names.current()["abc"], "geo");
	}
}
