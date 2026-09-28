//! What the machine is doing, read from /proc and /sys as counters and gauges. Turning two readings
//! into rates is `sample`'s; this only reads. See spec/architecture/agent.md.

use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

/// Where the kernel's files are, which a test points at a directory of its own.
#[derive(Debug, Clone)]
pub struct Roots {
	pub proc: PathBuf,
	pub sys: PathBuf,
	/// A path on the filesystem whose use is reported as storage; none reports none.
	pub storage: Option<PathBuf>,
}

impl Roots {
	/// The machine's, at `AGENT_PROC` and `AGENT_SYS` where the observer shape mounts them, and at
	/// their usual places without.
	pub fn system(storage: Option<PathBuf>) -> Self {
		let at = |name: &str, default: &str| {
			std::env::var_os(name).map_or_else(|| PathBuf::from(default), PathBuf::from)
		};
		Self { proc: at("AGENT_PROC", "/proc"), sys: at("AGENT_SYS", "/sys"), storage }
	}
}

/// A processor's time since boot, in the kernel's ticks: what was busy, what waited on a disk, all.
#[derive(Debug, Clone, Copy, Default, PartialEq)]
pub struct Times {
	pub busy: u64,
	pub iowait: u64,
	pub total: u64,
}

#[derive(Debug, Clone, Copy, Default, PartialEq)]
pub struct Memory {
	pub total: u64,
	pub available: u64,
	pub cached: u64,
	pub swap_total: u64,
	pub swap_free: u64,
}

/// Bytes moved since boot, one way and the other.
#[derive(Debug, Clone, Copy, Default, PartialEq)]
pub struct Traffic {
	pub inbound: u64,
	pub outbound: u64,
}

#[derive(Debug, Clone, Copy, Default, PartialEq)]
pub struct Storage {
	pub total: u64,
	pub used: u64,
}

/// Everything read at one moment. Counters only mean something against an earlier reading.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct Reading {
	/// Seconds since the epoch, with the fraction, so a rate divides by the time that passed.
	pub at: f64,
	pub cpu: Times,
	/// Indexed by the kernel's number for the core.
	pub cores: Vec<Times>,
	/// MHz, per cluster, named by the cluster's first core.
	pub frequencies: Vec<(usize, f64)>,
	pub load: [f64; 3],
	pub memory: Memory,
	/// Degrees Celsius, per thermal zone, named by its type.
	pub temperatures: Vec<(String, f64)>,
	pub network: Traffic,
	/// `inbound` is what was read, `outbound` what was written.
	pub disk: Traffic,
	pub storage: Option<Storage>,
}

/// What does not change while the machine is up.
#[derive(Debug, Clone, Default, PartialEq, serde::Serialize)]
pub struct Info {
	pub model: Option<String>,
	pub kernel: Option<String>,
	pub cores: usize,
	/// The cores that share a clock, which cpufreq calls a policy.
	pub clusters: Vec<Cluster>,
	pub memory: u64,
	pub swap: u64,
	/// Bytes, of the filesystem the agent's directory is on.
	pub storage: Option<u64>,
	/// Seconds since the epoch.
	pub booted: Option<u64>,
}

/// Cores that run at one frequency, because cpufreq sets it for all of them at once: a big or a
/// little cluster on a phone-class board, every core on most others. Read once per cluster, since a
/// frequency read per core would be the same number several times over.
#[derive(Debug, Clone, Default, PartialEq, serde::Serialize)]
pub struct Cluster {
	pub cores: Vec<usize>,
	/// MHz at most.
	pub max_frequency: Option<f64>,
	#[serde(skip)]
	directory: PathBuf,
}

fn read(path: impl AsRef<Path>) -> Option<String> {
	std::fs::read_to_string(path).ok()
}

/// The whole-machine line and one per core from /proc/stat, the core's number with it.
pub fn cpu_times(stat: &str) -> (Times, Vec<(usize, Times)>) {
	let mut all = Times::default();
	let mut cores = Vec::new();
	for line in stat.lines() {
		let mut fields = line.split_whitespace();
		let Some(label) = fields.next().and_then(|label| label.strip_prefix("cpu")) else { continue };
		// user nice system idle iowait irq softirq steal; guest time is already inside user.
		let ticks: Vec<u64> = fields.take(8).filter_map(|field| field.parse().ok()).collect();
		if ticks.len() < 5 {
			continue;
		}
		let total: u64 = ticks.iter().sum();
		let times = Times { busy: total - ticks[3] - ticks[4], iowait: ticks[4], total };
		match label {
			"" => all = times,
			number => {
				if let Ok(number) = number.parse() {
					cores.push((number, times));
				}
			}
		}
	}
	(all, cores)
}

