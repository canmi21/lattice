//! The status database the page reads: raw rounds for ten minutes, rolled up by grain as they
//! age, thinned by window and within a budget -- written every ten seconds, and never in the way
//! of checking. See spec/architecture/probe.md, "Where the results go".

use crate::archive::Archive;
use crate::checks::Check;
use crate::rollup::{self, Grain, Summary, Windows};
use crate::round::Round;
use sqlx_core::connection::Connection;
use sqlx_core::executor::Executor;
use sqlx_postgres::{PgConnectOptions, PgConnection, PgSslMode};
use std::collections::{HashSet, VecDeque};
use std::future::Future;
use std::str::FromStr;
use std::sync::{Arc, Mutex};

/// How many rounds wait while the database cannot be reached; past it the oldest go. Ten
/// minutes of a round a second from each of some fifteen checks -- older than ten minutes they
/// would be thinned as soon as written anyway.
pub const WAITING: usize = 10_000;

/// Rows per insert.
const BATCH: usize = 1_000;

/// Buckets of one grain summarized per pass, so catching up after an outage is spread out.
const BUCKETS: usize = 60;

/// The size is measured every this many passes: once a minute.
const MEASURE_EVERY: u64 = 6;

/// One bucket of one check, ready to write.
#[derive(Debug, Clone, PartialEq)]
pub struct Rollup {
	pub check: String,
	pub bucket_start: i64,
	pub summary: Summary,
}

/// What the writer asks of Postgres; a fake one in the tests. Instants are milliseconds since the
/// epoch throughout.
pub trait Database: Send + 'static {
	/// Connect, apply the migrations not yet applied, and bring `checks` in line with the file.
	fn open(
		&mut self,
		checks: &[Check],
		place: &str,
	) -> impl Future<Output = Result<(), String>> + Send;
	fn close(&mut self);
	fn insert(
		&mut self,
		place: &str,
		rounds: &[Round],
	) -> impl Future<Output = Result<(), String>> + Send;
	/// The newest bucket of `grain` written for `place`, if any.
	fn latest(
		&mut self,
		grain: Grain,
		place: &str,
	) -> impl Future<Output = Result<Option<i64>, String>> + Send;
	fn rollup(
		&mut self,
		grain: Grain,
		place: &str,
		rows: &[Rollup],
	) -> impl Future<Output = Result<(), String>> + Send;
	/// Delete raw rounds before `raw_before`, and each grain's buckets before its instant.
	fn thin(
		&mut self,
		raw_before: i64,
		grains: &[(Grain, i64)],
	) -> impl Future<Output = Result<(), String>> + Send;
	/// Bytes the tables take, indexes included.
	fn size(&mut self) -> impl Future<Output = Result<u64, String>> + Send;
}

pub struct Writer<D: Database> {
	database: D,
	place: String,
	checks: Vec<Check>,
	queue: VecDeque<Round>,
	/// Whether the database is open: connected, migrated and its checks upserted.
	open: bool,
	/// Per grain, the first bucket not yet summarized; `None` until read from the database.
	cursors: [Option<i64>; 5],
	windows: Windows,
	shortened_at: Option<u64>,
	passes: u64,
}

impl<D: Database> Writer<D> {
	pub fn new(database: D, place: String, checks: Vec<Check>) -> Self {
		Self {
			database,
			place,
			checks,
			queue: VecDeque::new(),
			open: false,
			cursors: [None; 5],
			windows: Windows::default(),
			shortened_at: None,
			passes: 0,
		}
	}

	/// Queue a round for the next pass, the oldest dropped past `WAITING`.
	pub fn push(&mut self, round: Round) {
		if self.queue.len() >= WAITING {
			self.queue.pop_front();
		}
		self.queue.push_back(round);
	}

	pub fn waiting(&self) -> usize {
		self.queue.len()
	}

	/// Give up on the connection, as a failed pass does: the next pass connects again.
	pub fn abandon(&mut self) {
		self.database.close();
		self.open = false;
	}

