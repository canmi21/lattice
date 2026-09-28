//! `/api/inspect/kernel`: the kernel's recent memory kills, read from `/dev/kmsg` opened
//! non-blocking -- available to host because it runs privileged; see
//! spec/architecture/inspect.md.

use axum::http::StatusCode;
use axum::response::Response;
use serde::Serialize;
use std::io::Read;
use std::os::unix::fs::OpenOptionsExt;

/// Set by the kernel on an `open()` of a character device that should never block a read; see
/// `open(2)`. Hardcoded rather than reached for through `libc`, which host does not otherwise
/// depend on and does not own the `Cargo.toml` to add.
const O_NONBLOCK: i32 = 0o4000;

/// How many records one read of `/dev/kmsg` collects before it stops looking for more, bounding
/// the time this takes when the ring buffer is full.
const MOST_RECORDS: usize = 4000;

/// How many of the most recent kills are answered.
const MOST_KILLS: usize = 50;

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct Kill {
	pub task: String,
	pub pid: Option<i64>,
	/// The `cgroup` the kernel names the killed task under -- a container's id, when it is one.
	pub cgroup: Option<String>,
	/// Seconds since boot, as the kernel's own clock in `/dev/kmsg` gives it; there is no wall
	/// clock in a record to convert it with here.
	pub monotonic_seconds: f64,
}

#[derive(Debug, Serialize)]
pub struct Kernel {
	pub kills: Vec<Kill>,
	/// Set, with why, when `/dev/kmsg` could not be read at all.
	#[serde(skip_serializing_if = "Option::is_none")]
	pub unavailable: Option<String>,
}

/// One record's message, past its header, when it names an out-of-memory kill. The kernel's own
/// `oom-kill:` line carries `task`, `pid` and `task_memcg` as `key=value` pairs, which is more
/// reliable than parsing the free-text "Killed process" line beside it. Pure, so it is tested
/// without a kernel.
fn kill_from(record: &str) -> Option<Kill> {
	let (header, message) = record.split_once(';')?;
	if !message.contains("oom-kill:") {
		return None;
	}
	let monotonic_seconds = header.split(',').nth(2)?.parse::<f64>().ok()? / 1_000_000.0;
	let field = |key: &str| -> Option<&str> {
		message.split(',').find_map(|part| part.trim().strip_prefix(key)?.strip_prefix('='))
	};
	Some(Kill {
		task: field("task")?.trim_end().to_owned(),
		pid: field("pid").and_then(|pid| pid.trim_end().parse().ok()),
		cgroup: field("task_memcg").map(|cgroup| cgroup.trim_end().to_owned()),
		monotonic_seconds,
	})
}

/// The kills among `records`, oldest first, the most recent `MOST_KILLS` of them. Pure, so it is
/// tested without a kernel.
fn kills_from(records: &[String]) -> Vec<Kill> {
	let mut kills: Vec<Kill> = records.iter().filter_map(|record| kill_from(record)).collect();
	let excess = kills.len().saturating_sub(MOST_KILLS);
	kills.drain(..excess);
	kills
}

/// Every record `/dev/kmsg` still holds for this open, up to `MOST_RECORDS` of them; the read
/// stops as soon as the device says there is no more to give without waiting for it.
fn records() -> Result<Vec<String>, String> {
	let mut file = std::fs::OpenOptions::new()
		.read(true)
		.custom_flags(O_NONBLOCK)
		.open("/dev/kmsg")
		.map_err(|error| format!("/dev/kmsg: {error}"))?;
	let mut records = Vec::new();
	let mut buffer = [0u8; 8192];
	while records.len() < MOST_RECORDS {
		match file.read(&mut buffer) {
			Ok(0) => break,
			Ok(read) => records.push(String::from_utf8_lossy(&buffer[..read]).into_owned()),
			Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => break,
			Err(error) => return Err(format!("/dev/kmsg: {error}")),
		}
	}
	Ok(records)
}

pub async fn get() -> Response {
	let kernel = match tokio::task::spawn_blocking(records).await {
		Ok(Ok(records)) => Kernel { kills: kills_from(&records), unavailable: None },
		Ok(Err(error)) => Kernel { kills: Vec::new(), unavailable: Some(error) },
		Err(error) => Kernel { kills: Vec::new(), unavailable: Some(error.to_string()) },
	};
	response::success(StatusCode::OK, kernel)
}

#[cfg(test)]
mod tests {
	use super::*;

	fn record(seq: u64, micros: u64, message: &str) -> String {
		format!("6,{seq},{micros},-;{message}")
	}

	#[test]
	fn finds_an_out_of_memory_kill_and_ignores_everything_else() {
		let records = vec![
			record(1, 5_000_000, "device ready"),
			record(
				2,
				5_500_000,
				"oom-kill:constraint=CONSTRAINT_NONE,nodemask=(null),cpuset=/,mems_allowed=0,\
				 global_oom,task_memcg=/docker/abc123,task=nginx,pid=4242,uid=0",
			),
			record(3, 6_000_000, " SUBSYSTEM=devices"),
		];
		let kills = kills_from(&records);
		assert_eq!(
			kills,
			[Kill {
				task: "nginx".into(),
				pid: Some(4242),
				cgroup: Some("/docker/abc123".into()),
				monotonic_seconds: 5.5,
			}]
		);
	}

	#[test]
	fn keeps_only_the_most_recent_kills() {
		let records: Vec<String> = (0..MOST_KILLS + 5)
			.map(|i| {
				record(
					i as u64,
					i as u64 * 1_000_000,
					&format!("oom-kill:task_memcg=/docker/x,task=app,pid={i},uid=0"),
				)
			})
			.collect();
		let kills = kills_from(&records);
		assert_eq!(kills.len(), MOST_KILLS);
		assert_eq!(kills.last().unwrap().pid, Some((MOST_KILLS + 4) as i64));
	}

	#[test]
	fn every_code_it_answers_with_is_in_the_catalogue() {
		for code in response::codes_named(include_str!("kernel.rs")) {
			assert!(response::message_of(code).is_some(), "`{code}` is not in libs/response/codes.json");
		}
	}
}
