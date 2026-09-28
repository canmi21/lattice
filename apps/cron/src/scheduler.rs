//! Every job on the node, one task asking each when it falls due. See spec/architecture/cron.md.

use crate::reach::{self, Transport};
use crate::schedule::Schedule;
use crate::store::{Last, Outcome, Store};
use crate::table::{CatchUp, Job, Overlap, Table};
use jiff::Timestamp;
use ledger::{Caller, Ledger, Level, Record, State};
use serde::Serialize;
use std::collections::{BTreeMap, HashMap, HashSet};
use std::path::PathBuf;
use std::sync::{Arc, Mutex, MutexGuard, PoisonError};
use std::time::{Duration, Instant};
use tokio::sync::Notify;

/// The ledger's name for this service's tasks.
pub const SERVICE: &str = "cron";

/// The longest the driver sleeps without looking again, so a clock stepped while it slept is
/// noticed within this long.
const LOOK: Duration = Duration::from_secs(60);

type Key = (String, String);

/// Whether a job missed a run while `cron` was down: its last handled due time is older than its
/// schedule's latest. A job never run has nothing to catch up to. See "Missed runs".
pub fn missed(catch_up: CatchUp, last_due: Option<Timestamp>, previous: Option<Timestamp>) -> bool {
	catch_up == CatchUp::Once
		&& matches!((last_due, previous), (Some(last), Some(previous)) if last < previous)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Action {
	Start,
	Skip,
	Queue,
}

/// What a run due now does, given the job's last run. One run waits at most: a second due while
/// one already waits is skipped. See "Overlap".
pub fn on_due(overlap: Overlap, running: bool, queued: bool) -> Action {
	match (running, overlap) {
		(false, _) => Action::Start,
		(true, Overlap::Queue) if !queued => Action::Queue,
		(true, _) => Action::Skip,
	}
}

/// One run: its id, and the due time it is for, none when asked by hand.
#[derive(Debug, Clone)]
struct Run {
	id: String,
	job: Job,
	due: Option<Timestamp>,
	asked_at: Timestamp,
}

struct Entry {
	job: Job,
	schedule: Schedule,
	next: Option<Timestamp>,
	running: bool,
	queued: Option<Run>,
	last: Option<Last>,
}

#[derive(Default)]
struct Jobs {
	entries: BTreeMap<Key, Entry>,
	/// Held in memory until restart. See "Seen in the panel".
	paused: HashSet<Key>,
}

/// A job as `GET /schedules` answers it.
#[derive(Debug, Clone, Serialize)]
pub struct View {
	#[serde(flatten)]
	pub job: Job,
	pub next: Option<Timestamp>,
	pub paused: bool,
	pub running: bool,
	pub queued: bool,
	pub last: Option<Last>,
}

pub struct Cron {
	jobs: Mutex<Jobs>,
	store: Mutex<Store>,
	ledger: Ledger,
	transport: Arc<dyn Transport>,
	origin: String,
	wake: Notify,
}

pub type Shared = Arc<Cron>;

/// A poisoned lock means a step panicked mid-way; what it holds is still worth reading.
fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
	mutex.lock().unwrap_or_else(PoisonError::into_inner)
}

fn key(service: &str, name: &str) -> Key {
	(service.to_owned(), name.to_owned())
}

impl Cron {
	pub fn new(
		store: Store,
		ledger: Ledger,
		transport: Arc<dyn Transport>,
		origin: String,
	) -> Shared {
		Arc::new(Self {
			jobs: Mutex::new(Jobs::default()),
			store: Mutex::new(store),
			ledger,
			transport,
			origin,
			wake: Notify::new(),
		})
	}

	/// Take a table: a job unchanged keeps its state, a job new to this process catches up once if
	/// it missed a run, and a job gone is dropped.
	pub fn load(self: &Arc<Self>, table: Table, now: Timestamp) {
		let lasts = lock(&self.store).lasts().unwrap_or_else(|error| {
			eprintln!("cron: {error}");
			HashMap::new()
		});
		let mut missed_runs = Vec::new();
		{
			let mut jobs = lock(&self.jobs);
			let mut entries = BTreeMap::new();
			for job in table.jobs {
				let Ok(schedule) = job.schedule() else { continue };
				let key = key(&job.service, &job.name);
				if let Some(mut entry) = jobs.entries.remove(&key) {
					if entry.job != job {
						entry.next = schedule.next_after(now);
						entry.job = job;
						entry.schedule = schedule;
					}
					entries.insert(key, entry);
					continue;
				}
				let last_due = lock(&self.store).due(&key.0, &key.1).unwrap_or_default();
				let previous = schedule.previous(now);
				if missed(job.catch_up, last_due, previous) {
					missed_runs.push((key.clone(), previous));
				}
				let entry = Entry {
					next: schedule.next_after(now),
					last: lasts.get(&key).cloned(),
					job,
					schedule,
					running: false,
					queued: None,
				};
				entries.insert(key, entry);
			}
			jobs.entries = entries;
		}
		for (key, due) in missed_runs {
			self.fire(&key, due);
		}
		self.wake.notify_one();
	}

