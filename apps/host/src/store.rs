//! What host knows, and the only thing Caddy's configuration is derived from: every app with the
//! version it runs and the one before it, every route to something that is not a container, and
//! every event. Three files by subject; see spec/architecture/host.md, "What host keeps, and
//! where".

use deploy::Manifest;
pub use deploy::Version;
use rusqlite::{Connection, OptionalExtension, params};
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::sync::{Mutex, MutexGuard};

/// An app as it runs now.
#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct Deployed {
	pub manifest: Manifest,
	pub image: String,
	/// What a failed deploy puts back, and what a rollback offers.
	pub previous: Option<Version>,
	pub deployed_at: String,
	/// Stopped from the panel, and kept stopped until started from it; see spec/architecture/host.md,
	/// "A stop holds until a start".
	#[serde(default)]
	pub held: bool,
}

/// A name that reaches something host does not run: the NAS, or a container another compose
/// project owns until it is taken over.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Route {
	pub name: String,
	/// `host:port`, dialed by Caddy as plain HTTP, or `https://host[:port]` for a device on the LAN
	/// that speaks only TLS under its own certificate.
	pub upstream: String,
	pub private: bool,
	pub public: bool,
	/// Where a request for `/` is sent, for an application whose interface does not live at its
	/// root: gemini's panel is under `/admin`, and its name alone should open it.
	#[serde(default, skip_serializing_if = "Option::is_none")]
	pub home: Option<String>,
}

fn route_from(row: &rusqlite::Row<'_>) -> rusqlite::Result<Route> {
	Ok(Route {
		name: row.get(0)?,
		upstream: row.get(1)?,
		private: row.get(2)?,
		public: row.get(3)?,
		home: row.get(4)?,
	})
}

/// What was done to an app.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Action {
	Deploy,
	Redeploy,
	Rollback,
	RollbackWithData,
	Start,
	Stop,
	Restart,
}

/// How an event ended, or that it has not yet.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Outcome {
	Running,
	Succeeded,
	Failed,
	/// Not attempted: a deploy that arrived while the app was held stopped.
	Skipped,
}

/// What started an event: a CI run, an upload, or the panel.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
pub struct Source {
	/// `run`, `upload` or `panel`.
	pub kind: String,
	#[serde(default, skip_serializing_if = "Option::is_none")]
	pub run: Option<u64>,
	#[serde(default, skip_serializing_if = "Option::is_none")]
	pub commit: Option<String>,
}

impl Source {
	pub fn panel() -> Self {
		Self { kind: "panel".into(), ..Self::default() }
	}

	pub fn upload() -> Self {
		Self { kind: "upload".into(), ..Self::default() }
	}

	pub fn run(run: u64, commit: Option<String>) -> Self {
		Self { kind: "run".into(), run: Some(run), commit }
	}
}

/// One row of an app's history.
#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct Event {
	pub id: i64,
	pub app: String,
	pub action: Action,
	pub source: Source,
	#[serde(skip_serializing_if = "Option::is_none")]
	pub image: Option<String>,
	/// The snapshot a deploy took before starting, which a rollback with data restores.
	#[serde(skip_serializing_if = "Option::is_none")]
	pub snapshot: Option<String>,
	pub outcome: Outcome,
	#[serde(skip_serializing_if = "Option::is_none")]
	pub detail: Option<String>,
	pub started_at: String,
	#[serde(skip_serializing_if = "Option::is_none")]
	pub finished_at: Option<String>,
}

