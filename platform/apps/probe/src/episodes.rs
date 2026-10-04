//! Failures, told to the ledger: a check that starts failing opens a task, each failing round is
//! an event on it, and the first passing round finishes it `done`. Passing rounds are not
//! recorded. See spec/architecture/probe.md, "Where the results go", and
//! spec/architecture/ledger.md.

use crate::checks::Check;
use crate::round::Round;
use jiff::Timestamp;
use std::collections::HashMap;

pub const SERVICE: &str = "probe";

/// What the ledger is to be told, worked out apart from telling it so it can be tested.
#[derive(Debug, Clone, PartialEq)]
pub enum Told {
	Task(ledger::Record),
	Event {
		task: String,
		stage: &'static str,
		level: ledger::Level,
		message: String,
		data: serde_json::Value,
	},
}

struct Episode {
	id: String,
	asked_at: Timestamp,
	rounds: u64,
}

/// The failures open now, by check.
#[derive(Default)]
pub struct Episodes {
	open: HashMap<String, Episode>,
}

fn instant(at: i64) -> Timestamp {
	Timestamp::from_millisecond(at).unwrap_or(Timestamp::UNIX_EPOCH)
}

impl Episodes {
	/// One round of `check`, and what it tells the ledger.
	pub fn observe(&mut self, check: &Check, place: &str, round: &Round) -> Vec<Told> {
		let record = |episode: &Episode, state, finished_at, detail| ledger::Record {
			service: SERVICE.into(),
			id: episode.id.clone(),
			kind: check.kind.name().into(),
			state,
			caller: ledger::Caller::Ours,
			asked_at: episode.asked_at,
			started_at: Some(episode.asked_at),
			finished_at,
			summary: serde_json::json!({ "check": check.id, "target": check.target, "place": place }),
			detail,
		};
		if round.ok {
			let Some(episode) = self.open.remove(&check.id) else { return vec![] };
			let message = format!("passing again after {} failing rounds", episode.rounds);
			return vec![
				Told::Event {
					task: episode.id.clone(),
					stage: "done",
					level: ledger::Level::Info,
					message,
					data: serde_json::json!({ "duration_ms": round.duration_ms }),
				},
				Told::Task(record(&episode, ledger::State::Done, Some(instant(round.at)), None)),
			];
		}
		let opened = !self.open.contains_key(&check.id);
		let episode = self.open.entry(check.id.clone()).or_insert_with(|| Episode {
			// One id per failure episode: the check and the moment it started failing.
			id: format!("{}@{}", check.id, round.at),
			asked_at: instant(round.at),
			rounds: 0,
		});
		episode.rounds += 1;
		let detail = round.detail.clone().unwrap_or_else(|| "failed".into());
		let mut told = Vec::with_capacity(2);
		if opened {
			told.push(Told::Task(record(episode, ledger::State::Running, None, Some(detail.clone()))));
		}
		told.push(Told::Event {
			task: episode.id.clone(),
			stage: "failing",
			level: ledger::Level::Error,
			message: detail,
			data: serde_json::json!({ "duration_ms": round.duration_ms, "round": episode.rounds }),
		});
		told
	}
}

/// Hand what `observe` worked out to the ledger client, which returns at once.
pub fn tell(ledger: &ledger::Ledger, told: Vec<Told>) {
	for item in told {
		match item {
			Told::Task(record) => ledger.record(record),
			Told::Event { task, stage, level, message, data } => {
				ledger.task(SERVICE, task).event(stage, level, message, data);
			}
		}
	}
}

#[cfg(test)]
mod tests {
	use super::*;

	fn check() -> Check {
		crate::checks::parse(crate::checks::DECLARED).unwrap().remove(0)
	}

	fn round(at: i64, ok: bool) -> Round {
		Round { check: check().id, at, ok, duration_ms: 3, detail: (!ok).then(|| "status 502".into()) }
	}

	#[test]
	fn a_failure_opens_a_task_adds_events_and_is_finished_by_a_pass() {
		let check = check();
		let mut episodes = Episodes::default();
		assert!(episodes.observe(&check, "home", &round(1_000, true)).is_empty());

		let first = episodes.observe(&check, "home", &round(2_000, false));
		let [Told::Task(opened), Told::Event { task, stage: "failing", .. }] = first.as_slice() else {
			panic!("a task, then an event: {first:?}")
		};
		assert_eq!(opened.state, ledger::State::Running);
		assert_eq!(opened.id, format!("{}@2000", check.id));
		assert_eq!(opened.kind, "health");
		assert_eq!(opened.detail.as_deref(), Some("status 502"));
		assert_eq!(task, &opened.id);

		let second = episodes.observe(&check, "home", &round(3_000, false));
		assert!(matches!(second.as_slice(), [Told::Event { stage: "failing", .. }]));

		let recovered = episodes.observe(&check, "home", &round(4_000, true));
		let [Told::Event { stage: "done", message, .. }, Told::Task(done)] = recovered.as_slice()
		else {
			panic!("an event, then the task: {recovered:?}")
		};
		assert_eq!(message, "passing again after 2 failing rounds");
		assert_eq!((done.state, done.id.as_str()), (ledger::State::Done, opened.id.as_str()));
		assert_eq!(done.finished_at, Some(Timestamp::from_millisecond(4_000).unwrap()));

		// The next failure is an episode, and a task, of its own.
		let again = episodes.observe(&check, "home", &round(9_000, false));
		let [Told::Task(next), ..] = again.as_slice() else { panic!("a new task") };
		assert_ne!(next.id, opened.id);
	}
}
