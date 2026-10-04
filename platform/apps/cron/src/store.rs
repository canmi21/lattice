//! Each job's last run, kept in `cron.db` so a restart knows what it missed. See
//! spec/architecture/cron.md, "Missed runs".

use jiff::Timestamp;
use rusqlite::{Connection, OptionalExtension, params};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::Path;

pub const FILE: &str = "cron.db";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Outcome {
	Running,
	Done,
	Failed,
	Skipped,
}

/// A job's latest run, whatever started it.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Last {
	/// The run's id, which is its ledger task's.
	pub run: String,
	/// The due time it ran for; none for one asked by hand.
	pub due: Option<Timestamp>,
	pub started_at: Timestamp,
	pub finished_at: Option<Timestamp>,
	pub outcome: Outcome,
	/// The status the service answered with, when it answered.
	pub status: Option<u16>,
	pub detail: Option<String>,
}

pub struct Store {
	connection: Connection,
}

impl Store {
	pub fn open(path: &Path) -> anyhow::Result<Self> {
		let connection = Connection::open(path)?;
		// `due` is the last scheduled time handled, run or skipped, which is what catch-up reads;
		// `last` is the latest run of any kind, as JSON.
		connection.execute_batch(
			"PRAGMA journal_mode = WAL;
			CREATE TABLE IF NOT EXISTS jobs (
				service TEXT NOT NULL,
				name TEXT NOT NULL,
				due INTEGER,
				last TEXT,
				PRIMARY KEY (service, name)
			) WITHOUT ROWID;",
		)?;
		Ok(Self { connection })
	}

	/// The last scheduled time handled for each job.
	pub fn due(&self, service: &str, name: &str) -> anyhow::Result<Option<Timestamp>> {
		let seconds: Option<Option<i64>> = self
			.connection
			.query_row(
				"SELECT due FROM jobs WHERE service = ?1 AND name = ?2",
				params![service, name],
				|row| row.get(0),
			)
			.optional()?;
		Ok(seconds.flatten().and_then(|seconds| Timestamp::from_second(seconds).ok()))
	}

	pub fn set_due(&self, service: &str, name: &str, due: Timestamp) -> anyhow::Result<()> {
		self.connection.execute(
			"INSERT INTO jobs (service, name, due) VALUES (?1, ?2, ?3)
			ON CONFLICT (service, name) DO UPDATE SET due = excluded.due",
			params![service, name, due.as_second()],
		)?;
		Ok(())
	}

	pub fn set_last(&self, service: &str, name: &str, last: &Last) -> anyhow::Result<()> {
		self.connection.execute(
			"INSERT INTO jobs (service, name, last) VALUES (?1, ?2, ?3)
			ON CONFLICT (service, name) DO UPDATE SET last = excluded.last",
			params![service, name, serde_json::to_string(last)?],
		)?;
		Ok(())
	}

	/// Every job's latest run, by `(service, name)`. A row that no longer reads is passed over.
	pub fn lasts(&self) -> anyhow::Result<HashMap<(String, String), Last>> {
		let mut statement =
			self.connection.prepare("SELECT service, name, last FROM jobs WHERE last IS NOT NULL")?;
		let rows = statement.query_map([], |row| {
			Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, String>(2)?))
		})?;
		let mut lasts = HashMap::new();
		for row in rows {
			let (service, name, text) = row?;
			if let Ok(last) = serde_json::from_str(&text) {
				lasts.insert((service, name), last);
			}
		}
		Ok(lasts)
	}
}

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn keeps_due_and_last_apart() {
		let directory = tempfile::tempdir().unwrap();
		let store = Store::open(&directory.path().join(FILE)).unwrap();
		assert_eq!(store.due("geo", "refresh").unwrap(), None);
		let due: Timestamp = "2026-09-28T04:00:00Z".parse().unwrap();
		store.set_due("geo", "refresh", due).unwrap();
		let last = Last {
			run: "r".into(),
			due: None,
			started_at: due,
			finished_at: Some(due),
			outcome: Outcome::Done,
			status: Some(200),
			detail: None,
		};
		store.set_last("geo", "refresh", &last).unwrap();
		assert_eq!(store.due("geo", "refresh").unwrap(), Some(due));
		assert_eq!(store.lasts().unwrap()[&("geo".into(), "refresh".into())], last);

		// And across a reopen, as after a restart.
		drop(store);
		let store = Store::open(&directory.path().join(FILE)).unwrap();
		assert_eq!(store.due("geo", "refresh").unwrap(), Some(due));
	}
}