#[derive(Debug, thiserror::Error)]
pub enum Error {
	#[error("the state database: {0}")]
	Database(#[from] rusqlite::Error),
	#[error("a stored record is unreadable: {0}")]
	Record(#[from] serde_json::Error),
	#[error("reading the state from before the split: {0}")]
	Split(#[from] std::io::Error),
	#[error("`{0}` is already an app")]
	TakenByApp(String),
	#[error("`{0}` is already a route")]
	TakenByRoute(String),
}

const APPS: &str = "CREATE TABLE IF NOT EXISTS apps (
	name TEXT PRIMARY KEY,
	manifest TEXT NOT NULL,
	image TEXT NOT NULL,
	previous TEXT,
	deployed_at TEXT NOT NULL,
	held INTEGER NOT NULL DEFAULT 0
);";

const ROUTES: &str = "CREATE TABLE IF NOT EXISTS routes (
	name TEXT PRIMARY KEY,
	upstream TEXT NOT NULL,
	private INTEGER NOT NULL,
	public INTEGER NOT NULL,
	home TEXT
);";

const HISTORY: &str = "CREATE TABLE IF NOT EXISTS events (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	app TEXT NOT NULL,
	action TEXT NOT NULL,
	source TEXT NOT NULL,
	image TEXT,
	snapshot TEXT,
	outcome TEXT NOT NULL,
	detail TEXT,
	started_at TEXT NOT NULL,
	finished_at TEXT
);
CREATE INDEX IF NOT EXISTS events_by_app ON events (app, id);";

/// Each image nothing could run again, and since when: it is removed an hour after. See
/// spec/architecture/host.md, "An image is kept while something could run it".
const IMAGES: &str = "CREATE TABLE IF NOT EXISTS flagged (
	id TEXT PRIMARY KEY,
	since TEXT NOT NULL
);";

fn open(path: &Path, schema: &str) -> Result<Connection, Error> {
	let connection = Connection::open(path)?;
	connection.execute_batch("PRAGMA journal_mode = WAL;")?;
	connection.execute_batch(schema)?;
	Ok(connection)
}

/// A value as the text column it is stored in.
fn text<T: Serialize>(value: &T) -> Result<String, Error> {
	let json = serde_json::to_value(value)?;
	Ok(json.as_str().map_or_else(|| json.to_string(), str::to_owned))
}

fn parsed<T: for<'a> Deserialize<'a>>(text: &str) -> Result<T, Error> {
	let json = serde_json::from_str(text).unwrap_or_else(|_| serde_json::Value::String(text.into()));
	Ok(serde_json::from_value(json)?)
}

fn now() -> String {
	jiff::Timestamp::now().to_string()
}

pub struct Store {
	apps: Mutex<Connection>,
	routes: Mutex<Connection>,
	history: Mutex<Connection>,
	images: Mutex<Connection>,
}

/// A panic while holding one leaves nothing half-written: every write is one statement.
fn lock(connection: &Mutex<Connection>) -> MutexGuard<'_, Connection> {
	connection.lock().unwrap_or_else(std::sync::PoisonError::into_inner)
}

impl Store {
	/// The three files in `directory`, made from a `host.db` there if it is the state from before
	/// the split and they do not exist yet.
	pub fn open(directory: &Path) -> Result<Self, Error> {
		std::fs::create_dir_all(directory)?;
		let legacy = directory.join("host.db");
		let split = legacy.exists() && !directory.join("apps.db").exists();
		let store = Self {
			apps: Mutex::new(open(&directory.join("apps.db"), APPS)?),
			routes: Mutex::new(open(&directory.join("routes.db"), ROUTES)?),
			history: Mutex::new(open(&directory.join("history.db"), HISTORY)?),
			images: Mutex::new(open(&directory.join("images.db"), IMAGES)?),
		};
		if split {
			store.read_legacy(&legacy)?;
		}
		Ok(store)
	}

