//! platform/libs/probe's migrations, embedded by build.rs, as a sqlx migrator. The probe is
//! the schema's one writer and applies what it has not yet applied at start. See
//! spec/architecture/probe.md, "The schema: declared once, in Drizzle, applied by the probe".

use sqlx_core::migrate::{Migration, MigrationType, Migrator};
use sqlx_core::sql_str::AssertSqlSafe;

/// `(version, description, sql)`, oldest first.
const EMBEDDED: &[(i64, &str, &str)] = include!(concat!(env!("OUT_DIR"), "/migrations.rs"));

pub fn migrator() -> Migrator {
	let migrations = EMBEDDED
		.iter()
		.map(|&(version, description, sql)| {
			let no_tx = sql.starts_with("-- no-transaction");
			let sql = sqlx_core::sql_str::SqlSafeStr::into_sql_str(AssertSqlSafe(sql));
			Migration::new(version, description.into(), MigrationType::Simple, sql, no_tx)
		})
		.collect();
	Migrator::with_migrations(migrations)
}

#[cfg(test)]
mod tests {
	use super::*;

	fn directory() -> std::path::PathBuf {
		std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../libs/probe/migrations")
	}

	/// What build.rs embedded is what sqlx itself reads from the directory -- the same versions,
	/// descriptions and checksums -- so drizzle's `NNNN_name.sql` are migrations sqlx takes as they
	/// are, and a database migrated by the sqlx CLI would agree with this one.
	#[test]
	fn the_embedded_migrations_are_the_ones_sqlx_reads() {
		let resolved = sqlx_core::migrate::resolve_blocking(&directory()).unwrap();
		let embedded = migrator();
		assert!(!resolved.is_empty());
		assert_eq!(embedded.iter().count(), resolved.len());
		for (ours, (theirs, _)) in embedded.iter().zip(&resolved) {
			assert_eq!((ours.version, &ours.description), (theirs.version, &theirs.description));
			assert_eq!(ours.checksum, theirs.checksum);
			assert_eq!(ours.migration_type, MigrationType::Simple);
			assert!(!ours.no_tx);
		}
		assert_eq!(embedded.iter().next().map(|migration| migration.version), Some(0));
	}

	/// Drizzle separates statements with `--> statement-breakpoint`; to Postgres, which is sent
	/// each migration whole, that is a comment and nothing more.
	#[test]
	fn a_statement_breakpoint_is_a_comment_to_postgres() {
		for migration in migrator().iter() {
			for line in migration.sql.as_str().lines() {
				if let Some(at) = line.find("--> statement-breakpoint") {
					assert!(line[at..].starts_with("--"));
					assert_eq!(line[at..].trim_end(), "--> statement-breakpoint");
				}
			}
		}
	}

	/// Against a real Postgres, when one is named: `PROBE_TEST_DATABASE_URL`. Applies every
	/// migration twice -- the second time applying nothing -- so a throwaway database is enough.
	#[tokio::test]
	#[ignore = "needs PROBE_TEST_DATABASE_URL"]
	async fn the_migrations_apply_to_postgres() {
		use sqlx_core::connection::Connection;
		let url = std::env::var("PROBE_TEST_DATABASE_URL").unwrap();
		let mut connection = sqlx_postgres::PgConnection::connect(&url).await.unwrap();
		// A plain Postgres has neither of Supabase's roles, which the grants name.
		for role in ["anon", "authenticated"] {
			let create = format!(
				"DO $$ BEGIN CREATE ROLE {role}; \
				EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END $$"
			);
			sqlx_core::query::query(AssertSqlSafe(create)).execute(&mut connection).await.unwrap();
		}
		migrator().run(&mut connection).await.unwrap();
		migrator().run(&mut connection).await.unwrap();
	}

