//! The tables kept for good: tasks keyed by `service` and `id`, and their events keyed by
//! `service`, `task` and `seq`. See spec/architecture/ledger.md, "Kept for good" and "A task, and
//! the events that make it up".

use jiff::Timestamp;
use ledger::{Caller, Event, Item, Level, State, Task};
use rusqlite::{Connection, OptionalExtension, params};
use serde::{Deserialize, Serialize};
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

/// A task as the ledger stores and answers it: the whole task, `parent` included, plus when the
/// ledger last took it. What `platform/libs/ledger`'s `Stored` would be, had it wrapped `Task`
/// rather than `Record`; kept here rather than there since it is this crate's wire shape alone. See
/// spec/architecture/ledger.md, "Read by the panel".
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct StoredTask {
	#[serde(flatten)]
	pub task: Task,
	pub updated_at: Timestamp,
}

/// One task with its events in `seq` order and the tasks it is the parent of, newest first. What
/// `GET /tasks/{service}/{id}` answers.
#[derive(Debug, Clone, Serialize)]
pub struct TaskView {
	#[serde(flatten)]
	pub task: StoredTask,
	pub events: Vec<Event>,
	pub children: Vec<StoredTask>,
}

/// How many of a task's children `GET /tasks/{service}/{id}` answers with at most. See
/// spec/architecture/ledger.md, "Read by the panel".
const CHILDREN: usize = 100;

/// What `GET /tasks` narrows by, each optional and matched exactly against the column's own word
/// -- `state` and `caller` take the same lowercase spelling `serde` gives the wire, so a value that
/// is not one of them matches nothing rather than failing the request. `parent` is `service:id`,
/// split by the caller before it reaches here.
#[derive(Debug, Clone, Default)]
pub struct Filter {
	pub service: Option<String>,
	pub state: Option<String>,
	pub kind: Option<String>,
	pub caller: Option<String>,
	pub parent_service: Option<String>,
	pub parent_id: Option<String>,
}

/// A nanosecond-wide bucket the way `asked_at` truncates to the hour: dividing a nanosecond count
/// by this and back rounds down to the hour it falls in, per spec/architecture/ledger.md,
/// "Counted for telemetry".
const NANOS_PER_HOUR: i64 = 3_600_000_000_000;

/// One row of `GET /counts`: how many of `service`'s tasks asked in `hour`'s bucket hold `state`.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Count {
	pub service: String,
	pub hour: Timestamp,
	pub state: String,
	pub count: i64,
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