	/// Copy a single `host.db`'s apps and routes into the split files, then rename it aside.
	fn read_legacy(&self, legacy: &Path) -> Result<(), Error> {
		let old = Connection::open(legacy)?;
		let columns: Vec<String> = old
			.prepare("SELECT name FROM pragma_table_info('routes')")?
			.query_map([], |row| row.get(0))?
			.collect::<Result<_, _>>()?;
		let home = if columns.iter().any(|column| column == "home") { "home" } else { "NULL" };
		{
			let apps = lock(&self.apps);
			let mut rows =
				old.prepare("SELECT name, manifest, image, previous, deployed_at FROM apps")?;
			for row in rows.query_map([], |row| {
				Ok((
					row.get::<_, String>(0)?,
					row.get::<_, String>(1)?,
					row.get::<_, String>(2)?,
					row.get::<_, Option<String>>(3)?,
					row.get::<_, String>(4)?,
				))
			})? {
				let (name, manifest, image, previous, deployed_at) = row?;
				apps.execute(
					"INSERT OR IGNORE INTO apps (name, manifest, image, previous, deployed_at)
					VALUES (?1, ?2, ?3, ?4, ?5)",
					params![name, manifest, image, previous, deployed_at],
				)?;
			}
		}
		{
			let routes = lock(&self.routes);
			let query = format!("SELECT name, upstream, private, public, {home} FROM routes");
			let mut rows = old.prepare(&query)?;
			for route in rows.query_map([], route_from)? {
				let route = route?;
				routes.execute(
					"INSERT OR IGNORE INTO routes (name, upstream, private, public, home)
					VALUES (?1, ?2, ?3, ?4, ?5)",
					params![route.name, route.upstream, route.private, route.public, route.home],
				)?;
			}
		}
		old.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);")?;
		drop(old);
		std::fs::rename(legacy, legacy.with_extension("db.split"))?;
		for suffix in ["db-wal", "db-shm"] {
			let _ = std::fs::remove_file(legacy.with_extension(suffix));
		}
		Ok(())
	}

	/// Every flagged image and since when.
	pub fn flagged(&self) -> Result<std::collections::HashMap<String, jiff::Timestamp>, Error> {
		let connection = lock(&self.images);
		let mut statement = connection.prepare("SELECT id, since FROM flagged")?;
		let rows =
			statement.query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)))?;
		let mut flagged = std::collections::HashMap::new();
		for row in rows {
			let (id, since) = row?;
			if let Ok(since) = since.parse() {
				flagged.insert(id, since);
			}
		}
		Ok(flagged)
	}

	pub fn flag(&self, id: &str, since: jiff::Timestamp) -> Result<(), Error> {
		lock(&self.images).execute(
			"INSERT OR IGNORE INTO flagged (id, since) VALUES (?1, ?2)",
			params![id, since.to_string()],
		)?;
		Ok(())
	}

	pub fn unflag(&self, id: &str) -> Result<(), Error> {
		lock(&self.images).execute("DELETE FROM flagged WHERE id = ?1", params![id])?;
		Ok(())
	}

	pub fn apps(&self) -> Result<Vec<Deployed>, Error> {
		let connection = lock(&self.apps);
		let mut statement = connection
			.prepare("SELECT manifest, image, previous, deployed_at, held FROM apps ORDER BY name")?;
		let rows = statement.query_map([], |row| {
			Ok((
				row.get::<_, String>(0)?,
				row.get(1)?,
				row.get::<_, Option<String>>(2)?,
				row.get(3)?,
				row.get(4)?,
			))
		})?;
		rows
			.map(|row| {
				let (manifest, image, previous, deployed_at, held) = row?;
				Ok(Deployed {
					manifest: serde_json::from_str(&manifest)?,
					image,
					previous: previous.map(|text| serde_json::from_str(&text)).transpose()?,
					deployed_at,
					held,
				})
			})
			.collect()
	}

	pub fn app(&self, name: &str) -> Result<Option<Deployed>, Error> {
		Ok(self.apps()?.into_iter().find(|app| app.manifest.name == name))
	}

	/// Store what runs now. The hold is not this call's to change; see `hold`.
	pub fn put_app(&self, app: &Deployed) -> Result<(), Error> {
		let name = &app.manifest.name;
		if self.route(name)?.is_some() {
			return Err(Error::TakenByRoute(name.clone()));
		}
		let previous = app.previous.as_ref().map(serde_json::to_string).transpose()?;
		lock(&self.apps).execute(
			"INSERT INTO apps (name, manifest, image, previous, deployed_at) VALUES (?1, ?2, ?3, ?4, ?5)
			ON CONFLICT (name) DO UPDATE SET manifest = ?2, image = ?3, previous = ?4, deployed_at = ?5",
			params![name, serde_json::to_string(&app.manifest)?, app.image, previous, app.deployed_at],
		)?;
		Ok(())
	}

	/// Hold an app stopped, or release it.
	pub fn hold(&self, name: &str, held: bool) -> Result<(), Error> {
		lock(&self.apps).execute("UPDATE apps SET held = ?2 WHERE name = ?1", params![name, held])?;
		Ok(())
	}

	pub fn routes(&self) -> Result<Vec<Route>, Error> {
		let connection = lock(&self.routes);
		let mut statement = connection
			.prepare("SELECT name, upstream, private, public, home FROM routes ORDER BY name")?;
		let rows = statement.query_map([], route_from)?;
		Ok(rows.collect::<Result<_, _>>()?)
	}

	fn route(&self, name: &str) -> Result<Option<Route>, Error> {
		let connection = lock(&self.routes);
		let query = "SELECT name, upstream, private, public, home FROM routes WHERE name = ?1";
		Ok(connection.query_row(query, [name], route_from).optional()?)
	}

	/// One namespace for apps and routes: a name is one thing, wherever it appears.
	pub fn put_route(&self, route: &Route) -> Result<(), Error> {
		if self.app(&route.name)?.is_some() {
			return Err(Error::TakenByApp(route.name.clone()));
		}
		lock(&self.routes).execute(
			"INSERT INTO routes (name, upstream, private, public, home) VALUES (?1, ?2, ?3, ?4, ?5)
			ON CONFLICT (name) DO UPDATE SET upstream = ?2, private = ?3, public = ?4, home = ?5",
			params![route.name, route.upstream, route.private, route.public, route.home],
		)?;
		Ok(())
	}

	pub fn delete_route(&self, name: &str) -> Result<bool, Error> {
		Ok(lock(&self.routes).execute("DELETE FROM routes WHERE name = ?1", [name])? > 0)
	}

	/// Open an event, returning its id for `finish`. One that is over already -- a skip -- is opened
	/// finished.
	pub fn record(
		&self,
		app: &str,
		action: Action,
		source: &Source,
		image: Option<&str>,
		outcome: Outcome,
	) -> Result<i64, Error> {
		let started = now();
		let finished = (outcome != Outcome::Running).then(|| started.clone());
		let connection = lock(&self.history);
		connection.execute(
			"INSERT INTO events (app, action, source, image, outcome, started_at, finished_at)
			VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
			params![app, text(&action)?, text(source)?, image, text(&outcome)?, started, finished],
		)?;
		Ok(connection.last_insert_rowid())
	}

	/// Close an event with how it ended.
	pub fn finish(
		&self,
		id: i64,
		outcome: Outcome,
		snapshot: Option<&str>,
		detail: Option<&str>,
	) -> Result<(), Error> {
		lock(&self.history).execute(
			"UPDATE events SET outcome = ?2, snapshot = COALESCE(?3, snapshot), detail = ?4,
			finished_at = ?5 WHERE id = ?1",
			params![id, text(&outcome)?, snapshot, detail, now()],
		)?;
		Ok(())
	}

	/// An app's events, the newest first, `limit` of them before the id `before`; every app's
	/// when `app` is none.
	pub fn events(
		&self,
		app: Option<&str>,
		before: Option<i64>,
		limit: u32,
	) -> Result<Vec<Event>, Error> {
		let connection = lock(&self.history);
		let mut statement = connection.prepare(
			"SELECT id, app, action, source, image, snapshot, outcome, detail, started_at, finished_at
			FROM events WHERE (?1 IS NULL OR app = ?1) AND (?2 IS NULL OR id < ?2)
			ORDER BY id DESC LIMIT ?3",
		)?;
		let rows = statement.query_map(params![app, before, limit], |row| {
			Ok((
				row.get::<_, i64>(0)?,
				row.get::<_, String>(1)?,
				row.get::<_, String>(2)?,
				row.get::<_, String>(3)?,
				row.get::<_, Option<String>>(4)?,
				row.get::<_, Option<String>>(5)?,
				row.get::<_, String>(6)?,
				row.get::<_, Option<String>>(7)?,
				row.get::<_, String>(8)?,
				row.get::<_, Option<String>>(9)?,
			))
		})?;
		rows
			.map(|row| {
				let (id, app, action, source, image, snapshot, outcome, detail, started_at, finished_at) =
					row?;
				Ok(Event {
					id,
					app,
					action: parsed(&action)?,
					source: parsed(&source)?,
					image,
					snapshot,
					outcome: parsed(&outcome)?,
					detail,
					started_at,
					finished_at,
				})
			})
			.collect()
	}

	/// The snapshot taken before `image` was deployed: what the directory held before the version
	/// an app runs now first ran. What a rollback with data restores.
	pub fn snapshot_before(&self, app: &str, image: &str) -> Result<Option<String>, Error> {
		let connection = lock(&self.history);
		let query = "SELECT snapshot FROM events WHERE app = ?1 AND image = ?2
			AND snapshot IS NOT NULL AND action = 'deploy' AND outcome = 'succeeded'
			ORDER BY id DESC LIMIT 1";
		Ok(connection.query_row(query, [app, image], |row| row.get(0)).optional()?)
	}
}

