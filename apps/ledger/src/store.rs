//! The one table, keyed by `service` and `id`, kept for good. See spec/architecture/ledger.md,
//! "Kept for good".

use jiff::Timestamp;
use ledger::{Caller, Record, State, Stored};
use rusqlite::{Connection, OptionalExtension, params};
use std::path::Path;

/// A page's boundary: the `updated_at` and `id` of the last row already seen, so the next page
/// starts strictly after it in the newest-first order. Encoded as `<nanoseconds>:<id>` -- the
/// nanosecond count is always ASCII digits (and a leading `-` before 1970, which does not occur
/// here), so splitting on the first `:` recovers `id` whole even if `id` itself holds one.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Cursor {
	pub updated_at: i64,
	pub id: String,
}

impl Cursor {
	pub fn encode(&self) -> String {
		format!("{}:{}", self.updated_at, self.id)
	}

	pub fn parse(text: &str) -> Option<Self> {
		let (nanos, id) = text.split_once(':')?;
		Some(Self { updated_at: nanos.parse().ok()?, id: id.to_owned() })
	}
}

/// What `GET /tasks` narrows by, each optional and matched exactly against the column's own word
/// -- `state` and `caller` take the same lowercase spelling `serde` gives the wire, so a value that
/// is not one of them matches nothing rather than failing the request.
#[derive(Debug, Clone, Default)]
pub struct Filter {
	pub service: Option<String>,
	pub state: Option<String>,
	pub kind: Option<String>,
	pub caller: Option<String>,
}

pub struct Store {
	connection: Connection,
}

/// A state or a caller as the column holds it: the same lowercase word `serde` gives the wire.
fn state_word(state: State) -> &'static str {
	match state {
		State::Queued => "queued",
		State::Running => "running",
		State::Done => "done",
		State::Failed => "failed",
	}
}

fn caller_word(caller: Caller) -> &'static str {
	match caller {
		Caller::Public => "public",
		Caller::Ours => "ours",
	}
}

impl Store {
	pub fn open(path: &Path) -> anyhow::Result<Self> {
		let connection = Connection::open(path)?;
		connection.execute_batch(
			"PRAGMA journal_mode = WAL;
			CREATE TABLE IF NOT EXISTS tasks (
				service TEXT NOT NULL,
				id TEXT NOT NULL,
				kind TEXT NOT NULL,
				state TEXT NOT NULL,
				caller TEXT NOT NULL,
				updated_at INTEGER NOT NULL,
				finished_at INTEGER,
				record TEXT NOT NULL,
				PRIMARY KEY (service, id)
			) WITHOUT ROWID;
			CREATE INDEX IF NOT EXISTS tasks_updated_at ON tasks (updated_at, id);",
		)?;
		Ok(Self { connection })
	}

	/// Upserts `record`, stamping `updated_at` as now, and answers the row kept -- the new record,
	/// or the one already there when `record` loses the rule spec/architecture/ledger.md now states:
	/// a later `asked_at` is the same task asked again and always replaces what is kept; only within
	/// one asking (`asked_at` equal) does the older rule apply, that a `finished_at` older than the
	/// one kept does not replace it, and a record with none never replaces one that has it.
	pub fn upsert(&mut self, record: Record) -> anyhow::Result<Stored> {
		let transaction = self.connection.transaction()?;
		let kept: Option<String> = transaction
			.query_row(
				"SELECT record FROM tasks WHERE service = ?1 AND id = ?2",
				params![record.service, record.id],
				|row| row.get(0),
			)
			.optional()?;
		let kept: Option<Stored> = kept.map(|text| serde_json::from_str(&text)).transpose()?;
		let losing = match &kept {
			None => false,
			Some(kept) if record.asked_at > kept.record.asked_at => false,
			Some(kept) if record.asked_at < kept.record.asked_at => true,
			Some(kept) => match (kept.record.finished_at, record.finished_at) {
				(Some(_), None) => true,
				(Some(old), Some(new)) => new < old,
				_ => false,
			},
		};
		if losing {
			return Ok(kept.expect("losing only when a row is already kept"));
		}
		let updated_at = Timestamp::now();
		let stored = Stored { record, updated_at };
		let text = serde_json::to_string(&stored)?;
		transaction.execute(
			"INSERT INTO tasks (service, id, kind, state, caller, updated_at, finished_at, record)
			VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
			ON CONFLICT (service, id) DO UPDATE SET
				kind = excluded.kind, state = excluded.state, caller = excluded.caller,
				updated_at = excluded.updated_at, finished_at = excluded.finished_at,
				record = excluded.record",
			params![
				stored.record.service,
				stored.record.id,
				stored.record.kind,
				state_word(stored.record.state),
				caller_word(stored.record.caller),
				updated_at.as_nanosecond() as i64,
				stored.record.finished_at.map(|at| at.as_nanosecond() as i64),
				text,
			],
		)?;
		transaction.commit()?;
		Ok(stored)
	}