/// Boot time, from the `btime` line of /proc/stat.
pub fn booted(stat: &str) -> Option<u64> {
	stat.lines().find_map(|line| line.strip_prefix("btime ")?.trim().parse().ok())
}

pub fn memory(meminfo: &str) -> Memory {
	let field = |name: &str| -> u64 {
		meminfo
			.lines()
			.find_map(|line| {
				let rest = line.strip_prefix(name)?.strip_prefix(':')?;
				rest.split_whitespace().next()?.parse::<u64>().ok()
			})
			.map_or(0, |kib| kib * 1024)
	};
	Memory {
		total: field("MemTotal"),
		available: field("MemAvailable"),
		cached: field("Cached") + field("Buffers"),
		swap_total: field("SwapTotal"),
		swap_free: field("SwapFree"),
	}
}

pub fn load(loadavg: &str) -> [f64; 3] {
	let mut fields = loadavg.split_whitespace().map(|field| field.parse().unwrap_or(0.0));
	[(); 3].map(|()| fields.next().unwrap_or(0.0))
}

/// Interfaces that carry what another already counted, or nothing that left the machine.
const VIRTUAL: [&str; 7] = ["lo", "veth", "docker", "br-", "tailscale", "tun", "wg"];

/// Bytes received and sent by the machine's own interfaces, from /proc/net/dev.
pub fn network(dev: &str) -> Traffic {
	let mut traffic = Traffic::default();
	for line in dev.lines().skip(2) {
		let Some((name, counters)) = line.split_once(':') else { continue };
		if VIRTUAL.iter().any(|prefix| name.trim().starts_with(prefix)) {
			continue;
		}
		let counters: Vec<u64> = counters.split_whitespace().filter_map(|n| n.parse().ok()).collect();
		if counters.len() >= 9 {
			traffic.inbound += counters[0];
			traffic.outbound += counters[8];
		}
	}
	traffic
}

/// Bytes read and written by whole disks, from /proc/diskstats. `disks` names which devices are
/// disks rather than partitions of one, which /sys/block knows; sectors there are always 512 bytes.
pub fn disk(diskstats: &str, disks: &[String]) -> Traffic {
	let mut traffic = Traffic::default();
	for line in diskstats.lines() {
		let fields: Vec<&str> = line.split_whitespace().collect();
		if fields.len() < 10 || !disks.iter().any(|disk| disk == fields[2]) {
			continue;
		}
		let sectors = |index: usize| fields[index].parse::<u64>().unwrap_or(0) * 512;
		traffic.inbound += sectors(5);
		traffic.outbound += sectors(9);
	}
	traffic
}

/// A thermal zone's type as a metric's name: `soc-thermal` is `soc`.
pub fn zone_name(kind: &str) -> String {
	let kind = kind.trim().to_ascii_lowercase();
	let kind = kind.strip_suffix("-thermal").or(kind.strip_suffix("_thermal")).unwrap_or(&kind);
	kind.chars().map(|c| if c.is_ascii_alphanumeric() { c } else { '-' }).collect()
}

/// Files under a directory whose names start with `prefix`, in order.
fn entries(directory: &Path, prefix: &str) -> Vec<(String, PathBuf)> {
	let mut found: Vec<(String, PathBuf)> = std::fs::read_dir(directory)
		.into_iter()
		.flatten()
		.flatten()
		.filter_map(|entry| {
			let name = entry.file_name().into_string().ok()?;
			name.starts_with(prefix).then(|| (name, entry.path()))
		})
		.collect();
	found.sort();
	found
}

fn temperatures(sys: &Path) -> Vec<(String, f64)> {
	let mut zones: Vec<(String, f64)> = Vec::new();
	for (_, zone) in entries(&sys.join("class/thermal"), "thermal_zone") {
		let (Some(kind), Some(temp)) = (read(zone.join("type")), read(zone.join("temp"))) else {
			continue;
		};
		let Ok(millidegrees) = temp.trim().parse::<f64>() else { continue };
		let mut name = zone_name(&kind);
		if zones.iter().any(|(taken, _)| *taken == name) {
			name = format!("{name}-{}", zones.len());
		}
		zones.push((name, millidegrees / 1000.0));
	}
	zones
}