#[cfg(test)]
mod tests {
	use super::*;

	fn geo() -> Manifest {
		Manifest::parse(include_str!("../../geo/service.toml")).unwrap()
	}

	#[test]
	fn a_flag_keeps_the_moment_it_was_first_set_until_it_is_taken_off() {
		let directory = tempfile::tempdir().unwrap();
		let store = Store::open(directory.path()).unwrap();
		let first: jiff::Timestamp = "2026-09-28T12:00:00Z".parse().unwrap();
		store.flag("sha256:a", first).unwrap();
		store.flag("sha256:a", "2026-09-28T13:00:00Z".parse().unwrap()).unwrap();
		assert_eq!(store.flagged().unwrap()["sha256:a"], first);
		store.unflag("sha256:a").unwrap();
		assert!(store.flagged().unwrap().is_empty());
	}

	fn deployed(image: &str, previous: Option<Version>) -> Deployed {
		Deployed {
			manifest: geo(),
			image: image.into(),
			previous,
			deployed_at: "2026-09-27T00:00:00Z".into(),
			held: false,
		}
	}

	#[test]
	fn an_app_keeps_the_version_before_it() {
		let directory = tempfile::tempdir().unwrap();
		let store = Store::open(directory.path()).unwrap();
		store.put_app(&deployed("sha256:a", None)).unwrap();
		let first = Version { manifest: geo(), image: "sha256:a".into() };
		store.put_app(&deployed("sha256:b", Some(first.clone()))).unwrap();
		let app = store.app("geo").unwrap().unwrap();
		assert_eq!(app.image, "sha256:b");
		assert_eq!(app.previous, Some(first));
	}