	pub fn windows(&self) -> &Windows {
		&self.windows
	}

	/// One pass. A failure anywhere closes the connection, keeps what is queued, and the next
	/// pass starts by connecting again.
	pub async fn pass(&mut self, archive: &Arc<Mutex<Archive>>, now: i64) {
		if !self.open {
			match self.database.open(&self.checks, &self.place).await {
				Ok(()) => self.open = true,
				Err(error) => {
					eprintln!("probe: the status database: {error}");
					self.drop_stale(now);
					return;
				}
			}
		}
		if let Err(error) = self.write(archive, now).await {
			eprintln!("probe: the status database: {error}");
			self.abandon();
		}
	}

	/// Rounds older than the raw window would be thinned as soon as written.
	fn drop_stale(&mut self, now: i64) {
		self.queue.retain(|round| round.at >= now - rollup::RAW_WINDOW);
	}

	async fn write(&mut self, archive: &Arc<Mutex<Archive>>, now: i64) -> Result<(), String> {
		self.drop_stale(now);
		while !self.queue.is_empty() {
			let batch: Vec<Round> = self.queue.iter().take(BATCH).cloned().collect();
			self.database.insert(&self.place, &batch).await?;
			self.queue.drain(..batch.len());
		}
		self.roll_up(archive, now).await?;
		self.thin(now).await?;
		self.passes += 1;
		if self.passes % MEASURE_EVERY == 1 {
			let size = self.database.size().await?;
			if rollup::over_budget(size, rollup::BUDGET, self.shortened_at)
				&& let Some(grain) = self.windows.shorten()
			{
				eprintln!(
					"probe: the status tables are {size} bytes; keeping {} for {} s now",
					grain.name(),
					self.windows.of(grain) / 1000
				);
				self.shortened_at = Some(size);
				self.thin(now).await?;
			}
		}
		Ok(())
	}

	/// Summarize every settled bucket of every grain from the archive -- whole, so a bucket
	/// that fell in an outage is summarized as well as any -- and write it.
	async fn roll_up(&mut self, archive: &Arc<Mutex<Archive>>, now: i64) -> Result<(), String> {
		let declared: HashSet<String> = self.checks.iter().map(|check| check.id.clone()).collect();
		for grain in Grain::ALL {
			let index = Grain::ALL.iter().position(|each| *each == grain).unwrap_or_default();
			let cursor = match self.cursors[index] {
				Some(cursor) => cursor,
				None => self.database.latest(grain, &self.place).await?.map_or(0, |at| at + grain.length()),
			};
			let buckets = rollup::ready(grain, cursor, self.windows.of(grain), now, BUCKETS);
			let Some(&last) = buckets.last() else {
				self.cursors[index] = Some(cursor);
				continue;
			};
			let rows = summarize(archive, &self.place, grain, buckets, &declared).await?;
			if !rows.is_empty() {
				self.database.rollup(grain, &self.place, &rows).await?;
			}
			self.cursors[index] = Some(last + grain.length());
		}
		Ok(())
	}

	async fn thin(&mut self, now: i64) -> Result<(), String> {
		let grains: Vec<(Grain, i64)> =
			Grain::ALL.iter().map(|&grain| (grain, now - self.windows.of(grain))).collect();
		self.database.thin(now - rollup::RAW_WINDOW, &grains).await
	}
}

/// Read each bucket's rounds from the archive, off the async threads, and summarize them per
/// check -- only the checks declared now, since `rollups` names a check by its row in `checks`.
async fn summarize(
	archive: &Arc<Mutex<Archive>>,
	place: &str,
	grain: Grain,
	buckets: Vec<i64>,
	declared: &HashSet<String>,
) -> Result<Vec<Rollup>, String> {
	let archive = archive.clone();
	let place = place.to_owned();
	let declared = declared.clone();
	tokio::task::spawn_blocking(move || {
		let archive = archive.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
		let mut rows = Vec::new();
		for start in buckets {
			let rounds =
				archive.span(&place, start, start + grain.length()).map_err(|e| e.to_string())?;
			for (check, summary) in rollup::summarize_each(&rounds) {
				if declared.contains(&check) {
					rows.push(Rollup { check, bucket_start: start, summary });
				}
			}
		}
		Ok(rows)
	})
	.await
	.map_err(|error| error.to_string())?
}

