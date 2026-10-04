//! `services.json`, as host writes it into telemetry's own directory, and the topology drawn from
//! it alone. See spec/architecture/telemetry.md, "`services.json`, what host tells".

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::SystemTime;

/// The name host writes the file under, in telemetry's own directory.
pub const FILE: &str = "services.json";

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
pub struct Services {
	pub written_at: String,
	pub apps: Vec<Service>,
}

/// One service as host told it: an allowlist of what `infra/apps/host/src/telemetry.rs` writes. The
/// declaration and the history rows are kept as `Value`, since every line of them is already
/// public and host owns their exact shape.
#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
pub struct Service {
	pub name: String,
	pub image: String,
	pub deployed_at: String,
	#[serde(default)]
	pub held: bool,
	pub declaration: Value,
	#[serde(default)]
	pub history: Vec<Value>,
}

impl Service {
	/// Whether it runs a container on this node at all: absent for one placed on Workers alone,
	/// which the meter never samples. See spec/architecture/services.md, "A Workers placement is
	/// deployed by Cloudflare, not by host".
	pub fn has_container(&self) -> bool {
		self.declaration.get("container").is_some()
	}

	/// Running, or held stopped from the panel. See spec/architecture/host.md, "A stop holds until
	/// a start".
	pub fn state(&self) -> &'static str {
		if self.held { "stopped" } else { "running" }
	}
}

struct Cached {
	modified: SystemTime,
	services: Services,
}

/// `services.json`, re-read whenever it changes: a modification time checked per request is cheap
/// enough for a file this small. See spec/architecture/telemetry.md, "The service".
pub struct Store {
	path: PathBuf,
	cached: Mutex<Option<Cached>>,
}

impl Store {
	pub fn new(directory: &Path) -> Self {
		Self { path: directory.join(FILE), cached: Mutex::new(None) }
	}

	/// The file as it stands now, or `None` when it cannot be read: not written yet, mid-rename, or
	/// no longer valid JSON. A source that cannot be read leaves its part null rather than failing
	/// the rest -- see spec/architecture/telemetry.md, "The service".
	pub fn read(&self) -> Option<Services> {
		let modified = std::fs::metadata(&self.path).and_then(|meta| meta.modified()).ok()?;
		let mut cached = self.cached.lock().unwrap_or_else(std::sync::PoisonError::into_inner);
		if let Some(entry) = cached.as_ref()
			&& entry.modified == modified
		{
			return Some(entry.services.clone());
		}
		let text = std::fs::read_to_string(&self.path).ok()?;
		let services: Services = serde_json::from_str(&text).ok()?;
		*cached = Some(Cached { modified, services: services.clone() });
		Some(services)
	}

	/// One service by name, when the file reads and holds it.
	pub fn find(&self, name: &str) -> Option<Service> {
		self.read()?.apps.into_iter().find(|app| app.name == name)
	}
}

/// The arrangement `/topology` answers: each service's placements, its scope and its schedules,
/// drawn from `services.json` alone -- nothing here asks the meter or the ledger. See
/// spec/architecture/telemetry.md, "The API".
pub fn topology(services: &Services) -> Value {
	let services: Vec<Value> = services
		.apps
		.iter()
		.map(|service| {
			let declaration = &service.declaration;
			serde_json::json!({
				"name": service.name,
				"placements": declaration.get("placements").cloned().unwrap_or(Value::Null),
				"container": declaration.get("container").cloned().unwrap_or(Value::Null),
				"api": declaration.get("api").cloned().unwrap_or(Value::Null),
				"interface": declaration.get("interface").cloned().unwrap_or(Value::Null),
				"schedules": declaration.get("schedules").cloned().unwrap_or(Value::Array(vec![])),
			})
		})
		.collect();
	serde_json::json!({ "services": services })
}

#[cfg(test)]
mod tests {
	use super::*;

	fn written(directory: &Path, body: &str) {
		std::fs::write(directory.join(FILE), body).unwrap();
	}

	const EXAMPLE: &str = r#"{
		"written_at": "2026-09-28T23:00:00Z",
		"apps": [
			{
				"name": "geo",
				"image": "sha256:geo",
				"deployed_at": "2026-09-28T22:40:00Z",
				"held": false,
				"declaration": {
					"version": 1, "name": "geo", "placements": ["home"],
					"container": { "port": 23440, "health": "/health" },
					"api": { "public": true, "limits": [] }
				},
				"history": [{ "action": "deploy", "outcome": "succeeded" }]
			},
			{
				"name": "cdn",
				"image": "sha256:cdn",
				"deployed_at": "2026-09-28T22:41:00Z",
				"held": true,
				"declaration": { "version": 1, "name": "cdn", "placements": ["workers"] },
				"history": []
			}
		]
	}"#;

	#[test]
	fn reads_the_file_and_holds_it_until_it_changes() {
		let directory = tempfile::tempdir().unwrap();
		written(directory.path(), EXAMPLE);
		let store = Store::new(directory.path());
		let services = store.read().unwrap();
		assert_eq!(services.apps.len(), 2);
		assert_eq!(services.apps[0].state(), "running");
		assert_eq!(services.apps[1].state(), "stopped");
		assert!(services.apps[0].has_container());
		assert!(!services.apps[1].has_container());

		// A second read with nothing changed comes back the same, from the cache.
		assert_eq!(store.read(), Some(services));
		assert_eq!(store.find("geo").map(|app| app.image), Some("sha256:geo".into()));
		assert_eq!(store.find("nothing"), None);
	}

	#[test]
	fn is_none_rather_than_an_error_when_there_is_nothing_to_read() {
		let directory = tempfile::tempdir().unwrap();
		let store = Store::new(directory.path());
		assert_eq!(store.read(), None);

		written(directory.path(), "not json");
		assert_eq!(Store::new(directory.path()).read(), None);
	}

	#[test]
	fn topology_carries_placements_and_schedules_and_nothing_the_meter_or_ledger_knows() {
		let services: Services = serde_json::from_str(EXAMPLE).unwrap();
		let drawn = topology(&services);
		assert_eq!(drawn["services"][0]["name"], "geo");
		assert_eq!(drawn["services"][0]["placements"], serde_json::json!(["home"]));
		assert_eq!(drawn["services"][1]["container"], Value::Null);
	}
}