	/// Every job, in `(service, name)` order.
	pub fn views(&self) -> Vec<View> {
		let jobs = lock(&self.jobs);
		jobs
			.entries
			.iter()
			.map(|(key, entry)| View {
				job: entry.job.clone(),
				next: entry.next,
				paused: jobs.paused.contains(key),
				running: entry.running,
				queued: entry.queued.is_some(),
				last: entry.last.clone(),
			})
			.collect()
	}

	/// Run a job now, as its overlap allows; the run's id, or none for an unknown job.
	pub fn run_now(self: &Arc<Self>, service: &str, name: &str) -> Option<String> {
		self.fire(&key(service, name), None)
	}

	/// Pause or resume a job; false for an unknown one.
	pub fn set_paused(&self, service: &str, name: &str, paused: bool) -> bool {
		let key = key(service, name);
		let mut jobs = lock(&self.jobs);
		if !jobs.entries.contains_key(&key) {
			return false;
		}
		if paused {
			jobs.paused.insert(key);
		} else {
			jobs.paused.remove(&key);
		}
		true
	}

	/// Sleep until the nearest due time, ask what is due, and again; a new table wakes it early.
	pub async fn drive(self: Arc<Self>) {
		loop {
			let now = Timestamp::now();
			let mut due = Vec::new();
			let mut nearest: Option<Timestamp> = None;
			{
				let mut jobs = lock(&self.jobs);
				let Jobs { entries, paused } = &mut *jobs;
				for (key, entry) in entries.iter_mut() {
					if let Some(next) = entry.next.filter(|next| *next <= now) {
						entry.next = entry.schedule.next_after(now);
						if paused.contains(key) {
							// Handled by being paused, so a restart does not run it as missed.
							self.set_due(key, next);
						} else {
							due.push((key.clone(), next));
						}
					}
					nearest = match (nearest, entry.next) {
						(Some(a), Some(b)) => Some(a.min(b)),
						(a, b) => a.or(b),
					};
				}
			}
			for (key, next) in due {
				self.fire(&key, Some(next));
			}
			let wait = nearest
				.and_then(|nearest| Duration::try_from(nearest.duration_since(Timestamp::now())).ok())
				.unwrap_or(LOOK)
				.min(LOOK);
			tokio::select! {
				() = tokio::time::sleep(wait) => {}
				() = self.wake.notified() => {}
			}
		}
	}

	/// Read the table again whenever its modification time moves; one that does not read keeps the
	/// last good table.
	pub async fn watch(self: Arc<Self>, directory: PathBuf, mut seen: Option<std::time::SystemTime>) {
		loop {
			tokio::time::sleep(Duration::from_secs(5)).await;
			let modified = crate::table::modified(&directory);
			if modified == seen {
				continue;
			}
			seen = modified;
			match crate::table::read(&directory) {
				Ok(table) => {
					eprintln!("cron: read {} jobs", table.jobs.len());
					self.load(table, Timestamp::now());
				}
				Err(error) => eprintln!("cron: keeping the last table: {error}"),
			}
		}
	}

	fn set_due(&self, key: &Key, due: Timestamp) {
		if let Err(error) = lock(&self.store).set_due(&key.0, &key.1, due) {
			eprintln!("cron: {error}");
		}
	}

	fn set_last(&self, key: &Key, last: &Last) {
		if let Err(error) = lock(&self.store).set_last(&key.0, &key.1, last) {
			eprintln!("cron: {error}");
		}
	}

	/// A run falls due, or is asked for by hand: start it, skip it or queue it.
	fn fire(self: &Arc<Self>, key: &Key, due: Option<Timestamp>) -> Option<String> {
		let mut jobs = lock(&self.jobs);
		let entry = jobs.entries.get_mut(key)?;
		let run = Run {
			id: uuid::Uuid::new_v4().to_string(),
			job: entry.job.clone(),
			due,
			asked_at: Timestamp::now(),
		};
		if let Some(due) = due {
			self.set_due(key, due);
		}
		let id = run.id.clone();
		match on_due(entry.job.overlap, entry.running, entry.queued.is_some()) {
			Action::Start => {
				entry.running = true;
				self.queued(&run, "due");
				self.begin(entry, key, run);
			}
			Action::Queue => {
				self.queued(&run, "waiting for the run before it");
				entry.queued = Some(run);
			}
			Action::Skip => self.skipped(&run),
		}
		Some(id)
	}

	/// Mark `entry` running with `run` and ask its service in the background.
	fn begin(self: &Arc<Self>, entry: &mut Entry, key: &Key, run: Run) {
		let last = Last {
			run: run.id.clone(),
			due: run.due,
			started_at: Timestamp::now(),
			finished_at: None,
			outcome: Outcome::Running,
			status: None,
			detail: None,
		};
		self.set_last(key, &last);
		entry.last = Some(last);
		let cron = self.clone();
		let key = key.clone();
		tokio::spawn(async move { cron.run(key, run).await });
	}