/// Supabase's Postgres, over its session pooler: one long-lived connection, TLS required. See
/// spec/architecture/probe.md, "Where the results go".
pub struct Postgres {
	options: PgConnectOptions,
	connection: Option<PgConnection>,
	migrated: bool,
}

impl Postgres {
	/// From `SUPABASE_DATABASE_URL`. A URL asking for less than TLS is raised to it; one asking
	/// for more -- a verified certificate -- keeps it.
	pub fn new(url: &str) -> Result<Self, String> {
		let mut options = PgConnectOptions::from_str(url).map_err(|error| error.to_string())?;
		if matches!(options.get_ssl_mode(), PgSslMode::Disable | PgSslMode::Allow | PgSslMode::Prefer) {
			options = options.ssl_mode(PgSslMode::Require);
		}
		Ok(Self { options, connection: None, migrated: false })
	}

	fn connection(&mut self) -> Result<&mut PgConnection, String> {
		self.connection.as_mut().ok_or_else(|| "not connected".to_owned())
	}
}

fn seconds(at: i64) -> f64 {
	at as f64 / 1000.0
}

fn failed(error: sqlx_core::Error) -> String {
	error.to_string()
}

impl Database for Postgres {
	async fn open(&mut self, checks: &[Check], place: &str) -> Result<(), String> {
		let mut connection = PgConnection::connect_with(&self.options).await.map_err(failed)?;
		if !self.migrated {
			// `run_direct` is `run` without `Acquire`, whose bound is not general enough for a future
			// that has to be `Send`; sqlx names it for exactly that.
			let migrated = crate::schema::migrator().run_direct(None, &mut connection, false).await;
			migrated.map_err(|error| error.to_string())?;
			self.migrated = true;
		}
		for check in checks {
			sqlx_core::query::query(
				"insert into checks (id, name, kind, target, place, interval_seconds, updated_at)
				values ($1, $2, $3, $4, $5, $6, now())
				on conflict (id) do update set name = excluded.name, kind = excluded.kind,
					target = excluded.target, place = excluded.place,
					interval_seconds = excluded.interval_seconds, updated_at = excluded.updated_at",
			)
			.bind(&check.id)
			.bind(&check.name)
			.bind(check.kind.name())
			.bind(&check.target)
			.bind(place)
			.bind(check.interval.as_secs_f64().round() as i32)
			.execute(&mut connection)
			.await
			.map_err(failed)?;
		}
		self.connection = Some(connection);
		Ok(())
	}

	fn close(&mut self) {
		// Dropped rather than closed politely: the connection is what just failed.
		self.connection = None;
	}

	async fn insert(&mut self, place: &str, rounds: &[Round]) -> Result<(), String> {
		let checks: Vec<&str> = rounds.iter().map(|round| round.check.as_str()).collect();
		let at: Vec<f64> = rounds.iter().map(|round| seconds(round.at)).collect();
		let ok: Vec<bool> = rounds.iter().map(|round| round.ok).collect();
		let duration: Vec<i32> =
			rounds.iter().map(|round| i32::try_from(round.duration_ms).unwrap_or(i32::MAX)).collect();
		let detail: Vec<Option<&str>> = rounds.iter().map(|round| round.detail.as_deref()).collect();
		let connection = self.connection()?;
		sqlx_core::query::query(
			"insert into results (check_id, place, at, ok, duration_ms, detail)
			select c, $2, to_timestamp(a), o, d, t
			from unnest($1::text[], $3::float8[], $4::bool[], $5::int[], $6::text[]) as u(c, a, o, d, t)
			on conflict do nothing",
		)
		.bind(checks)
		.bind(place)
		.bind(at)
		.bind(ok)
		.bind(duration)
		.bind(detail)
		.execute(connection)
		.await
		.map_err(failed)?;
		Ok(())
	}