	pub fn get(&self, service: &str, id: &str) -> anyhow::Result<Option<Stored>> {
		let text: Option<String> = self
			.connection
			.query_row(
				"SELECT record FROM tasks WHERE service = ?1 AND id = ?2",
				params![service, id],
				|row| row.get(0),
			)
			.optional()?;
		Ok(text.map(|text| serde_json::from_str(&text)).transpose()?)
	}

	/// Newest `updated_at` first, at most `limit` rows, narrowed by `filter` and, when given, only
	/// what is strictly older than `before`.
	pub fn list(
		&self,
		filter: &Filter,
		before: Option<&Cursor>,
		limit: usize,
	) -> anyhow::Result<Vec<Stored>> {
		let mut clauses = Vec::new();
		let mut bound: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();
		if let Some(service) = &filter.service {
			clauses.push("service = ?".to_owned());
			bound.push(Box::new(service.clone()));
		}
		if let Some(state) = &filter.state {
			clauses.push("state = ?".to_owned());
			bound.push(Box::new(state.clone()));
		}
		if let Some(kind) = &filter.kind {
			clauses.push("kind = ?".to_owned());
			bound.push(Box::new(kind.clone()));
		}
		if let Some(caller) = &filter.caller {
			clauses.push("caller = ?".to_owned());
			bound.push(Box::new(caller.clone()));
		}
		if let Some(before) = before {
			clauses.push("(updated_at < ? OR (updated_at = ? AND id < ?))".to_owned());
			bound.push(Box::new(before.updated_at));
			bound.push(Box::new(before.updated_at));
			bound.push(Box::new(before.id.clone()));
		}
		let mut query = "SELECT record FROM tasks".to_owned();
		if !clauses.is_empty() {
			query.push_str(" WHERE ");
			query.push_str(&clauses.join(" AND "));
		}
		query.push_str(" ORDER BY updated_at DESC, id DESC LIMIT ?");
		bound.push(Box::new(limit as i64));

		let mut select = self.connection.prepare(&query)?;
		let params = rusqlite::params_from_iter(bound.iter().map(std::convert::AsRef::as_ref));
		let rows = select.query_map(params, |row| row.get::<_, String>(0))?;
		let mut stored = Vec::new();
		for row in rows {
			stored.push(serde_json::from_str(&row?)?);
		}
		Ok(stored)
	}
}

#[cfg(test)]
mod tests {
	use super::*;

	fn record(id: &str, state: State, finished_at: Option<&str>) -> Record {
		Record {
			service: "shot".into(),
			id: id.into(),
			kind: "capture".into(),
			state,
			caller: Caller::Public,
			asked_at: "2026-09-28T12:00:00Z".parse().unwrap(),
			started_at: None,
			finished_at: finished_at.map(|at| at.parse().unwrap()),
			summary: serde_json::json!({}),
			detail: None,
		}
	}

	fn asked_at(id: &str, state: State, asked_at: &str, finished_at: Option<&str>) -> Record {
		Record { asked_at: asked_at.parse().unwrap(), ..record(id, state, finished_at) }
	}