	async fn run(self: Arc<Self>, key: Key, run: Run) {
		let started_at = Timestamp::now();
		let events = self.ledger.task(SERVICE, &run.id);
		self.ledger.record(record(&run, State::Running, Some(started_at), None, None));
		let answer = match reach::call(&run.job, &run.id, &self.origin) {
			Ok(call) => {
				events.event(
					"running",
					Level::Info,
					format!("asked POST {}", call.request.uri()),
					serde_json::Value::Null,
				);
				let timeout = Duration::from_secs(run.job.timeout);
				let clock = Instant::now();
				let answer = match tokio::time::timeout(timeout, self.transport.send(call)).await {
					Ok(answer) => answer,
					Err(_) => Err(format!("no answer within {} seconds", run.job.timeout)),
				};
				(answer, clock.elapsed().as_millis() as u64)
			}
			Err(error) => (Err(error), 0),
		};
		let finished_at = Timestamp::now();
		let (outcome, status, detail) = match answer {
			(Ok(status), ms) if (200..300).contains(&status) => {
				let data = serde_json::json!({ "status": status, "ms": ms });
				events.event("done", Level::Info, format!("answered {status} in {ms} ms"), data);
				(Outcome::Done, Some(status), None)
			}
			(Ok(status), ms) => {
				let data = serde_json::json!({ "status": status, "ms": ms });
				let detail = format!("answered {status}");
				events.event("failed", Level::Error, format!("{detail} in {ms} ms"), data);
				(Outcome::Failed, Some(status), Some(detail))
			}
			(Err(reason), ms) => {
				let data = serde_json::json!({ "ms": ms });
				events.event("failed", Level::Error, reason.clone(), data);
				(Outcome::Failed, None, Some(reason))
			}
		};
		let state = if outcome == Outcome::Done { State::Done } else { State::Failed };
		self.ledger.record(record(&run, state, Some(started_at), Some(finished_at), detail.clone()));

		let mut jobs = lock(&self.jobs);
		// A job dropped from the table while it ran has nothing left to update.
		let Some(entry) = jobs.entries.get_mut(&key) else { return };
		let last = Last {
			run: run.id,
			due: run.due,
			started_at,
			finished_at: Some(finished_at),
			outcome,
			status,
			detail,
		};
		self.set_last(&key, &last);
		entry.last = Some(last);
		entry.running = false;
		if let Some(next) = entry.queued.take() {
			entry.running = true;
			self.begin(entry, &key, next);
		}
	}

	fn queued(&self, run: &Run, message: &str) {
		self.ledger.record(record(run, State::Queued, None, None, None));
		let data = match run.due {
			Some(due) => serde_json::json!({ "due": due }),
			None => serde_json::json!({ "by": "hand" }),
		};
		self.ledger.task(SERVICE, &run.id).event("queued", Level::Info, message, data);
	}

	/// A skipped run is a task too, finished as soon as it is made; the ledger has no state of its
	/// own for it.
	fn skipped(&self, run: &Run) {
		let now = Timestamp::now();
		let detail = "skipped: the run before it is still going".to_owned();
		self.ledger.record(record(run, State::Failed, None, Some(now), Some(detail.clone())));
		self.ledger.task(SERVICE, &run.id).event(
			"skipped",
			Level::Warn,
			detail,
			serde_json::Value::Null,
		);
	}
}

/// The run as a ledger task of `cron`'s own, kind `run`.
fn record(
	run: &Run,
	state: State,
	started_at: Option<Timestamp>,
	finished_at: Option<Timestamp>,
	detail: Option<String>,
) -> Record {
	Record {
		service: SERVICE.into(),
		id: run.id.clone(),
		kind: "run".into(),
		state,
		caller: Caller::Ours,
		asked_at: run.asked_at,
		started_at,
		finished_at,
		summary: serde_json::json!({
			"service": run.job.service,
			"name": run.job.name,
			"schedule": run.job.schedule_text(),
		}),
		detail,
	}
}

#[cfg(test)]
mod tests {
	use super::*;

	fn at(text: &str) -> Timestamp {
		text.parse().unwrap()
	}

	#[test]
	fn catches_up_once_only_when_a_run_was_missed() {
		let previous = Some(at("2026-09-28T04:00:00Z"));
		assert!(missed(CatchUp::Once, Some(at("2026-09-27T04:00:00Z")), previous));
		assert!(!missed(CatchUp::Once, Some(at("2026-09-28T04:00:00Z")), previous));
		assert!(!missed(CatchUp::Skip, Some(at("2026-09-27T04:00:00Z")), previous));
		// Never run, so nothing was missed.
		assert!(!missed(CatchUp::Once, None, previous));
	}

	#[test]
	fn overlap_skips_or_queues_one() {
		assert_eq!(on_due(Overlap::Skip, false, false), Action::Start);
		assert_eq!(on_due(Overlap::Skip, true, false), Action::Skip);
		assert_eq!(on_due(Overlap::Queue, false, false), Action::Start);
		assert_eq!(on_due(Overlap::Queue, true, false), Action::Queue);
		assert_eq!(on_due(Overlap::Queue, true, true), Action::Skip);
	}
}
