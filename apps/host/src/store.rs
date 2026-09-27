//! What host knows, and the only thing Caddy's configuration is derived from: every app with the
//! version it runs and the one before it, and every route to something that is not a container.
//! See spec/architecture/host.md, "host renders all of Caddy, and Caddy remembers nothing".

use crate::manifest::Manifest;
use rusqlite::{Connection, OptionalExtension, params};
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::sync::Mutex;

/// An app as it runs now.
#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct Deployed {
	pub manifest: Manifest,
	pub image: String,
	/// What a failed deploy puts back, and what a rollback offers.
	pub previous: Option<Version>,
	pub deployed_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Version {
	pub manifest: Manifest,
	pub image: String,
}

/// A name that reaches something host does not run: the NAS, or a container another compose
/// project owns until it is taken over.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Route {
	pub name: String,
	/// `host:port`, dialed by Caddy.
	pub upstream: String,
	pub private: bool,
	pub public: bool,
}

#[derive(Debug, thiserror::Error)]
pub enum Error {
	#[error("the state database: {0}")]
	Database(#[from] rusqlite::Error),
	#[error("a stored declaration is unreadable: {0}")]
	Record(#[from] serde_json::Error),
	#[error("`{0}` is already an app")]
	TakenByApp(String),
	#[error("`{0}` is already a route")]
	TakenByRoute(String),
}

pub struct Store(Mutex<Connection>);

impl Store {
	pub fn open(path: &Path) -> Result<Self, Error> {
		let connection = Connection::open(path)?;
		connection.execute_batch(
			"PRAGMA journal_mode = WAL;
			CREATE TABLE IF NOT EXISTS apps (
				name TEXT PRIMARY KEY,
				manifest TEXT NOT NULL,
				image TEXT NOT NULL,
				previous TEXT,
				deployed_at TEXT NOT NULL
			);
			CREATE TABLE IF NOT EXISTS routes (
				name TEXT PRIMARY KEY,
				upstream TEXT NOT NULL,
				private INTEGER NOT NULL,
				public INTEGER NOT NULL
			);",
		)?;
		Ok(Self(Mutex::new(connection)))
	}

	fn connection(&self) -> std::sync::MutexGuard<'_, Connection> {
		// A panic while holding it leaves nothing half-written: every write is one statement.
		self.0.lock().unwrap_or_else(std::sync::PoisonError::into_inner)
	}

	pub fn apps(&self) -> Result<Vec<Deployed>, Error> {
		let connection = self.connection();
		let mut statement = connection
			.prepare("SELECT manifest, image, previous, deployed_at FROM apps ORDER BY name")?;
		let rows = statement.query_map([], |row| {
			Ok((row.get::<_, String>(0)?, row.get(1)?, row.get::<_, Option<String>>(2)?, row.get(3)?))
		})?;
		rows
			.map(|row| {
				let (manifest, image, previous, deployed_at) = row?;
				Ok(Deployed {
					manifest: serde_json::from_str(&manifest)?,
					image,
					previous: previous.map(|text| serde_json::from_str(&text)).transpose()?,
					deployed_at,
				})
			})
			.collect()
	}

	pub fn app(&self, name: &str) -> Result<Option<Deployed>, Error> {
		Ok(self.apps()?.into_iter().find(|app| app.manifest.name == name))
	}

	pub fn put_app(&self, app: &Deployed) -> Result<(), Error> {
		let name = &app.manifest.name;
		if self.route(name)?.is_some() {
			return Err(Error::TakenByRoute(name.clone()));
		}
		let previous = app.previous.as_ref().map(serde_json::to_string).transpose()?;
		self.connection().execute(
			"INSERT INTO apps (name, manifest, image, previous, deployed_at) VALUES (?1, ?2, ?3, ?4, ?5)
			ON CONFLICT (name) DO UPDATE SET manifest = ?2, image = ?3, previous = ?4, deployed_at = ?5",
			params![name, serde_json::to_string(&app.manifest)?, app.image, previous, app.deployed_at],
		)?;
		Ok(())
	}

	pub fn routes(&self) -> Result<Vec<Route>, Error> {
		let connection = self.connection();
		let mut statement =
			connection.prepare("SELECT name, upstream, private, public FROM routes ORDER BY name")?;
		let rows = statement.query_map([], |row| {
			Ok(Route {
				name: row.get(0)?,
				upstream: row.get(1)?,
				private: row.get(2)?,
				public: row.get(3)?,
			})
		})?;
		Ok(rows.collect::<Result<_, _>>()?)
	}

	fn route(&self, name: &str) -> Result<Option<Route>, Error> {
		let connection = self.connection();
		Ok(
			connection
				.query_row(
					"SELECT name, upstream, private, public FROM routes WHERE name = ?1",
					[name],
					|row| {
						Ok(Route {
							name: row.get(0)?,
							upstream: row.get(1)?,
							private: row.get(2)?,
							public: row.get(3)?,
						})
					},
				)
				.optional()?,
		)
	}

	/// One namespace for apps and routes: a name is one thing, wherever it appears.
	pub fn put_route(&self, route: &Route) -> Result<(), Error> {
		if self.app(&route.name)?.is_some() {
			return Err(Error::TakenByApp(route.name.clone()));
		}
		self.connection().execute(
			"INSERT INTO routes (name, upstream, private, public) VALUES (?1, ?2, ?3, ?4)
			ON CONFLICT (name) DO UPDATE SET upstream = ?2, private = ?3, public = ?4",
			params![route.name, route.upstream, route.private, route.public],
		)?;
		Ok(())
	}

	pub fn delete_route(&self, name: &str) -> Result<bool, Error> {
		Ok(self.connection().execute("DELETE FROM routes WHERE name = ?1", [name])? > 0)
	}
}

#[cfg(test)]
mod tests {
	use super::*;

	fn geo() -> Manifest {
		Manifest::parse(include_str!("../../geo/service.toml")).unwrap()
	}

	fn deployed(image: &str, previous: Option<Version>) -> Deployed {
		Deployed {
			manifest: geo(),
			image: image.into(),
			previous,
			deployed_at: "2026-09-27T00:00:00Z".into(),
		}
	}

	#[test]
	fn an_app_keeps_the_version_before_it() {
		let directory = tempfile::tempdir().unwrap();
		let store = Store::open(&directory.path().join("host.db")).unwrap();
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
		let store = Store::open(&directory.path().join("host.db")).unwrap();
		store.put_app(&deployed("sha256:a", None)).unwrap();
		let route =
			Route { name: "geo".into(), upstream: "x.test:1".into(), private: true, public: false };
		assert!(matches!(store.put_route(&route), Err(Error::TakenByApp(_))));
		let nas =
			Route { name: "nas".into(), upstream: "nas.test:80".into(), private: false, public: true };
		store.put_route(&nas).unwrap();
		assert_eq!(store.routes().unwrap(), vec![nas]);
		assert!(store.delete_route("nas").unwrap());
		assert!(!store.delete_route("nas").unwrap());
	}
}