	async fn latest(&mut self, grain: Grain, place: &str) -> Result<Option<i64>, String> {
		let connection = self.connection()?;
		sqlx_core::query_scalar::query_scalar::<_, Option<i64>>(
			"select (extract(epoch from max(bucket_start)) * 1000)::bigint from rollups
			where grain = $1 and place = $2",
		)
		.bind(grain.name())
		.bind(place)
		.fetch_one(connection)
		.await
		.map_err(failed)
	}

	async fn rollup(&mut self, grain: Grain, place: &str, rows: &[Rollup]) -> Result<(), String> {
		let checks: Vec<&str> = rows.iter().map(|row| row.check.as_str()).collect();
		let starts: Vec<f64> = rows.iter().map(|row| seconds(row.bucket_start)).collect();
		let column =
			|field: fn(&Summary) -> i32| rows.iter().map(|row| field(&row.summary)).collect::<Vec<_>>();
		let (passed, failed_rounds) = (column(|s| s.passed), column(|s| s.failed));
		let (median, worst) = (column(|s| s.median_ms), column(|s| s.worst_ms));
		let connection = self.connection()?;
		sqlx_core::query::query(
			"insert into rollups
				(check_id, place, grain, bucket_start, passed, failed, median_ms, worst_ms)
			select c, $2, $3, to_timestamp(b), p, f, m, w
			from unnest($1::text[], $4::float8[], $5::int[], $6::int[], $7::int[], $8::int[])
				as u(c, b, p, f, m, w)
			on conflict (check_id, place, grain, bucket_start) do update set
				passed = excluded.passed, failed = excluded.failed,
				median_ms = excluded.median_ms, worst_ms = excluded.worst_ms",
		)
		.bind(checks)
		.bind(place)
		.bind(grain.name())
		.bind(starts)
		.bind(passed)
		.bind(failed_rounds)
		.bind(median)
		.bind(worst)
		.execute(connection)
		.await
		.map_err(failed)?;
		Ok(())
	}

	async fn thin(&mut self, raw_before: i64, grains: &[(Grain, i64)]) -> Result<(), String> {
		let connection = self.connection()?;
		sqlx_core::query::query("delete from results where at < to_timestamp($1)")
			.bind(seconds(raw_before))
			.execute(&mut *connection)
			.await
			.map_err(failed)?;
		for (grain, before) in grains {
			sqlx_core::query::query(
				"delete from rollups where grain = $1 and bucket_start < to_timestamp($2)",
			)
			.bind(grain.name())
			.bind(seconds(*before))
			.execute(&mut *connection)
			.await
			.map_err(failed)?;
		}
		Ok(())
	}

	async fn size(&mut self) -> Result<u64, String> {
		let connection = self.connection()?;
		let size: i64 = connection
			.fetch_one(
				"select (pg_total_relation_size('results') + pg_total_relation_size('rollups'))::bigint",
			)
			.await
			.map_err(failed)
			.and_then(|row| sqlx_core::row::Row::try_get(&row, 0).map_err(failed))?;
		Ok(u64::try_from(size).unwrap_or_default())
	}
}

#[cfg(test)]
mod tests {
	use super::*;

	/// Records what it was asked; fails every call while `down`.
	#[derive(Default)]
	struct Fake {
		down: bool,
		opened: u32,
		rounds: Vec<Round>,
		rollups: Vec<(Grain, Rollup)>,
		thinned: Vec<(i64, Vec<(Grain, i64)>)>,
		size: u64,
	}