/// A cpufreq file's kHz, as MHz.
fn megahertz(path: PathBuf) -> Option<f64> {
	read(path)?.trim().parse::<f64>().ok().map(|khz| khz / 1000.0)
}

/// A kernel list of cores, `0 1 2 3` or `0-3,6`, as their numbers.
pub fn core_list(text: &str) -> Vec<usize> {
	text
		.split(|c: char| c.is_whitespace() || c == ',')
		.filter(|part| !part.is_empty())
		.flat_map(|part| match part.split_once('-') {
			Some((from, to)) => match (from.parse::<usize>(), to.parse::<usize>()) {
				(Ok(from), Ok(to)) => (from..=to).collect(),
				_ => Vec::new(),
			},
			None => part.parse().ok().into_iter().collect(),
		})
		.collect()
}

/// The machine's clusters, from cpufreq's policies; each core its own where there are none, as on
/// an older kernel, and none where there is no cpufreq at all.
fn clusters(sys: &Path, numbers: &[usize]) -> Vec<Cluster> {
	let cpu = sys.join("devices/system/cpu");
	let mut found: Vec<Cluster> = entries(&cpu.join("cpufreq"), "policy")
		.into_iter()
		.filter_map(|(_, directory)| {
			let cores = core_list(&read(directory.join("related_cpus"))?);
			(!cores.is_empty()).then(|| Cluster {
				max_frequency: megahertz(directory.join("cpuinfo_max_freq")),
				cores,
				directory,
			})
		})
		.collect();
	if found.is_empty() {
		found = numbers
			.iter()
			.map(|&core| (core, cpu.join(format!("cpu{core}/cpufreq"))))
			.filter(|(_, directory)| directory.is_dir())
			.map(|(core, directory)| Cluster {
				cores: vec![core],
				max_frequency: megahertz(directory.join("cpuinfo_max_freq")),
				directory,
			})
			.collect();
	}
	found.sort_by_key(|cluster| cluster.cores.first().copied());
	found
}

fn storage(path: &Path) -> Option<Storage> {
	let stat = rustix::fs::statvfs(path).ok()?;
	let block = stat.f_frsize;
	let total = stat.f_blocks * block;
	Some(Storage { total, used: total - stat.f_bfree * block })
}

/// Cores in their kernel order, with their times; a core missing from the numbering is left out.
fn ordered(cores: Vec<(usize, Times)>) -> (Vec<usize>, Vec<Times>) {
	let mut cores = cores;
	cores.sort_by_key(|(number, _)| *number);
	cores.into_iter().unzip()
}

pub fn reading(roots: &Roots) -> Reading {
	let at = SystemTime::now().duration_since(UNIX_EPOCH).map_or(0.0, |since| since.as_secs_f64());
	reading_at(roots, at)
}

pub fn reading_at(roots: &Roots, at: f64) -> Reading {
	let (cpu, cores) = cpu_times(&read(roots.proc.join("stat")).unwrap_or_default());
	let (numbers, cores) = ordered(cores);
	let disks: Vec<String> = entries(&roots.sys.join("block"), "")
		.into_iter()
		.map(|(name, _)| name)
		.filter(|name| !["loop", "ram", "zram"].iter().any(|prefix| name.starts_with(prefix)))
		.collect();
	Reading {
		at,
		cpu,
		frequencies: clusters(&roots.sys, &numbers)
			.into_iter()
			.filter_map(|cluster| {
				let now = megahertz(cluster.directory.join("scaling_cur_freq"))?;
				Some((*cluster.cores.first()?, now))
			})
			.collect(),
		cores,
		load: load(&read(roots.proc.join("loadavg")).unwrap_or_default()),
		memory: memory(&read(roots.proc.join("meminfo")).unwrap_or_default()),
		temperatures: temperatures(&roots.sys),
		// PID 1's rather than our own: this runs without a network, and with the machine's PIDs,
		// so the first process is the machine's and so is its network namespace.
		network: network(&read(roots.proc.join("1/net/dev")).unwrap_or_default()),
		disk: disk(&read(roots.proc.join("diskstats")).unwrap_or_default(), &disks),
		storage: roots.storage.as_deref().and_then(storage),
	}
}

