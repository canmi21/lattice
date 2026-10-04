//! What host tells `telemetry` about the services: `services.json`, in telemetry's own directory.
//! See spec/architecture/telemetry.md, "`services.json`, what host tells".

use crate::store::{Action, Deployed, Event, Outcome, Source, Store};
use deploy::Manifest;
use serde::Serialize;
use std::path::Path;

/// `telemetry`'s own name, whose data directory this file is written into and whose container is
/// given the reporter shape.
pub const NAME: &str = "telemetry";

/// Where host writes the file, in telemetry's own directory.
const SERVICES: &str = "services.json";

/// How many of an app's history rows are told, newest first.
const HISTORY: usize = 20;

#[derive(Debug, Serialize, PartialEq)]
struct Services<'a> {
	written_at: String,
	apps: Vec<Service<'a>>,
}

#[derive(Debug, Serialize, PartialEq)]
struct Service<'a> {
	name: &'a str,
	image: &'a str,
	deployed_at: &'a str,
	held: bool,
	/// The declaration whole, since every line of it is in git.
	declaration: &'a Manifest,
	history: Vec<Row>,
}

/// One history row as it is told: an allowlist of `Event`, without its `detail`, which is in the
/// words of whatever failed, its snapshot's name, and the row's own keys.
#[derive(Debug, Serialize, PartialEq)]
struct Row {
	action: Action,
	source: Source,
	#[serde(skip_serializing_if = "Option::is_none")]
	image: Option<String>,
	outcome: Outcome,
	started_at: String,
	#[serde(skip_serializing_if = "Option::is_none")]
	finished_at: Option<String>,
}

impl From<Event> for Row {
	fn from(event: Event) -> Self {
		Row {
			action: event.action,
			source: event.source,
			image: event.image,
			outcome: event.outcome,
			started_at: event.started_at,
			finished_at: event.finished_at,
		}
	}
}

/// The file for `apps`, each beside its history rows, as of `written_at`. Pure, so it is tested
/// without a directory to write into.
fn snapshot(written_at: String, apps: Vec<(&Deployed, Vec<Event>)>) -> Services<'_> {
	let apps = apps
		.into_iter()
		.map(|(app, mut history)| {
			history.sort_by_key(|event| std::cmp::Reverse(event.id));
			history.truncate(HISTORY);
			Service {
				name: &app.manifest.name,
				image: &app.image,
				deployed_at: &app.deployed_at,
				held: app.held,
				declaration: &app.manifest,
				history: history.into_iter().map(Row::from).collect(),
			}
		})
		.collect();
	Services { written_at, apps }
}

/// Write the file into `directory` (telemetry's own) from the state in `store`, through a temporary
/// file and a rename, as `cron::write` does. Nothing when telemetry has no directory yet -- it is
/// not deployed.
pub async fn write(store: &Store, directory: &Path) -> anyhow::Result<()> {
	if !tokio::fs::try_exists(directory).await.unwrap_or(false) {
		return Ok(());
	}
	let apps = store.apps()?;
	let mut told = Vec::with_capacity(apps.len());
	for app in &apps {
		let limit = u32::try_from(HISTORY).unwrap_or(u32::MAX);
		told.push((app, store.events(Some(&app.manifest.name), None, limit)?));
	}
	let services = snapshot(jiff::Timestamp::now().to_string(), told);
	let temporary = directory.join(format!("{SERVICES}.next"));
	tokio::fs::write(&temporary, serde_json::to_vec(&services)?).await?;
	tokio::fs::rename(&temporary, directory.join(SERVICES)).await?;
	Ok(())
}

#[cfg(test)]
mod tests {
	use super::*;

	const GEO: &str = include_str!("../../../../platform/apps/geo/service.toml");

	fn app() -> Deployed {
		Deployed {
			manifest: Manifest::parse(GEO).unwrap(),
			image: "sha256:geo".into(),
			previous: None,
			deployed_at: "2026-09-28T22:40:00Z".into(),
			held: true,
		}
	}

	fn event(id: i64) -> Event {
		Event {
			id,
			app: "geo".into(),
			action: Action::Deploy,
			source: Source::run(1234, Some("abc".into())),
			image: Some(format!("sha256:{id}")),
			snapshot: Some("/data/snapshots/geo/1".into()),
			outcome: Outcome::Failed,
			detail: Some("private words".into()),
			started_at: format!("t{id}"),
			finished_at: None,
		}
	}

	#[test]
	fn history_is_the_latest_twenty_newest_first() {
		let app = app();
		let history = (1..=25).map(event).collect();
		let services = snapshot("now".into(), vec![(&app, history)]);
		let rows = &services.apps[0].history;
		assert_eq!(rows.len(), HISTORY);
		assert_eq!(rows[0].started_at, "t25");
		assert_eq!(rows[19].started_at, "t6");
	}

	#[test]
	fn the_file_serializes_as_the_spec_shows_it() {
		let app = app();
		let services = snapshot("2026-09-28T23:00:00Z".into(), vec![(&app, vec![event(7)])]);
		let value = serde_json::to_value(&services).unwrap();
		assert_eq!(value["written_at"], "2026-09-28T23:00:00Z");
		let told = &value["apps"][0];
		assert_eq!(told["name"], "geo");
		assert_eq!(told["image"], "sha256:geo");
		assert_eq!(told["deployed_at"], "2026-09-28T22:40:00Z");
		assert_eq!(told["held"], true);
		assert_eq!(told["declaration"], serde_json::to_value(&app.manifest).unwrap());
		let row = told["history"][0].as_object().unwrap();
		let mut keys: Vec<&str> = row.keys().map(String::as_str).collect();
		keys.sort_unstable();
		assert_eq!(keys, ["action", "image", "outcome", "source", "started_at"]);
		assert_eq!(row["source"], serde_json::json!({ "kind": "run", "run": 1234, "commit": "abc" }));
		assert_eq!(row["outcome"], "failed");
	}
}