fn level_word(level: Level) -> &'static str {
	match level {
		Level::Info => "info",
		Level::Warn => "warn",
		Level::Error => "error",
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
				asked_at INTEGER,
				parent_service TEXT,
				parent_id TEXT,
				record TEXT NOT NULL,
				PRIMARY KEY (service, id)
			) WITHOUT ROWID;
			CREATE INDEX IF NOT EXISTS tasks_updated_at ON tasks (updated_at, id);
			CREATE TABLE IF NOT EXISTS events (
				service TEXT NOT NULL,
				task TEXT NOT NULL,
				seq INTEGER NOT NULL,
				at INTEGER NOT NULL,
				stage TEXT NOT NULL,
				level TEXT NOT NULL,
				message TEXT NOT NULL,
				data TEXT NOT NULL,
				PRIMARY KEY (service, task, seq)
			) WITHOUT ROWID;",
		)?;
		// A table already made by an older deploy, before events existed, has no parent columns;
		// added onto it here rather than by dropping and remaking the table. Either failing (the
		// columns already exist, on a fresh table made above) is not an error.
		let _ = connection.execute("ALTER TABLE tasks ADD COLUMN parent_service TEXT", []);
		let _ = connection.execute("ALTER TABLE tasks ADD COLUMN parent_id TEXT", []);
		// After the ALTERs above, which an older table (from before parents existed) needs before
		// the columns can be indexed.
		connection.execute(
			"CREATE INDEX IF NOT EXISTS tasks_parent ON tasks (parent_service, parent_id, updated_at, id)",
			[],
		)?;
		let _ = connection.execute("ALTER TABLE tasks ADD COLUMN asked_at INTEGER", []);
		// A row from before `asked_at` existed gets it NULL from the ALTER above and would be
		// missing from GET /counts forever; backfilled from the record's own `asked_at`, in seconds
		// since `unixepoch` reads it and widened to nanoseconds to match the column. Guarded by
		// `IS NULL`, so re-running this at every open costs nothing once a row is backfilled.
		connection.execute(
			"UPDATE tasks SET asked_at = CAST(unixepoch(json_extract(record, '$.asked_at')) AS INTEGER)
				* 1000000000
			WHERE asked_at IS NULL",
			[],
		)?;
		// After the ALTER, which an older table needs before the column can be indexed. Answers GET
		// /counts's window scan and its group-by in one pass; see spec/architecture/ledger.md.
		connection.execute(
			"CREATE INDEX IF NOT EXISTS tasks_asked_at ON tasks (asked_at, service, state)",
			[],
		)?;
		Ok(Self { connection })
	}

	/// Upserts `task`, stamping `updated_at` as now, and answers the row kept -- the new task, or
	/// the one already there when `task` loses the rule spec/architecture/ledger.md states: a later
	/// `asked_at` is the same task asked again and always replaces what is kept; only within one
	/// asking (`asked_at` equal) does the older rule apply, that a `finished_at` older than the one
	/// kept does not replace it, and a task with none never replaces one that has it.
	pub fn upsert(&mut self, task: Task) -> anyhow::Result<StoredTask> {
		let transaction = self.connection.transaction()?;
		let stored = upsert_in(&transaction, task)?;
		transaction.commit()?;
		Ok(stored)
	}

	pub fn get(&self, service: &str, id: &str) -> anyhow::Result<Option<StoredTask>> {
		get_in(&self.connection, service, id)
	}

	/// The task, its events in `seq` order, and the tasks it is the parent of, newest first and
	/// capped at `CHILDREN`. `None` when there is no such task.
	pub fn view(&self, service: &str, id: &str) -> anyhow::Result<Option<TaskView>> {
		let Some(task) = get_in(&self.connection, service, id)? else { return Ok(None) };
		let mut select = self.connection.prepare(
			"SELECT seq, at, stage, level, message, data FROM events
			WHERE service = ?1 AND task = ?2 ORDER BY seq ASC",
		)?;
		let rows = select.query_map(params![service, id], |row| {
			let seq: i64 = row.get(0)?;
			let at: i64 = row.get(1)?;
			let stage: String = row.get(2)?;
			let level: String = row.get(3)?;
			let message: String = row.get(4)?;
			let data: String = row.get(5)?;
			Ok((seq, at, stage, level, message, data))
		})?;
		let mut events = Vec::new();
		for row in rows {
			let (seq, at, stage, level, message, data) = row?;
			events.push(Event {
				service: service.to_owned(),
				task: id.to_owned(),
				seq: seq as u64,
				at: Timestamp::from_nanosecond(at as i128)?,
				stage,
				level: match level.as_str() {
					"warn" => Level::Warn,
					"error" => Level::Error,
					_ => Level::Info,
				},
				message,
				data: serde_json::from_str(&data)?,
			});
		}
		let children = self.list(
			&Filter {
				parent_service: Some(service.to_owned()),
				parent_id: Some(id.to_owned()),
				..Filter::default()
			},
			None,
			CHILDREN,
		)?;
		Ok(Some(TaskView { task, events, children }))
	}

	/// Newest `updated_at` first, at most `limit` rows, narrowed by `filter` and, when given, only
	/// what is strictly older than `before`.
	pub fn list(
		&self,
		filter: &Filter,
		before: Option<&Cursor>,
		limit: usize,
	) -> anyhow::Result<Vec<StoredTask>> {
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
		if let (Some(service), Some(id)) = (&filter.parent_service, &filter.parent_id) {
			clauses.push("(parent_service = ? AND parent_id = ?)".to_owned());
			bound.push(Box::new(service.clone()));
			bound.push(Box::new(id.clone()));
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

	/// Grouped by service, the hour bucket of `asked_at`, and state, for the last `hours` whole
	/// hours plus the one under way. Oldest hour first, then service, then state, per
	/// spec/architecture/ledger.md, "Counted for telemetry". `hours` is the caller's to clamp.
	pub fn counts(&self, hours: u32) -> anyhow::Result<Vec<Count>> {
		let now = Timestamp::now().as_nanosecond() as i64;
		let current_bucket = now.div_euclid(NANOS_PER_HOUR);
		let window_start = (current_bucket - i64::from(hours)) * NANOS_PER_HOUR;
		let mut select = self.connection.prepare(
			"SELECT service, asked_at / ?1 AS bucket, state, COUNT(*) FROM tasks
			WHERE asked_at >= ?2
			GROUP BY bucket, service, state
			ORDER BY bucket ASC, service ASC, state ASC",
		)?;
		let rows = select.query_map(params![NANOS_PER_HOUR, window_start], |row| {
			let service: String = row.get(0)?;
			let bucket: i64 = row.get(1)?;
			let state: String = row.get(2)?;
			let count: i64 = row.get(3)?;
			Ok((service, bucket, state, count))
		})?;
		let mut counts = Vec::new();
		for row in rows {
			let (service, bucket, state, count) = row?;
			let hour = Timestamp::from_nanosecond((bucket * NANOS_PER_HOUR) as i128)?;
			counts.push(Count { service, hour, state, count });
		}
		Ok(counts)
	}

	/// Applies a batch of items in one transaction: a task item goes through the upsert rule, an
	/// event item is inserted once by `(service, task, seq)`, a duplicate ignored. Answers how many
	/// items were taken. See spec/architecture/ledger.md, "Pushed to, never asking".
	pub fn batch(&mut self, items: Vec<Item>) -> anyhow::Result<usize> {
		let transaction = self.connection.transaction()?;
		let taken = items.len();
		for item in items {
			match item {
				Item::Task(task) => {
					upsert_in(&transaction, task)?;
				}
				Item::Event(event) => insert_event(&transaction, &event)?,
			}
		}
		transaction.commit()?;
		Ok(taken)
	}
}

fn get_in(connection: &Connection, service: &str, id: &str) -> anyhow::Result<Option<StoredTask>> {
	let text: Option<String> = connection
		.query_row(
			"SELECT record FROM tasks WHERE service = ?1 AND id = ?2",
			params![service, id],
			|row| row.get(0),
		)
		.optional()?;
	Ok(text.map(|text| serde_json::from_str(&text)).transpose()?)
}

/// The upsert rule, run against any open transaction, so a batch shares one across the items it
/// carries.
fn upsert_in(transaction: &rusqlite::Transaction, task: Task) -> anyhow::Result<StoredTask> {
	let kept: Option<String> = transaction
		.query_row(
			"SELECT record FROM tasks WHERE service = ?1 AND id = ?2",
			params![task.record.service, task.record.id],
			|row| row.get(0),
		)
		.optional()?;
	let kept: Option<StoredTask> = kept.map(|text| serde_json::from_str(&text)).transpose()?;
	let losing = match &kept {
		None => false,
		Some(kept) if task.record.asked_at > kept.task.record.asked_at => false,
		Some(kept) if task.record.asked_at < kept.task.record.asked_at => true,
		Some(kept) => match (kept.task.record.finished_at, task.record.finished_at) {
			(Some(_), None) => true,
			(Some(old), Some(new)) => new < old,
			_ => false,
		},
	};
	if let Some(kept) = kept
		&& losing
	{
		return Ok(kept);
	}
	let updated_at = Timestamp::now();
	let stored = StoredTask { task, updated_at };
	let text = serde_json::to_string(&stored)?;
	transaction.execute(
		"INSERT INTO tasks (service, id, kind, state, caller, updated_at, finished_at, asked_at, parent_service, parent_id, record)
		VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
		ON CONFLICT (service, id) DO UPDATE SET
			kind = excluded.kind, state = excluded.state, caller = excluded.caller,
			updated_at = excluded.updated_at, finished_at = excluded.finished_at,
			asked_at = excluded.asked_at,
			parent_service = excluded.parent_service, parent_id = excluded.parent_id,
			record = excluded.record",
		params![
			stored.task.record.service,
			stored.task.record.id,
			stored.task.record.kind,
			state_word(stored.task.record.state),
			caller_word(stored.task.record.caller),
			updated_at.as_nanosecond() as i64,
			stored.task.record.finished_at.map(|at| at.as_nanosecond() as i64),
			stored.task.record.asked_at.as_nanosecond() as i64,
			stored.task.parent.as_ref().map(|parent| parent.service.clone()),
			stored.task.parent.as_ref().map(|parent| parent.id.clone()),
			text,
		],
	)?;
	Ok(stored)
}

/// Inserted once by `(service, task, seq)`; a duplicate is ignored, per "Pushed to, never asking".
fn insert_event(transaction: &rusqlite::Transaction, event: &Event) -> anyhow::Result<()> {
	transaction.execute(
		"INSERT OR IGNORE INTO events (service, task, seq, at, stage, level, message, data)
		VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
		params![
			event.service,
			event.task,
			event.seq as i64,
			event.at.as_nanosecond() as i64,
			event.stage,
			level_word(event.level),
			event.message,
			serde_json::to_string(&event.data)?,
		],
	)?;
	Ok(())
}

/// Test-only: overwrites a stored task's `updated_at` directly, keeping the column and the JSON
/// in step, so a paging test can force two rows to tie at the same millisecond.
#[cfg(test)]
impl Store {
	pub fn force_updated_at(&mut self, service: &str, id: &str, nanos: i64) {
		let mut stored = self.get(service, id).unwrap().unwrap();
		stored.updated_at = Timestamp::from_nanosecond(nanos as i128).unwrap();
		let text = serde_json::to_string(&stored).unwrap();
		self
			.connection
			.execute(
				"UPDATE tasks SET updated_at = ?1, record = ?2 WHERE service = ?3 AND id = ?4",
				params![nanos, text, service, id],
			)
			.unwrap();
	}

	/// Test-only: nulls a stored task's `asked_at` column directly, as a row from before the
	/// column existed reads after the ALTER, leaving the record's own `asked_at` as the only copy.
	pub fn force_asked_at_null(&mut self, service: &str, id: &str) {
		self
			.connection
			.execute(
				"UPDATE tasks SET asked_at = NULL WHERE service = ?1 AND id = ?2",
				params![service, id],
			)
			.unwrap();
	}
}

#[cfg(test)]
mod tests {
	use super::*;
	use ledger::Record;

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

	fn task(id: &str, state: State, finished_at: Option<&str>) -> Task {
		record(id, state, finished_at).into()
	}

	fn asked_at(id: &str, state: State, asked_at: &str, finished_at: Option<&str>) -> Task {
		Task {
			record: Record { asked_at: asked_at.parse().unwrap(), ..record(id, state, finished_at) },
			parent: None,
		}
	}

	fn event(task: &str, seq: u64) -> Event {
		Event {
			service: "shot".into(),
			task: task.into(),
			seq,
			at: "2026-09-28T12:00:00Z".parse().unwrap(),
			stage: "resolving".into(),
			level: Level::Info,
			message: "starting".into(),
			data: serde_json::Value::Null,
		}
	}

	fn open() -> (tempfile::TempDir, Store) {
		let directory = tempfile::tempdir().unwrap();
		let store = Store::open(&directory.path().join("ledger.db")).unwrap();
		(directory, store)
	}

	#[test]
	fn a_late_running_does_not_undo_a_done() {
		let (_directory, mut store) = open();
		store.upsert(task("a", State::Done, Some("2026-09-28T12:05:00Z"))).unwrap();
		let kept = store.upsert(task("a", State::Running, Some("2026-09-28T12:04:00Z"))).unwrap();
		assert_eq!(kept.task.record.state, State::Done);
		assert_eq!(store.get("shot", "a").unwrap().unwrap().task.record.state, State::Done);
	}

	#[test]
	fn a_record_without_finished_at_never_replaces_one_that_has_it() {
		let (_directory, mut store) = open();
		store.upsert(task("a", State::Done, Some("2026-09-28T12:05:00Z"))).unwrap();
		let kept = store.upsert(task("a", State::Running, None)).unwrap();
		assert_eq!(kept.task.record.state, State::Done);
	}

	#[test]
	fn a_later_asked_at_always_replaces_the_kept_one() {
		let (_directory, mut store) = open();
		store
			.upsert(asked_at("a", State::Failed, "2026-09-28T12:00:00Z", Some("2026-09-28T12:00:00Z")))
			.unwrap();
		let kept = store.upsert(asked_at("a", State::Queued, "2026-09-28T13:00:00Z", None)).unwrap();
		assert_eq!(kept.task.record.state, State::Queued);

		let (_directory, mut store) = open();
		store
			.upsert(asked_at("a", State::Failed, "2026-09-28T12:00:00Z", Some("2026-09-28T12:00:00Z")))
			.unwrap();
		let kept = store.upsert(asked_at("a", State::Queued, "2026-09-28T12:00:00Z", None)).unwrap();
		assert_eq!(kept.task.record.state, State::Failed);
	}

	#[test]
	fn a_later_finished_at_replaces_the_kept_one() {
		let (_directory, mut store) = open();
		store.upsert(task("a", State::Running, Some("2026-09-28T12:00:00Z"))).unwrap();
		let kept = store.upsert(task("a", State::Done, Some("2026-09-28T12:05:00Z"))).unwrap();
		assert_eq!(kept.task.record.state, State::Done);
	}

	#[test]
	fn sending_the_same_record_twice_is_harmless() {
		let (_directory, mut store) = open();
		let first = store.upsert(task("a", State::Queued, None)).unwrap();
		let second = store.upsert(task("a", State::Queued, None)).unwrap();
		assert_eq!(first.task, second.task);
	}

	#[test]
	fn lists_newest_updated_at_first_paged_and_filtered() {
		let (_directory, mut store) = open();
		for id in ["a", "b", "c"] {
			store.upsert(task(id, State::Done, Some("2026-09-28T12:00:00Z"))).unwrap();
		}
		store.upsert(task("d", State::Failed, Some("2026-09-28T12:00:00Z"))).unwrap();

		let all = store.list(&Filter::default(), None, 10).unwrap();
		assert_eq!(all.len(), 4);
		assert_eq!(all[0].task.record.id, "d");
		assert_eq!(all[3].task.record.id, "a");

		let page = store.list(&Filter::default(), None, 2).unwrap();
		assert_eq!(page.len(), 2);
		let cursor = Cursor {
			updated_at: page[1].updated_at.as_nanosecond() as i64,
			id: page[1].task.record.id.clone(),
		};
		let rest = store.list(&Filter::default(), Some(&cursor), 10).unwrap();
		assert_eq!(rest.len(), 2);
		assert_eq!(rest[0].task.record.id, all[2].task.record.id);

		let failed =
			store.list(&Filter { state: Some("failed".into()), ..Filter::default() }, None, 10).unwrap();
		assert_eq!(failed.len(), 1);
		assert_eq!(failed[0].task.record.id, "d");
	}

	#[test]
	fn a_cursor_round_trips_through_its_encoding() {
		let cursor = Cursor { updated_at: 12345, id: "with:colon".into() };
		assert_eq!(Cursor::parse(&cursor.encode()), Some(cursor));
	}

	#[test]
	fn a_batch_stores_a_task_and_its_events_once_even_sent_twice() {
		let (_directory, mut store) = open();
		let items = vec![
			Item::Task(task("a", State::Running, None)),
			Item::Event(event("a", 1)),
			Item::Event(event("a", 2)),
		];
		assert_eq!(store.batch(items.clone()).unwrap(), 3);
		assert_eq!(store.batch(items).unwrap(), 3);

		let view = store.view("shot", "a").unwrap().unwrap();
		assert_eq!(view.task.task.record.state, State::Running);
		assert_eq!(view.events.len(), 2);
		assert_eq!(view.events[0].seq, 1);
		assert_eq!(view.events[1].seq, 2);
	}

	#[test]
	fn events_answer_in_seq_order_however_they_arrived() {
		let (_directory, mut store) = open();
		store.upsert(task("a", State::Running, None)).unwrap();
		store
			.batch(vec![
				Item::Event(event("a", 5)),
				Item::Event(event("a", 1)),
				Item::Event(event("a", 3)),
			])
			.unwrap();
		let view = store.view("shot", "a").unwrap().unwrap();
		let seqs: Vec<u64> = view.events.iter().map(|event| event.seq).collect();
		assert_eq!(seqs, vec![1, 3, 5]);
	}

	#[test]
	fn the_task_view_carries_its_children_newest_first() {
		let (_directory, mut store) = open();
		store.upsert(task("parent", State::Running, None)).unwrap();
		let mut child_a = task("child-a", State::Running, None);
		child_a.parent = Some(ledger::Parent { service: "shot".into(), id: "parent".into() });
		let mut child_b = task("child-b", State::Running, None);
		child_b.parent = Some(ledger::Parent { service: "shot".into(), id: "parent".into() });
		store.upsert(child_a).unwrap();
		store.upsert(child_b).unwrap();

		let view = store.view("shot", "parent").unwrap().unwrap();
		assert_eq!(view.children.len(), 2);
		assert_eq!(view.children[0].task.record.id, "child-b");
		assert_eq!(view.children[1].task.record.id, "child-a");
	}

	#[test]
	fn the_parent_filter_narrows_the_list() {
		let (_directory, mut store) = open();
		store.upsert(task("parent", State::Running, None)).unwrap();
		let mut child = task("child", State::Running, None);
		child.parent = Some(ledger::Parent { service: "shot".into(), id: "parent".into() });
		store.upsert(child).unwrap();

		let filtered = store
			.list(
				&Filter {
					parent_service: Some("shot".into()),
					parent_id: Some("parent".into()),
					..Filter::default()
				},
				None,
				10,
			)
			.unwrap();
		assert_eq!(filtered.len(), 1);
		assert_eq!(filtered[0].task.record.id, "child");
	}

	#[test]
	fn the_upsert_rule_still_holds_through_a_batch() {
		let (_directory, mut store) = open();
		store.batch(vec![Item::Task(task("a", State::Done, Some("2026-09-28T12:05:00Z")))]).unwrap();
		store.batch(vec![Item::Task(task("a", State::Running, Some("2026-09-28T12:04:00Z")))]).unwrap();
		assert_eq!(store.get("shot", "a").unwrap().unwrap().task.record.state, State::Done);
	}

	/// A task `hours_ago` hours before now, for `service` under `id` and `state`. See
	/// spec/architecture/ledger.md, "Counted for telemetry".
	fn asked_hours_ago(service: &str, id: &str, state: State, hours_ago: i64) -> Task {
		let asked_at =
			Timestamp::now().checked_sub(jiff::SignedDuration::from_hours(hours_ago)).unwrap();
		Task {
			record: Record {
				service: service.into(),
				id: id.into(),
				kind: "capture".into(),
				state,
				caller: Caller::Public,
				asked_at,
				started_at: None,
				finished_at: None,
				summary: serde_json::json!({}),
				detail: None,
			},
			parent: None,
		}
	}

	#[test]
	fn counts_group_by_service_hour_bucket_and_state() {
		let (_directory, mut store) = open();
		store.upsert(asked_hours_ago("shot", "a", State::Done, 0)).unwrap();
		store.upsert(asked_hours_ago("shot", "b", State::Done, 0)).unwrap();
		store.upsert(asked_hours_ago("shot", "c", State::Failed, 0)).unwrap();
		store.upsert(asked_hours_ago("geo", "d", State::Done, 0)).unwrap();

		let counts = store.counts(1).unwrap();
		let shot_done = counts
			.iter()
			.find(|row| row.service == "shot" && row.state == "done")
			.expect("shot/done bucket");
		assert_eq!(shot_done.count, 2);
		let shot_failed = counts
			.iter()
			.find(|row| row.service == "shot" && row.state == "failed")
			.expect("shot/failed bucket");
		assert_eq!(shot_failed.count, 1);
		let geo_done = counts
			.iter()
			.find(|row| row.service == "geo" && row.state == "done")
			.expect("geo/done bucket");
		assert_eq!(geo_done.count, 1);
	}

	#[test]
	fn the_window_covers_the_last_hours_plus_the_one_under_way() {
		let (_directory, mut store) = open();
		store.upsert(asked_hours_ago("shot", "now", State::Done, 0)).unwrap();
		store.upsert(asked_hours_ago("shot", "one-ago", State::Done, 1)).unwrap();
		store.upsert(asked_hours_ago("shot", "two-ago", State::Done, 2)).unwrap();

		// hours=1 keeps the current hour plus one whole hour before it, so "two-ago" falls outside.
		let counts = store.counts(1).unwrap();
		let total: i64 = counts.iter().map(|row| row.count).sum();
		assert_eq!(total, 2);

		let counts = store.counts(2).unwrap();
		let total: i64 = counts.iter().map(|row| row.count).sum();
		assert_eq!(total, 3);
	}

	#[test]
	fn counts_are_empty_with_nothing_asked() {
		let (_directory, store) = open();
		assert!(store.counts(24).unwrap().is_empty());
	}

	#[test]
	fn a_row_with_asked_at_null_is_counted_after_reopening() {
		let directory = tempfile::tempdir().unwrap();
		let path = directory.path().join("ledger.db");
		let mut store = Store::open(&path).unwrap();
		store.upsert(asked_hours_ago("shot", "a", State::Done, 0)).unwrap();
		store.force_asked_at_null("shot", "a");
		assert!(store.counts(1).unwrap().is_empty());
		drop(store);

		// Reopening runs the backfill, which is what a pre-existing row relies on to be counted.
		let store = Store::open(&path).unwrap();
		let counts = store.counts(1).unwrap();
		let total: i64 = counts.iter().map(|row| row.count).sum();
		assert_eq!(total, 1);
	}

	/// A database as an older commit's `Store::open` left it, with tasks as its `upsert` wrote
	/// them, so today's `Store::open` meets every ALTER, backfill and index on the shape it exists
	/// for -- a fresh database never does. Add an entry the next time the schema changes; never
	/// replace one.
	struct HistoricalSchema {
		/// The commit this schema is frozen from, named in every failure so a mismatch is easy to
		/// place.
		name: &'static str,
		build: fn(&Path),
		verify: fn(&Store),
	}

	const HISTORICAL_SCHEMAS: &[HistoricalSchema] = &[
		HistoricalSchema {
			name: "5c055b24e8d9 (the ledger's first schema)",
			build: build_schema_v1,
			verify: verify_schema_v1,
		},
		HistoricalSchema {
			name: "bea017eed3cd (events and parent added, before asked_at)",
			build: build_schema_v2,
			verify: verify_schema_v2,
		},
	];

	fn timestamp_nanos(at: &str) -> i64 {
		at.parse::<Timestamp>().unwrap().as_nanosecond() as i64
	}

	/// The flat JSON an old `Stored` or `StoredTask` wrote: `Record`'s own fields plus
	/// `updated_at`, both flattened to the top level, and `parent` alongside them only from the
	/// schema where `Task` existed to carry it -- the same shape serves every historical fixture.
	fn old_record_json(
		id: &str,
		state: &str,
		asked_at: &str,
		parent: Option<(&str, &str)>,
	) -> String {
		let mut value = serde_json::json!({
			"service": "shot",
			"id": id,
			"kind": "capture",
			"state": state,
			"caller": "public",
			"asked_at": asked_at,
			"summary": {},
			"updated_at": asked_at,
		});
		if let Some((service, task_id)) = parent {
			value["parent"] = serde_json::json!({ "service": service, "id": task_id });
		}
		value.to_string()
	}

	/// The oldest schema this crate ever wrote: one `tasks` table, no `events`, no
	/// `parent_service`, `parent_id` or `asked_at` columns, and a bare `Record` (no `Task`
	/// wrapper) as the stored JSON. From 5c055b24e8d9, "feat: add the ledger, one record of every
	/// task any service is asked to do".
	fn build_schema_v1(path: &Path) {
		let connection = Connection::open(path).unwrap();
		connection
			.execute_batch(
				"CREATE TABLE tasks (
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
				CREATE INDEX tasks_updated_at ON tasks (updated_at, id);",
			)
			.unwrap();
		for (id, state) in [("a", "done"), ("b", "failed")] {
			let asked_at = Timestamp::now().to_string();
			connection
				.execute(
					"INSERT INTO tasks (service, id, kind, state, caller, updated_at, finished_at, record)
					VALUES ('shot', ?1, 'capture', ?2, 'public', ?3, NULL, ?4)",
					params![
						id,
						state,
						timestamp_nanos(&asked_at),
						old_record_json(id, state, &asked_at, None)
					],
				)
				.unwrap();
		}
	}

	fn verify_schema_v1(store: &Store) {
		let a = store.get("shot", "a").unwrap().expect("row a survives");
		assert_eq!(a.task.record.state, State::Done);
		assert!(a.task.parent.is_none());
		let b = store.get("shot", "b").unwrap().expect("row b survives");
		assert_eq!(b.task.record.state, State::Failed);

		let counts = store.counts(24).unwrap();
		let total: i64 = counts
			.iter()
			.filter(|row| row.service == "shot" && (row.state == "done" || row.state == "failed"))
			.map(|row| row.count)
			.sum();
		assert_eq!(total, 2, "both rows are backfilled into asked_at and so counted");
	}

	/// The schema after events and `parent` landed but before `asked_at`: `parent_service` and
	/// `parent_id` columns exist, `events` exists, and the stored JSON is a `Task` (`Record`
	/// flattened with an optional `parent`). From bea017eed3cd, "feat: record a task's events in
	/// order in the ledger, and tie tasks to their parent".
	fn build_schema_v2(path: &Path) {
		let connection = Connection::open(path).unwrap();
		connection
			.execute_batch(
				"CREATE TABLE tasks (
					service TEXT NOT NULL,
					id TEXT NOT NULL,
					kind TEXT NOT NULL,
					state TEXT NOT NULL,
					caller TEXT NOT NULL,
					updated_at INTEGER NOT NULL,
					finished_at INTEGER,
					parent_service TEXT,
					parent_id TEXT,
					record TEXT NOT NULL,
					PRIMARY KEY (service, id)
				) WITHOUT ROWID;
				CREATE INDEX tasks_updated_at ON tasks (updated_at, id);
				CREATE INDEX tasks_parent ON tasks (parent_service, parent_id, updated_at, id);
				CREATE TABLE events (
					service TEXT NOT NULL,
					task TEXT NOT NULL,
					seq INTEGER NOT NULL,
					at INTEGER NOT NULL,
					stage TEXT NOT NULL,
					level TEXT NOT NULL,
					message TEXT NOT NULL,
					data TEXT NOT NULL,
					PRIMARY KEY (service, task, seq)
				) WITHOUT ROWID;",
			)
			.unwrap();
		let asked_at = Timestamp::now().to_string();
		connection
			.execute(
				"INSERT INTO tasks
					(service, id, kind, state, caller, updated_at, finished_at, parent_service, parent_id, record)
				VALUES ('shot', 'c', 'capture', 'running', 'public', ?1, NULL, 'shot', 'a', ?2)",
				params![
					timestamp_nanos(&asked_at),
					old_record_json("c", "running", &asked_at, Some(("shot", "a")))
				],
			)
			.unwrap();
		connection
			.execute(
				"INSERT INTO events (service, task, seq, at, stage, level, message, data)
				VALUES ('shot', 'c', 1, ?1, 'resolving', 'info', 'starting', 'null')",
				params![timestamp_nanos(&asked_at)],
			)
			.unwrap();
	}

	fn verify_schema_v2(store: &Store) {
		let view = store.view("shot", "c").unwrap().expect("row c survives");
		assert_eq!(view.task.task.record.state, State::Running);
		assert_eq!(
			view.task.task.parent,
			Some(ledger::Parent { service: "shot".into(), id: "a".into() })
		);
		assert_eq!(view.events.len(), 1);
		assert_eq!(view.events[0].stage, "resolving");

		let counts = store.counts(24).unwrap();
		let total: i64 = counts
			.iter()
			.filter(|row| row.service == "shot" && row.state == "running")
			.map(|row| row.count)
			.sum();
		assert_eq!(total, 1, "the pre-asked_at row is backfilled and counted too");
	}

	/// The index a query plan can actually use is not the same fact as a row in `sqlite_master`
	/// existing under that name, but a name collision with a non-index object is not a failure
	/// mode this crate's own migrations can hit, so the cheaper check is the one worth writing.
	fn index_exists(store: &Store, name: &str) -> bool {
		store
			.connection
			.query_row(
				"SELECT 1 FROM sqlite_master WHERE type = 'index' AND name = ?1",
				params![name],
				|_| Ok(()),
			)
			.optional()
			.unwrap()
			.is_some()
	}

	#[test]
	fn every_historical_schema_opens_backfills_and_reopens_cleanly() {
		for schema in HISTORICAL_SCHEMAS {
			let directory = tempfile::tempdir().unwrap();
			let path = directory.path().join("ledger.db");
			(schema.build)(&path);

			let store = Store::open(&path)
				.unwrap_or_else(|error| panic!("{}: failed to open: {error}", schema.name));
			assert!(index_exists(&store, "tasks_asked_at"), "{}: tasks_asked_at exists", schema.name);
			assert!(index_exists(&store, "tasks_parent"), "{}: tasks_parent exists", schema.name);
			(schema.verify)(&store);
			drop(store);

			// The ALTERs are guarded by SQLite's own "column already exists" error and the
			// backfill by `WHERE asked_at IS NULL`, so a second open must be as harmless as the
			// first.
			let reopened = Store::open(&path)
				.unwrap_or_else(|error| panic!("{}: failed to reopen: {error}", schema.name));
			(schema.verify)(&reopened);
		}
	}
}