pub fn info(roots: &Roots) -> Info {
	let stat = read(roots.proc.join("stat")).unwrap_or_default();
	let (numbers, _) = ordered(cpu_times(&stat).1);
	let memory = memory(&read(roots.proc.join("meminfo")).unwrap_or_default());
	let text = |path: PathBuf| {
		read(path).map(|text| text.trim_matches(|c: char| c == '\0' || c.is_whitespace()).to_owned())
	};
	Info {
		model: text(roots.sys.join("firmware/devicetree/base/model")),
		kernel: text(roots.proc.join("sys/kernel/osrelease")),
		cores: numbers.len(),
		clusters: clusters(&roots.sys, &numbers),
		memory: memory.total,
		swap: memory.swap_total,
		storage: roots.storage.as_deref().and_then(storage).map(|storage| storage.total),
		booted: booted(&stat),
	}
}

#[cfg(test)]
pub mod tests {
	use super::*;

	pub const STAT: &str = "cpu  100 0 50 800 50 0 0 0 0 0
cpu0 60 0 20 400 20 0 0 0 0 0
cpu1 40 0 30 400 30 0 0 0 0 0
intr 12345
btime 1780000000
";

	pub const MEMINFO: &str = "MemTotal:        8000000 kB
MemFree:         1000000 kB
MemAvailable:    6000000 kB
Buffers:          100000 kB
Cached:          2000000 kB
SwapCached:            0 kB
SwapTotal:       1000000 kB
SwapFree:         750000 kB
";

	pub const NET_DEV: &str = "Inter-|   Receive                                                |  Transmit
 face |bytes    packets errs drop fifo frame compressed multicast|bytes    packets errs drop fifo colls carrier compressed
    lo: 9999 10 0 0 0 0 0 0 9999 10 0 0 0 0 0 0
  eth0: 1000 10 0 0 0 0 0 0 2000 20 0 0 0 0 0 0
  eth1: 500 5 0 0 0 0 0 0 100 1 0 0 0 0 0 0
veth12ab: 7777 1 0 0 0 0 0 0 7777 1 0 0 0 0 0 0
";

	pub const DISKSTATS: &str = " 179 0 mmcblk0 10 0 100 0 20 0 200 0 0 0 0
 179 1 mmcblk0p1 10 0 100 0 20 0 200 0 0 0 0
 259 0 nvme0n1 1 0 8 0 2 0 16 0 0 0 0
   7 0 loop0 5 0 50 0 0 0 0 0 0 0 0
";

	/// A /proc and /sys holding what the tests below read, as a node's would.
	pub fn machine(stat: &str) -> (tempfile::TempDir, Roots) {
		let root = tempfile::tempdir().unwrap();
		let proc = root.path().join("proc");
		let sys = root.path().join("sys");
		let write = |path: PathBuf, text: &str| {
			std::fs::create_dir_all(path.parent().unwrap()).unwrap();
			std::fs::write(path, text).unwrap();
		};
		write(proc.join("stat"), stat);
		write(proc.join("meminfo"), MEMINFO);
		write(proc.join("loadavg"), "0.50 0.25 0.10 1/200 4242\n");
		write(proc.join("1/net/dev"), NET_DEV);
		write(proc.join("diskstats"), DISKSTATS);
		write(proc.join("sys/kernel/osrelease"), "6.1.99\n");
		write(sys.join("firmware/devicetree/base/model"), "FriendlyElec NanoPi M5\0");
		// Two cores that share one clock, as a policy; each also has the per-core directory an
		// older kernel offers alone.
		let policy = sys.join("devices/system/cpu/cpufreq/policy0");
		write(policy.join("related_cpus"), "0 1\n");
		write(policy.join("scaling_cur_freq"), "1800000\n");
		write(policy.join("cpuinfo_max_freq"), "2400000\n");
		for (core, (now, max)) in [(0, (1_800_000, 1_800_000)), (1, (408_000, 2_400_000))] {
			let cpufreq = sys.join(format!("devices/system/cpu/cpu{core}/cpufreq"));
			write(cpufreq.join("scaling_cur_freq"), &format!("{now}\n"));
			write(cpufreq.join("cpuinfo_max_freq"), &format!("{max}\n"));
		}
		for (zone, kind, temp) in [(0, "soc-thermal", "45000"), (1, "gpu-thermal", "41500")] {
			write(sys.join(format!("class/thermal/thermal_zone{zone}/type")), kind);
			write(sys.join(format!("class/thermal/thermal_zone{zone}/temp")), temp);
		}
		for disk in ["mmcblk0", "nvme0n1", "loop0"] {
			std::fs::create_dir_all(sys.join("block").join(disk)).unwrap();
		}
		let roots = Roots { proc, sys, storage: Some(root.path().to_owned()) };
		(root, roots)
	}

