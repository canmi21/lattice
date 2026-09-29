//! libs/status-schema's migrations, embedded by build.rs, as a sqlx migrator. The probe is the
//! schema's one writer and applies what it has not yet applied at start. See
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
		std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../libs/status-schema/migrations")
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
}