	/// A database the probe wrote before checks had names takes the migrations that add them: the
	/// first three are applied alone, a check is written without a name, then the rest run. In a
	/// database of its own, created and dropped here, so the test above cannot race it.
	#[tokio::test]
	#[ignore = "needs PROBE_TEST_DATABASE_URL"]
	async fn a_database_from_before_names_is_brought_forward() {
		use sqlx_core::connection::Connection;
		use sqlx_core::query::query;
		use sqlx_core::query_scalar::query_scalar;
		let url = url::Url::parse(&std::env::var("PROBE_TEST_DATABASE_URL").unwrap()).unwrap();
		let mut admin = sqlx_postgres::PgConnection::connect(url.as_str()).await.unwrap();
		let name = format!("probe_upgrade_{}", std::process::id());
		query(AssertSqlSafe(format!("DROP DATABASE IF EXISTS {name}")))
			.execute(&mut admin)
			.await
			.unwrap();
		query(AssertSqlSafe(format!("CREATE DATABASE {name}"))).execute(&mut admin).await.unwrap();
		let mut own = url.clone();
		own.set_path(&name);
		let mut connection = sqlx_postgres::PgConnection::connect(own.as_str()).await.unwrap();
		for role in ["anon", "authenticated"] {
			let create = format!(
				"DO $$ BEGIN CREATE ROLE {role}; \
				EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END $$"
			);
			query(AssertSqlSafe(create)).execute(&mut connection).await.unwrap();
		}

		// As a fresh Supabase project has it, so the revoke in 0004 is what keeps anon out.
		query("alter default privileges in schema public grant all on tables to anon, authenticated")
			.execute(&mut connection)
			.await
			.unwrap();
		let before = Migrator::with_migrations(migrator().iter().take(3).cloned().collect());
		before.run(&mut connection).await.unwrap();
		query(
			"insert into checks (id, kind, target, place, interval_seconds, updated_at)
			values ('health.geo', 'health', 'API_PRIVATE/geo/health', 'home', 5, now())",
		)
		.execute(&mut connection)
		.await
		.unwrap();
		query(
			"insert into rollups values ('health.geo', 'home', '1h', date_trunc('hour', now()), 3, 1, 5, 9),
				('health.geo', 'home', '1h', date_trunc('hour', now()) - interval '1 hour', 2, 0, 5, 9),
				('health.geo', 'home', '1h', now() - interval '120 days', 7, 7, 5, 9)",
		)
		.execute(&mut connection)
		.await
		.unwrap();
		migrator().run(&mut connection).await.unwrap();

		let named: String = query_scalar("select name from status_checks where id = 'health.geo'")
			.fetch_one(&mut connection)
			.await
			.unwrap();
		assert_eq!(named, "health.geo");
		let unnamed = query(
			"insert into checks (id, kind, target, place, interval_seconds, updated_at)
			values ('dns.site', 'dns', 'APPS_PRODUCTION_SITE', 'home', 60, now())",
		)
		.execute(&mut connection)
		.await;
		assert!(unnamed.is_err(), "a check without a name is refused");

		query("set role anon").execute(&mut connection).await.unwrap();
		let days: Vec<(String, i32, i32)> = sqlx_core::query_as::query_as(
			"select day::text, passed, failed from status_daily
			where check_id = 'health.geo' and place = 'home' order by day",
		)
		.fetch_all(&mut connection)
		.await
		.unwrap();
		let summed: (i32, i32) = days.iter().fold((0, 0), |(p, f), day| (p + day.1, f + day.2));
		assert_eq!(summed, (5, 1), "the last ninety days alone: {days:?}");
		let denied = |result: Result<_, sqlx_core::Error>| {
			result.is_err_and(|error| error.to_string().contains("permission denied"))
		};
		let written = query("update status_checks set name = 'x'").execute(&mut connection).await;
		assert!(denied(written), "anon reads the views and writes none of them");
		let table = query("select 1 from checks").execute(&mut connection).await;
		assert!(denied(table), "anon reads no table");
		query("reset role").execute(&mut connection).await.unwrap();

		drop(connection);
		query(AssertSqlSafe(format!("DROP DATABASE {name}"))).execute(&mut admin).await.unwrap();
	}
}