	#[test]
	fn reads_processor_times() {
		let (all, cores) = cpu_times(STAT);
		assert_eq!(all, Times { busy: 150, iowait: 50, total: 1000 });
		assert_eq!(cores[1], (1, Times { busy: 70, iowait: 30, total: 500 }));
		assert_eq!(booted(STAT), Some(1_780_000_000));
	}

	#[test]
	fn reads_memory_in_bytes() {
		let memory = memory(MEMINFO);
		assert_eq!(memory.total, 8_000_000 * 1024);
		assert_eq!(memory.available, 6_000_000 * 1024);
		assert_eq!(memory.cached, 2_100_000 * 1024);
		assert_eq!(memory.swap_total - memory.swap_free, 250_000 * 1024);
	}

	#[test]
	fn counts_only_interfaces_that_leave_the_machine() {
		assert_eq!(network(NET_DEV), Traffic { inbound: 1500, outbound: 2100 });
	}

	#[test]
	fn counts_whole_disks_once() {
		let disks = ["mmcblk0".to_owned(), "nvme0n1".to_owned()];
		assert_eq!(disk(DISKSTATS, &disks), Traffic { inbound: 108 * 512, outbound: 216 * 512 });
	}

	#[test]
	fn names_zones_as_metrics() {
		assert_eq!(zone_name("soc-thermal\n"), "soc");
		assert_eq!(zone_name("CPU Big_Core0"), "cpu-big-core0");
	}

	#[test]
	fn reads_a_whole_machine() {
		let (_root, roots) = machine(STAT);
		let reading = reading_at(&roots, 10.0);
		assert_eq!(reading.cores.len(), 2);
		assert_eq!(reading.frequencies, [(0, 1800.0)]);
		assert_eq!(reading.load, [0.5, 0.25, 0.1]);
		assert_eq!(reading.temperatures, [("soc".to_owned(), 45.0), ("gpu".to_owned(), 41.5)]);
		assert_eq!(reading.disk.inbound, 108 * 512);
		assert!(reading.storage.is_some_and(|storage| storage.total > 0));

		let info = info(&roots);
		assert_eq!(info.model.as_deref(), Some("FriendlyElec NanoPi M5"));
		assert_eq!(info.kernel.as_deref(), Some("6.1.99"));
		assert_eq!(info.cores, 2);
		assert_eq!(info.clusters.len(), 1);
		assert_eq!(
			(info.clusters[0].cores.clone(), info.clusters[0].max_frequency),
			(vec![0, 1], Some(2400.0))
		);
		assert_eq!(info.booted, Some(1_780_000_000));
		assert!(info.storage.is_some_and(|total| total > 0));
	}

	#[test]
	fn reads_a_list_of_cores_either_way_the_kernel_writes_it() {
		assert_eq!(core_list("0 1 2 3\n"), [0, 1, 2, 3]);
		assert_eq!(core_list("0-3,6"), [0, 1, 2, 3, 6]);
		assert!(core_list("").is_empty());
	}

	#[test]
	fn without_policies_each_core_is_its_own_cluster() {
		let (_root, roots) = machine(STAT);
		std::fs::remove_dir_all(roots.sys.join("devices/system/cpu/cpufreq")).unwrap();
		let reading = reading_at(&roots, 10.0);
		assert_eq!(reading.frequencies, [(0, 1800.0), (1, 408.0)]);
		let maxima: Vec<_> = info(&roots).clusters.iter().map(|c| c.max_frequency).collect();
		assert_eq!(maxima, [Some(1800.0), Some(2400.0)]);
	}

	#[test]
	fn a_missing_file_reads_as_nothing() {
		let roots = Roots { proc: "/nonexistent".into(), sys: "/nonexistent".into(), storage: None };
		let reading = reading_at(&roots, 1.0);
		assert!(reading.cores.is_empty() && reading.temperatures.is_empty());
		assert_eq!(info(&roots).cores, 0);
	}
}
