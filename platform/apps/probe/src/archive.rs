//! Every round, whole and for good, in `probe.db`: the archive the public `probe` scope answers
//! from and the thinning summarizes from. See spec/architecture/probe.md, "Where the results go".

use crate::round::Round;
use rusqlite::{Connection, params};
use std::path::Path;

pub struct Archive {
	connection: Connection,
}

/// A page of one check's rounds, and where the next starts when there is one.
#[derive(Debug, PartialEq, Eq)]
pub struct Page {
	pub rounds: Vec<Round>,
	/// The next page's `since`, in whole seconds.
	pub next: Option<i64>,
}

impl Archive {
	pub fn open(path: &Path) -> rusqlite::Result<Self> {
		let connection = Connection::open(path)?;
		connection.execute_batch(
			"PRAGMA journal_mode = WAL;
			PRAGMA synchronous = NORMAL;
			PRAGMA busy_timeout = 5000;
			CREATE TABLE IF NOT EXISTS results (
				check_id TEXT NOT NULL,
				place TEXT NOT NULL,
				at INTEGER NOT NULL,
				ok INTEGER NOT NULL,
				duration_ms INTEGER NOT NULL,
				detail TEXT,
				PRIMARY KEY (check_id, place, at)
			) WITHOUT ROWID;
			CREATE INDEX IF NOT EXISTS results_at ON results (place, at);",
		)?;
		Ok(Self { connection })
	}

	/// Keep a batch in one transaction. A round already kept -- the same check, place and moment --
	/// is kept once.
	pub fn keep(&mut self, place: &str, rounds: &[Round]) -> rusqlite::Result<()> {
		let transaction = self.connection.transaction()?;
		{
			let mut insert = transaction.prepare_cached(
				"INSERT OR IGNORE INTO results (check_id, place, at, ok, duration_ms, detail)
				VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
			)?;
			for round in rounds {
				insert.execute(params![
					round.check,
					place,
					round.at,
					round.ok,
					round.duration_ms,
					round.detail
				])?;
			}
		}
		transaction.commit()
	}

	/// One check's rounds from `since` up to but not including `until`, whole seconds, oldest
	/// first, at most `most`. A page that would be cut inside one second ends before that second
	/// instead, and says it as the next `since`, so no round is answered twice or skipped.
	pub fn page(
		&self,
		check: &str,
		place: &str,
		since: i64,
		until: i64,
		most: usize,
	) -> rusqlite::Result<Page> {
		let mut select = self.connection.prepare_cached(
			"SELECT at, ok, duration_ms, detail FROM results
			WHERE check_id = ?1 AND place = ?2 AND at >= ?3 AND at < ?4
			ORDER BY at LIMIT ?5",
		)?;
		let limit = i64::try_from(most).unwrap_or(i64::MAX).saturating_add(1);
		let rows = select.query_map(
			params![check, place, since.saturating_mul(1000), until.saturating_mul(1000), limit],
			|row| {
				Ok(Round {
					check: check.to_owned(),
					at: row.get(0)?,
					ok: row.get(1)?,
					duration_ms: row.get(2)?,
					detail: row.get(3)?,
				})
			},
		)?;
		let mut rounds = rows.collect::<rusqlite::Result<Vec<_>>>()?;
		if rounds.len() <= most {
			return Ok(Page { rounds, next: None });
		}
		rounds.truncate(most);
		let last = rounds.last().map(|round| round.at.div_euclid(1000)).unwrap_or(since);
		let first = rounds.first().map(|round| round.at.div_euclid(1000)).unwrap_or(since);
		if first == last {
			// A whole page inside one second: answer it and go on from the next. A check is asked
			// at most once a second, so a real second never holds more than a page.
			return Ok(Page { rounds, next: Some(last + 1) });
		}
		rounds.retain(|round| round.at.div_euclid(1000) < last);
		Ok(Page { rounds, next: Some(last) })
	}

	/// Every round of `place` from `from` up to but not including `to`, milliseconds, as
	/// `(check, ok, duration_ms)`: what one bucket of the thinning summarizes.
	pub fn span(
		&self,
		place: &str,
		from: i64,
		to: i64,
	) -> rusqlite::Result<Vec<(String, bool, u32)>> {
		let mut select = self.connection.prepare_cached(
			"SELECT check_id, ok, duration_ms FROM results WHERE place = ?1 AND at >= ?2 AND at < ?3",
		)?;
		let rows = select
			.query_map(params![place, from, to], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))?;
		rows.collect()
	}
}

#[cfg(test)]
mod tests {
	use super::*;

	fn round(check: &str, at: i64, ok: bool) -> Round {
		Round {
			check: check.into(),
			at,
			ok,
			duration_ms: 7,
			detail: (!ok).then(|| "status 502".into()),
		}
	}

	#[test]
	fn keeps_rounds_once_and_answers_a_span() {
		let directory = tempfile::tempdir().unwrap();
		let mut archive = Archive::open(&directory.path().join("probe.db")).unwrap();
		let rounds = [round("a", 1_000, true), round("b", 1_500, false), round("a", 2_000, false)];
		archive.keep("home", &rounds).unwrap();
		archive.keep("home", &rounds[..1]).unwrap();
		let span = archive.span("home", 1_000, 2_000).unwrap();
		assert_eq!(span.len(), 2);
		assert!(span.contains(&("b".into(), false, 7)));
		assert!(archive.span("vps", 0, 10_000).unwrap().is_empty());
	}

	#[test]
	fn a_page_ends_on_a_whole_second() {
		let directory = tempfile::tempdir().unwrap();
		let mut archive = Archive::open(&directory.path().join("probe.db")).unwrap();
		let rounds: Vec<Round> =
			[10_000, 10_500, 11_000, 11_200, 11_400, 12_000].map(|at| round("a", at, true)).to_vec();
		archive.keep("home", &rounds).unwrap();

		let all = archive.page("a", "home", 10, 13, 10).unwrap();
		assert_eq!((all.rounds.len(), all.next), (6, None));
		// Four would cut second 11 in two, so the page ends at 11 and says so.
		let first = archive.page("a", "home", 10, 13, 4).unwrap();
		assert_eq!(first.rounds.iter().map(|round| round.at).collect::<Vec<_>>(), [10_000, 10_500]);
		assert_eq!(first.next, Some(11));
		let second = archive.page("a", "home", 11, 13, 4).unwrap();
		assert_eq!((second.rounds.len(), second.next), (4, None));
		// A page that fits inside one second goes on from the next.
		let tight = archive.page("a", "home", 11, 13, 2).unwrap();
		assert_eq!((tight.rounds.len(), tight.next), (2, Some(12)));
		assert_eq!(first.rounds[0].detail, None);
	}
}