	impl Database for Fake {
		async fn open(&mut self, _checks: &[Check], _place: &str) -> Result<(), String> {
			if self.down {
				return Err("down".into());
			}
			self.opened += 1;
			Ok(())
		}
		fn close(&mut self) {}
		async fn insert(&mut self, _place: &str, rounds: &[Round]) -> Result<(), String> {
			if self.down {
				return Err("down".into());
			}
			self.rounds.extend_from_slice(rounds);
			Ok(())
		}
		async fn latest(&mut self, _grain: Grain, _place: &str) -> Result<Option<i64>, String> {
			Ok(None)
		}
		async fn rollup(&mut self, grain: Grain, _place: &str, rows: &[Rollup]) -> Result<(), String> {
			self.rollups.extend(rows.iter().map(|row| (grain, row.clone())));
			Ok(())
		}
		async fn thin(&mut self, raw_before: i64, grains: &[(Grain, i64)]) -> Result<(), String> {
			self.thinned.push((raw_before, grains.to_vec()));
			Ok(())
		}
		async fn size(&mut self) -> Result<u64, String> {
			Ok(self.size)
		}
	}

	const NOW: i64 = 1_000 * 86_400_000;

	fn round(check: &str, at: i64) -> Round {
		Round { check: check.into(), at, ok: true, duration_ms: 10, detail: None }
	}

	fn setup(directory: &std::path::Path, rounds: &[Round]) -> (Arc<Mutex<Archive>>, Vec<Check>) {
		let mut archive = Archive::open(&directory.join("probe.db")).unwrap();
		archive.keep("home", rounds).unwrap();
		let checks = crate::checks::parse(crate::checks::DECLARED).unwrap();
		(Arc::new(Mutex::new(archive)), checks)
	}

	#[tokio::test]
	async fn an_outage_keeps_the_queue_and_the_next_pass_writes_it() {
		let directory = tempfile::tempdir().unwrap();
		let (archive, checks) = setup(directory.path(), &[]);
		let mut writer = Writer::new(Fake { down: true, ..Fake::default() }, "home".into(), checks);
		writer.push(round("health.geo", NOW - 1_000));
		writer.push(round("health.geo", NOW - rollup::RAW_WINDOW - 1));
		writer.pass(&archive, NOW).await;
		// Unreachable: nothing written, and what is too old to be kept is let go.
		assert_eq!(writer.waiting(), 1);
		writer.database.down = false;
		writer.pass(&archive, NOW).await;
		assert_eq!((writer.database.opened, writer.database.rounds.len(), writer.waiting()), (1, 1, 0));
	}

	#[test]
	fn the_queue_is_bounded_and_drops_the_oldest() {
		let mut writer = Writer::new(Fake::default(), "home".into(), vec![]);
		for at in 0..(WAITING as i64 + 5) {
			writer.push(round("a", at));
		}
		assert_eq!(writer.waiting(), WAITING);
		assert_eq!(writer.queue.front().unwrap().at, 5);
	}

	#[tokio::test]
	async fn settled_buckets_are_rolled_up_from_the_archive_for_declared_checks() {
		let directory = tempfile::tempdir().unwrap();
		let minute = Grain::Minute.length();
		let start = rollup::bucket_start(NOW, Grain::Minute) - 5 * minute;
		let rounds = [
			round("health.geo", start + 1_000),
			Round { ok: false, duration_ms: 90, ..round("health.geo", start + 2_000) },
			round("no.longer.declared", start + 3_000),
		];
		let (archive, checks) = setup(directory.path(), &rounds);
		let mut writer = Writer::new(Fake::default(), "home".into(), checks);
		writer.cursors = [Some(start); 5];
		writer.pass(&archive, NOW).await;
		let minutes: Vec<&Rollup> = writer
			.database
			.rollups
			.iter()
			.filter(|(grain, _)| *grain == Grain::Minute)
			.map(|(_, row)| row)
			.collect();
		assert_eq!(minutes.len(), 1);
		assert_eq!(minutes[0].check, "health.geo");
		assert_eq!(minutes[0].bucket_start, start);
		assert_eq!(minutes[0].summary, Summary { passed: 1, failed: 1, median_ms: 10, worst_ms: 90 });
		// The cursor has moved past every settled minute, so the next pass writes none again.
		let before = writer.database.rollups.len();
		writer.pass(&archive, NOW).await;
		assert_eq!(writer.database.rollups.len(), before);
	}

