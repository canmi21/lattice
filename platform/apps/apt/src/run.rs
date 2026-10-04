//! Starting one of the two units and following it: polling its properties until it is no longer
//! active, then recording the result. Every run is a ledger task of `apt`'s own, its parent the
//! task named in `X-Task-Parent`. See spec/architecture/apt.md, "Every run is a ledger task".

use crate::bus::{Bus, Properties, UNIT_UPDATE, UNIT_UPGRADE};
use jiff::Timestamp;
use std::sync::Arc;
use std::time::Duration;
use uuid::Uuid;

pub const JOB_UPDATE: &str = "update";
pub const JOB_UPGRADE: &str = "upgrade";

/// How often a started unit's properties are read while it is still active.
const POLL: Duration = Duration::from_secs(2);
/// How many times reading properties may fail in a row before a run is given up on and recorded
/// failed, rather than followed forever.
const RETRIES: u32 = 5;

/// The unit a job name starts, or `None` for anything else -- a path names a job, and a job is one
/// of two words. See spec/architecture/apt.md, "No request carries anything that becomes part of a
/// command".
pub fn unit_of(job: &str) -> Option<&'static str> {
	match job {
		JOB_UPDATE => Some(UNIT_UPDATE),
		JOB_UPGRADE => Some(UNIT_UPGRADE),
		_ => None,
	}
}

/// The parent task named in `X-Task-Parent: <service>:<id>`, when the header is present and reads
/// as one. See spec/architecture/cron.md, "A run is a request, and a task in the ledger".
pub fn parent_of(header: Option<&str>) -> Option<ledger::Parent> {
	let (service, id) = header?.split_once(':')?;
	Some(ledger::Parent { service: service.to_owned(), id: id.to_owned() })
}

/// Starts `unit`, tells the ledger it is running, and hands the follow-up off to a background
/// task. Returns the properties read right after starting, for the route's `202` answer.
pub async fn start_and_follow(
	bus: Arc<dyn Bus>,
	ledger: Option<ledger::Ledger>,
	job: &'static str,
	unit: &'static str,
	parent: Option<ledger::Parent>,
) -> anyhow::Result<Properties> {
	let id = Uuid::new_v4().to_string();
	let asked_at = Timestamp::now();
	tell(&ledger, &id, job, ledger::State::Queued, asked_at, None, None, None, parent.clone());

	bus.start(unit).await?;

	let started_at = Timestamp::now();
	if let Some(ledger) = &ledger {
		ledger.task("apt", id.clone()).event(
			"started",
			ledger::Level::Info,
			format!("started {unit}"),
			serde_json::Value::Null,
		);
	}
	tell(
		&ledger,
		&id,
		job,
		ledger::State::Running,
		asked_at,
		Some(started_at),
		None,
		None,
		parent.clone(),
	);

	let properties = bus.properties(unit).await?;
	tokio::spawn(follow(bus, ledger, id, job, asked_at, started_at, parent));
	Ok(properties)
}

async fn follow(
	bus: Arc<dyn Bus>,
	ledger: Option<ledger::Ledger>,
	id: String,
	job: &'static str,
	asked_at: Timestamp,
	started_at: Timestamp,
	parent: Option<ledger::Parent>,
) {
	let unit = unit_of(job).unwrap_or_default();
	let mut failures = 0;
	loop {
		match bus.properties(unit).await {
			Ok(properties) if properties.running() => {
				failures = 0;
				tokio::time::sleep(POLL).await;
			}
			Ok(properties) => {
				finish(&ledger, &id, job, asked_at, started_at, Some(&properties), parent).await;
				return;
			}
			Err(error) => {
				failures += 1;
				eprintln!("apt: reading {unit}'s properties: {error}");
				if failures >= RETRIES {
					finish(&ledger, &id, job, asked_at, started_at, None, parent).await;
					return;
				}
				tokio::time::sleep(POLL).await;
			}
		}
	}
}

async fn finish(
	ledger: &Option<ledger::Ledger>,
	id: &str,
	job: &str,
	asked_at: Timestamp,
	started_at: Timestamp,
	properties: Option<&Properties>,
	parent: Option<ledger::Parent>,
) {
	let finished_at = Timestamp::now();
	let success = properties.is_some_and(|properties| properties.result == "success");
	let seconds = finished_at.duration_since(started_at).as_secs_f64();

	if let Some(ledger) = ledger {
		let (message, data) = match properties {
			Some(properties) => (
				format!("{job} {}", if success { "succeeded" } else { "failed" }),
				serde_json::json!({
					"result": properties.result,
					"exit_status": properties.exec_main_status,
					"seconds": seconds,
				}),
			),
			None => (format!("{job}: could not read the unit's properties"), serde_json::Value::Null),
		};
		let level = if success { ledger::Level::Info } else { ledger::Level::Error };
		ledger.task("apt", id.to_owned()).event("finished", level, message, data);
	}

	let detail = match properties {
		Some(properties) if !success => {
			Some(format!("{} (exit {})", properties.result, properties.exec_main_status))
		}
		None => Some("the unit's properties could not be read".to_owned()),
		_ => None,
	};
	let state = if success { ledger::State::Done } else { ledger::State::Failed };
	tell(ledger, id, job, state, asked_at, Some(started_at), Some(finished_at), detail, parent);
}

#[allow(clippy::too_many_arguments)]
fn tell(
	ledger: &Option<ledger::Ledger>,
	id: &str,
	job: &str,
	state: ledger::State,
	asked_at: Timestamp,
	started_at: Option<Timestamp>,
	finished_at: Option<Timestamp>,
	detail: Option<String>,
	parent: Option<ledger::Parent>,
) {
	let Some(ledger) = ledger else { return };
	let record = ledger::Record {
		service: "apt".into(),
		id: id.to_owned(),
		kind: job.to_owned(),
		state,
		caller: ledger::Caller::Ours,
		asked_at,
		started_at,
		finished_at,
		summary: serde_json::Value::Null,
		detail,
	};
	ledger.send(ledger::Task { record, parent });
}

#[cfg(test)]
mod tests {
	use super::*;
	use crate::bus::tests::FakeBus;

	#[test]
	fn a_job_names_its_unit_and_nothing_else_does() {
		assert_eq!(unit_of(JOB_UPDATE), Some(UNIT_UPDATE));
		assert_eq!(unit_of(JOB_UPGRADE), Some(UNIT_UPGRADE));
		assert_eq!(unit_of("rm -rf /"), None);
	}

	#[test]
	fn a_parent_header_reads_as_service_and_id() {
		assert_eq!(
			parent_of(Some("cron:abc-123")),
			Some(ledger::Parent { service: "cron".into(), id: "abc-123".into() })
		);
		assert_eq!(parent_of(Some("no-colon")), None);
		assert_eq!(parent_of(None), None);
	}

	#[tokio::test]
	async fn a_run_is_followed_from_activating_to_done() {
		let bus: Arc<dyn Bus> = Arc::new(FakeBus::activating_then_done());
		let properties =
			start_and_follow(bus.clone(), None, JOB_UPDATE, UNIT_UPDATE, None).await.unwrap();
		assert!(properties.running());
		// The background follow-up polls fast in the fake and settles almost at once.
		tokio::time::sleep(Duration::from_millis(50)).await;
		let settled = bus.properties(UNIT_UPDATE).await.unwrap();
		assert!(!settled.running());
		assert_eq!(settled.result, "success");
	}
}