	#[test]
	fn a_name_is_an_app_or_a_route_and_never_both() {
		let directory = tempfile::tempdir().unwrap();
		let store = Store::open(directory.path()).unwrap();
		store.put_app(&deployed("sha256:a", None)).unwrap();
		let route = Route {
			name: "geo".into(),
			upstream: "x.test:1".into(),
			private: true,
			public: false,
			home: None,
		};
		assert!(matches!(store.put_route(&route), Err(Error::TakenByApp(_))));
		let nas = Route {
			name: "nas".into(),
			upstream: "nas.test:80".into(),
			private: false,
			public: true,
			home: None,
		};
		store.put_route(&nas).unwrap();
		assert_eq!(store.routes().unwrap(), vec![nas]);
		assert!(store.delete_route("nas").unwrap());
		assert!(!store.delete_route("nas").unwrap());
	}
}

#[cfg(test)]
mod split {
	use super::*;

	#[test]
	fn a_single_file_from_before_the_split_is_read_into_three_and_set_aside() {
		let directory = tempfile::tempdir().unwrap();
		let legacy = directory.path().join("host.db");
		let old = Connection::open(&legacy).unwrap();
		let manifest =
			serde_json::to_string(&Manifest::parse(include_str!("../../geo/service.toml")).unwrap())
				.unwrap();
		old
			.execute_batch(
				"CREATE TABLE apps (name TEXT PRIMARY KEY, manifest TEXT NOT NULL, image TEXT NOT NULL,
				previous TEXT, deployed_at TEXT NOT NULL);
				CREATE TABLE routes (name TEXT PRIMARY KEY, upstream TEXT NOT NULL,
				private INTEGER NOT NULL, public INTEGER NOT NULL);
				INSERT INTO routes VALUES ('nas', 'nas.test:80', 0, 1);",
			)
			.unwrap();
		old
			.execute(
				"INSERT INTO apps VALUES ('geo', ?1, 'sha256:a', NULL, '2026-09-27T00:00:00Z')",
				[manifest],
			)
			.unwrap();
		drop(old);