	#[tokio::test]
	async fn past_the_budget_the_coarsest_window_is_shortened_once_per_growth() {
		let directory = tempfile::tempdir().unwrap();
		let (archive, checks) = setup(directory.path(), &[]);
		let fake = Fake { size: rollup::BUDGET + 1, ..Fake::default() };
		let mut writer = Writer::new(fake, "home".into(), checks);
		writer.pass(&archive, NOW).await;
		let hour = writer.windows().of(Grain::Hour);
		assert!(hour < Grain::Hour.window());
		// The same size measured again is the budget holding: nothing more is shortened.
		for _ in 0..MEASURE_EVERY {
			writer.pass(&archive, NOW).await;
		}
		assert_eq!(writer.windows().of(Grain::Hour), hour);
		// Thinned by the shortened window.
		let (_, grains) = writer.database.thinned.last().unwrap();
		assert!(grains.contains(&(Grain::Hour, NOW - hour)));
	}

	/// The writer's SQL against a real Postgres, when one is named: `PROBE_TEST_DATABASE_URL`,
	/// without TLS, which a throwaway container does not offer.
	#[tokio::test]
	#[ignore = "needs PROBE_TEST_DATABASE_URL"]
	async fn the_statements_run_against_postgres() {
		let url = std::env::var("PROBE_TEST_DATABASE_URL").unwrap();
		let options = PgConnectOptions::from_str(&url).unwrap().ssl_mode(PgSslMode::Disable);
		let mut database = Postgres { options, connection: None, migrated: false };
		let mut connection = PgConnection::connect_with(&database.options).await.unwrap();
		for role in ["anon", "authenticated"] {
			let create = format!(
				"DO $$ BEGIN CREATE ROLE {role}; \
				EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END $$"
			);
			let create = sqlx_core::sql_str::AssertSqlSafe(create);
			sqlx_core::query::query(create).execute(&mut connection).await.unwrap();
		}
		drop(connection);
		let checks = crate::checks::parse(crate::checks::DECLARED).unwrap();
		database.open(&checks, "home").await.unwrap();
		let now = jiff::Timestamp::now().as_millisecond();
		let rounds = [
			round("health.geo", now - 1_000),
			Round { ok: false, detail: Some("status 502".into()), ..round("health.geo", now - 500) },
		];
		database.insert("home", &rounds).await.unwrap();
		database.insert("home", &rounds).await.unwrap();
		let start = rollup::bucket_start(now, Grain::Minute) - Grain::Minute.length();
		let summary = Summary { passed: 1, failed: 1, median_ms: 10, worst_ms: 90 };
		let row = Rollup { check: "health.geo".into(), bucket_start: start, summary };
		database.rollup(Grain::Minute, "home", std::slice::from_ref(&row)).await.unwrap();
		database.rollup(Grain::Minute, "home", &[row]).await.unwrap();
		assert_eq!(database.latest(Grain::Minute, "home").await.unwrap(), Some(start));
		assert_eq!(database.latest(Grain::Hour, "home").await.unwrap(), None);
		assert!(database.size().await.unwrap() > 0);
		database.thin(now, &[(Grain::Minute, now)]).await.unwrap();
		assert_eq!(database.latest(Grain::Minute, "home").await.unwrap(), None);
		// Opened again, as after an outage: migrations are not run twice, checks are upserted.
		database.close();
		database.open(&checks, "home").await.unwrap();
	}
}