	fn open() -> (tempfile::TempDir, Store) {
		let directory = tempfile::tempdir().unwrap();
		let store = Store::open(&directory.path().join("ledger.db")).unwrap();
		(directory, store)
	}

	#[test]
	fn a_late_running_does_not_undo_a_done() {
		let (_directory, mut store) = open();
		store.upsert(record("a", State::Done, Some("2026-09-28T12:05:00Z"))).unwrap();
		let kept = store.upsert(record("a", State::Running, Some("2026-09-28T12:04:00Z"))).unwrap();
		assert_eq!(kept.record.state, State::Done);
		assert_eq!(store.get("shot", "a").unwrap().unwrap().record.state, State::Done);
	}

	#[test]
	fn a_record_without_finished_at_never_replaces_one_that_has_it() {
		let (_directory, mut store) = open();
		store.upsert(record("a", State::Done, Some("2026-09-28T12:05:00Z"))).unwrap();
		let kept = store.upsert(record("a", State::Running, None)).unwrap();
		assert_eq!(kept.record.state, State::Done);
	}

	#[test]
	fn a_later_asked_at_always_replaces_the_kept_one() {
		let (_directory, mut store) = open();
		store
			.upsert(asked_at("a", State::Failed, "2026-09-28T12:00:00Z", Some("2026-09-28T12:00:00Z")))
			.unwrap();
		let kept = store.upsert(asked_at("a", State::Queued, "2026-09-28T13:00:00Z", None)).unwrap();
		assert_eq!(kept.record.state, State::Queued);

		let (_directory, mut store) = open();
		store
			.upsert(asked_at("a", State::Failed, "2026-09-28T12:00:00Z", Some("2026-09-28T12:00:00Z")))
			.unwrap();
		let kept = store.upsert(asked_at("a", State::Queued, "2026-09-28T12:00:00Z", None)).unwrap();
		assert_eq!(kept.record.state, State::Failed);
	}

	#[test]
	fn a_later_finished_at_replaces_the_kept_one() {
		let (_directory, mut store) = open();
		store.upsert(record("a", State::Running, Some("2026-09-28T12:00:00Z"))).unwrap();
		let kept = store.upsert(record("a", State::Done, Some("2026-09-28T12:05:00Z"))).unwrap();
		assert_eq!(kept.record.state, State::Done);
	}

	#[test]
	fn sending_the_same_record_twice_is_harmless() {
		let (_directory, mut store) = open();
		let first = store.upsert(record("a", State::Queued, None)).unwrap();
		let second = store.upsert(record("a", State::Queued, None)).unwrap();
		assert_eq!(first.record, second.record);
	}

	#[test]
	fn lists_newest_updated_at_first_paged_and_filtered() {
		let (_directory, mut store) = open();
		for id in ["a", "b", "c"] {
			store.upsert(record(id, State::Done, Some("2026-09-28T12:00:00Z"))).unwrap();
		}
		store.upsert(record("d", State::Failed, Some("2026-09-28T12:00:00Z"))).unwrap();

		let all = store.list(&Filter::default(), None, 10).unwrap();
		assert_eq!(all.len(), 4);
		assert_eq!(all[0].record.id, "d");
		assert_eq!(all[3].record.id, "a");

		let page = store.list(&Filter::default(), None, 2).unwrap();
		assert_eq!(page.len(), 2);
		let cursor = Cursor {
			updated_at: page[1].updated_at.as_nanosecond() as i64,
			id: page[1].record.id.clone(),
		};
		let rest = store.list(&Filter::default(), Some(&cursor), 10).unwrap();
		assert_eq!(rest.len(), 2);
		assert_eq!(rest[0].record.id, all[2].record.id);

		let failed =
			store.list(&Filter { state: Some("failed".into()), ..Filter::default() }, None, 10).unwrap();
		assert_eq!(failed.len(), 1);
		assert_eq!(failed[0].record.id, "d");
	}

	#[test]
	fn a_cursor_round_trips_through_its_encoding() {
		let cursor = Cursor { updated_at: 12345, id: "with:colon".into() };
		assert_eq!(Cursor::parse(&cursor.encode()), Some(cursor));
	}
}