		let store = Store::open(directory.path()).unwrap();
		assert_eq!(store.routes().unwrap()[0].home, None);
		let geo = store.app("geo").unwrap().unwrap();
		assert_eq!((geo.image.as_str(), geo.held), ("sha256:a", false));
		assert!(!legacy.exists());
		assert!(directory.path().join("host.db.split").exists());
		// Opened again, it reads the split files and leaves the set-aside one alone.
		assert_eq!(Store::open(directory.path()).unwrap().routes().unwrap().len(), 1);
	}
}

#[cfg(test)]
mod history {
	use super::*;

	#[test]
	fn events_page_backwards_from_the_newest() {
		let directory = tempfile::tempdir().unwrap();
		let store = Store::open(directory.path()).unwrap();
		let ids: Vec<i64> = (0..5)
			.map(|_| {
				store.record("geo", Action::Deploy, &Source::panel(), None, Outcome::Running).unwrap()
			})
			.collect();
		store.record("nas", Action::Stop, &Source::panel(), None, Outcome::Succeeded).unwrap();
		let first = store.events(Some("geo"), None, 2).unwrap();
		assert_eq!(first.iter().map(|event| event.id).collect::<Vec<_>>(), [ids[4], ids[3]]);
		let next = store.events(Some("geo"), Some(ids[3]), 2).unwrap();
		assert_eq!(next.iter().map(|event| event.id).collect::<Vec<_>>(), [ids[2], ids[1]]);
		assert_eq!(store.events(None, None, 50).unwrap().len(), 6);
	}

	#[test]
	fn an_event_closes_with_its_outcome_and_the_snapshot_a_rollback_would_restore() {
		let directory = tempfile::tempdir().unwrap();
		let store = Store::open(directory.path()).unwrap();
		let source = Source::run(7, Some("abc".into()));
		let id =
			store.record("geo", Action::Deploy, &source, Some("sha256:b"), Outcome::Running).unwrap();
		assert_eq!(store.snapshot_before("geo", "sha256:b").unwrap(), None);
		store.finish(id, Outcome::Succeeded, Some("/snapshots/geo/1"), None).unwrap();
		let failed = store.record("geo", Action::Deploy, &source, Some("sha256:b"), Outcome::Running);
		let failed = failed.unwrap();
		store.finish(failed, Outcome::Failed, Some("/snapshots/geo/2"), Some("unhealthy")).unwrap();
		// A redeploy of the same image is not what first ran it.
		let again = store.record("geo", Action::Redeploy, &source, Some("sha256:b"), Outcome::Running);
		store.finish(again.unwrap(), Outcome::Succeeded, Some("/snapshots/geo/3"), None).unwrap();
		let before = store.snapshot_before("geo", "sha256:b").unwrap();
		assert_eq!(before.as_deref(), Some("/snapshots/geo/1"));
		assert_eq!(store.snapshot_before("geo", "sha256:c").unwrap(), None);
		let [_, newest, oldest] = store.events(Some("geo"), None, 50).unwrap().try_into().unwrap();
		assert_eq!((newest.outcome, newest.detail.as_deref()), (Outcome::Failed, Some("unhealthy")));
		assert_eq!((oldest.source, oldest.outcome), (source, Outcome::Succeeded));
		assert!(oldest.finished_at.is_some());
	}

	#[test]
	fn a_hold_is_kept_until_released_and_survives_a_new_version() {
		let directory = tempfile::tempdir().unwrap();
		let store = Store::open(directory.path()).unwrap();
		let manifest = Manifest::parse(include_str!("../../geo/service.toml")).unwrap();
		let app = |image: &str| Deployed {
			manifest: manifest.clone(),
			image: image.into(),
			previous: None,
			deployed_at: String::new(),
			held: false,
		};
		store.put_app(&app("sha256:a")).unwrap();
		store.hold("geo", true).unwrap();
		store.put_app(&app("sha256:b")).unwrap();
		assert!(store.app("geo").unwrap().unwrap().held);
		store.hold("geo", false).unwrap();
		assert!(!store.app("geo").unwrap().unwrap().held);
	}
}
