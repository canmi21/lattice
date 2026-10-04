//! Every closed hour, kept for good in one SQLite file in the meter's directory. An hour written
//! twice -- the open one saved on the way down, then finished after a restart -- is merged by
//! weight, never replaced. See spec/architecture/meter.md, "Retention".

use crate::retention::{Point, Summary, asks_for};
use rusqlite::{Connection, params};
use std::collections::BTreeMap;
use std::path::Path;

pub struct Store {
	connection: Connection,
}

impl Store {
	pub fn open(path: &Path) -> anyhow::Result<Self> {
		let connection = Connection::open(path)?;
		connection.execute_batch(
			"PRAGMA journal_mode = WAL;
			CREATE TABLE IF NOT EXISTS hours (
				metric TEXT NOT NULL,
				at INTEGER NOT NULL,
				average REAL NOT NULL,
				minimum REAL NOT NULL,
				maximum REAL NOT NULL,
				count INTEGER NOT NULL,
				PRIMARY KEY (metric, at)
			) WITHOUT ROWID;",
		)?;
		Ok(Self { connection })
	}

	pub fn keep(&mut self, hour: &Point) -> anyhow::Result<()> {
		let transaction = self.connection.transaction()?;
		{
			let mut insert = transaction.prepare_cached(
				"INSERT INTO hours (metric, at, average, minimum, maximum, count)
				VALUES (?1, ?2, ?3, ?4, ?5, ?6)
				ON CONFLICT (metric, at) DO UPDATE SET
					average = (average * count + excluded.average * excluded.count)
						/ (count + excluded.count),
					minimum = min(minimum, excluded.minimum),
					maximum = max(maximum, excluded.maximum),
					count = count + excluded.count",
			)?;
			for (metric, summary) in &hour.values {
				insert.execute(params![
					metric,
					hour.at,
					summary.average,
					summary.minimum,
					summary.maximum,
					summary.count as i64
				])?;
			}
		}
		transaction.commit()?;
		Ok(())
	}

	/// The hours from `since` up to but not including `until`, oldest first, with the metrics asked
	/// for; every metric when none is.
	pub fn hours(&self, metrics: &[String], since: i64, until: i64) -> anyhow::Result<Vec<Point>> {
		let mut select = self.connection.prepare_cached(
			"SELECT metric, at, average, minimum, maximum, count FROM hours
			WHERE at >= ?1 AND at < ?2 ORDER BY at",
		)?;
		let mut points: BTreeMap<i64, Point> = BTreeMap::new();
		let rows = select.query_map(params![since, until], |row| {
			let summary = Summary {
				average: row.get(2)?,
				minimum: row.get(3)?,
				maximum: row.get(4)?,
				count: row.get::<_, i64>(5)? as u64,
			};
			Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?, summary))
		})?;
		for row in rows {
			let (metric, at, summary) = row?;
			if !asks_for(metrics, &metric) {
				continue;
			}
			points
				.entry(at)
				.or_insert_with(|| Point { at, values: BTreeMap::new() })
				.values
				.insert(metric, summary);
		}
		Ok(points.into_values().collect())
	}
}

#[cfg(test)]
mod tests {
	use super::*;

	fn hour(at: i64, average: f64, count: u64) -> Point {
		let summary = Summary { average, minimum: average, maximum: average, count };
		Point {
			at,
			values: [("cpu.usage".to_owned(), summary), ("memory.used".to_owned(), summary)].into(),
		}
	}

	#[test]
	fn keeps_hours_and_merges_one_written_twice() {
		let directory = tempfile::tempdir().unwrap();
		let path = directory.path().join("hours.db");
		let mut store = Store::open(&path).unwrap();
		store.keep(&hour(0, 10.0, 1800)).unwrap();
		store.keep(&hour(3600, 40.0, 3600)).unwrap();
		drop(store);

		// Reopened, as after a restart halfway through the first hour.
		let mut store = Store::open(&path).unwrap();
		store.keep(&hour(0, 30.0, 1800)).unwrap();
		let hours = store.hours(&["cpu.usage".to_owned()], 0, 7200).unwrap();
		assert_eq!(hours.len(), 2);
		assert_eq!(hours[0].values.len(), 1);
		assert_eq!(
			hours[0].values["cpu.usage"],
			Summary { average: 20.0, minimum: 10.0, maximum: 30.0, count: 3600 }
		);
		assert_eq!(store.hours(&[], 3600, 7200).unwrap()[0].values.len(), 2);
		assert!(store.hours(&[], 7200, 10_800).unwrap().is_empty());
	}
}
