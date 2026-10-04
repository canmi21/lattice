//! The table host writes for `cron`: every deployed app's schedules and how to reach them. See
//! spec/architecture/cron.md, "host gives `cron` the table".

use crate::store::Deployed;
use deploy::manifest::{CatchUp, Manifest, Overlap};
use serde::Serialize;
use std::path::Path;

/// `cron`'s own name, whose data directory this table is written into and whose container mounts
/// each name `socket_services` names at `/sockets/<service>`.
pub const NAME: &str = "cron";

/// Where host writes the table, in `cron`'s own directory.
const TABLE: &str = "schedules.json";

#[derive(Debug, Serialize, PartialEq)]
struct Table {
	jobs: Vec<Job>,
}

#[derive(Debug, Serialize, PartialEq)]
struct Job {
	service: String,
	name: String,
	cron: Option<String>,
	every: Option<String>,
	path: String,
	catch_up: CatchUp,
	overlap: Overlap,
	timeout: u64,
	reach: Reach,
}

/// How `cron` asks: a scope through Caddy, for a service with `[api]`, or the path host mounted
/// its socket at, for one that answers on a socket alone. See spec/architecture/cron.md, "`reach`
/// is how `cron` asks".
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(untagged)]
enum Reach {
	Scope { scope: String },
	Socket { socket: String },
}

/// How `cron` reaches `manifest`'s service, or nothing for one whose declaration admits neither --
/// which `Manifest::check` already refuses before it is ever deployed.
fn reach_of(manifest: &Manifest) -> Option<Reach> {
	if manifest.api.is_some() {
		return Some(Reach::Scope { scope: manifest.name.clone() });
	}
	let socket = manifest.container.as_ref()?.socket.as_ref()?;
	Some(Reach::Socket {
		socket: format!("{}/{socket}", deploy::engine::socket_mount(&manifest.name)),
	})
}

/// Every deployed app with schedules that answers on a socket: the services `cron`'s own container
/// needs mounted at `/sockets/<service>`, per its `Shape::Scheduler`.
pub fn socket_services(apps: &[Deployed]) -> Vec<String> {
	apps
		.iter()
		.filter(|app| {
			!app.manifest.schedules.is_empty()
				&& app.manifest.container.as_ref().is_some_and(|container| container.socket.is_some())
		})
		.map(|app| app.manifest.name.clone())
		.collect()
}

/// Whether `cron`'s container needs remaking to follow its mounts: `desired`, the socket services
/// its schedules now name, differs from `mounted`, what it actually has bound at
/// `/sockets/<service>` -- order does not matter, only the set. See spec/architecture/cron.md.
pub fn mounts_changed(desired: &[String], mounted: &[String]) -> bool {
	let desired: std::collections::BTreeSet<&str> = desired.iter().map(String::as_str).collect();
	let mounted: std::collections::BTreeSet<&str> = mounted.iter().map(String::as_str).collect();
	desired != mounted
}

/// The table for every app that declares schedules and is reachable, built from the state as it
/// is now. Pure, so it is tested without a directory to write into.
fn table(apps: &[Deployed]) -> Table {
	let mut jobs = Vec::new();
	for app in apps {
		if app.manifest.schedules.is_empty() {
			continue;
		}
		let Some(reach) = reach_of(&app.manifest) else { continue };
		for schedule in &app.manifest.schedules {
			jobs.push(Job {
				service: app.manifest.name.clone(),
				name: schedule.name.clone(),
				cron: schedule.cron.clone(),
				every: schedule.every.clone(),
				path: schedule.path.clone(),
				catch_up: schedule.catch_up,
				overlap: schedule.overlap,
				timeout: schedule.timeout,
				reach: reach.clone(),
			});
		}
	}
	Table { jobs }
}

/// Write the table into `directory` (`cron`'s own), through a temporary file and a rename, as
/// `node::tell` does for the meter. Nothing when `cron` has no directory yet -- it is not deployed.
pub async fn write(apps: &[Deployed], directory: &Path) -> std::io::Result<()> {
	if !tokio::fs::try_exists(directory).await.unwrap_or(false) {
		return Ok(());
	}
	let temporary = directory.join(format!("{TABLE}.next"));
	tokio::fs::write(&temporary, serde_json::to_vec(&table(apps))?).await?;
	tokio::fs::rename(&temporary, directory.join(TABLE)).await?;
	Ok(())
}

#[cfg(test)]
mod tests {
	use super::*;
	use deploy::Manifest;

	fn app(text: &str) -> Deployed {
		Deployed {
			manifest: Manifest::parse(text).unwrap(),
			image: "sha256:app".into(),
			previous: None,
			deployed_at: "now".into(),
			held: false,
		}
	}

	const GEO: &str = include_str!("../../../../apps/geo/service.toml");

	#[test]
	fn a_service_with_an_api_is_reached_through_its_scope() {
		let text = format!(
			"{GEO}\n[[schedules]]\nname = \"refresh\"\ncron = \"0 4 * * *\"\npath = \"/jobs/refresh\"\n"
		);
		let table = table(&[app(&text)]);
		assert_eq!(table.jobs.len(), 1);
		let job = &table.jobs[0];
		assert_eq!((job.service.as_str(), job.name.as_str()), ("geo", "refresh"));
		assert_eq!((job.cron.as_deref(), job.every.as_deref()), (Some("0 4 * * *"), None));
		assert_eq!((job.catch_up, job.overlap, job.timeout), (CatchUp::Once, Overlap::Skip, 300));
		assert_eq!(job.reach, Reach::Scope { scope: "geo".into() });
		assert!(socket_services(&[app(&text)]).is_empty());
	}

	#[test]
	fn a_socket_only_service_is_reached_at_where_host_mounts_it() {
		let text = "version = 1\nname = \"apt\"\nplacements = [\"home\"]\n[container]\nhealth = \"/health\"\nsocket = \"apt.sock\"\n[data]\npath = \"/data\"\n[[schedules]]\nname = \"update\"\ncron = \"0 7 * * *\"\npath = \"/jobs/update\"\ntimeout = 1800\n";
		let deployed = app(text);
		let table = table(&[deployed.clone()]);
		let job = &table.jobs[0];
		assert_eq!(job.reach, Reach::Socket { socket: "/sockets/apt/apt.sock".into() });
		assert_eq!(job.timeout, 1800);
		assert_eq!(socket_services(&[deployed]), ["apt"]);
	}

	#[test]
	fn an_app_with_no_schedules_names_no_job_and_no_socket() {
		let table = table(&[app(GEO)]);
		assert!(table.jobs.is_empty());
		assert!(socket_services(&[app(GEO)]).is_empty());
	}

	#[test]
	fn the_table_serializes_as_the_spec_shows_it() {
		let text = format!(
			"{GEO}\n[[schedules]]\nname = \"refresh\"\ncron = \"0 4 * * *\"\npath = \"/jobs/refresh\"\n"
		);
		let value = serde_json::to_value(table(&[app(&text)])).unwrap();
		assert_eq!(value["jobs"][0]["reach"], serde_json::json!({ "scope": "geo" }));
		assert_eq!(value["jobs"][0]["catch_up"], "once");
	}

	#[test]
	fn mounts_changed_ignores_order_and_catches_a_real_difference() {
		let apt = || "apt".to_owned();
		let shot = || "shot".to_owned();
		assert!(!mounts_changed(&[apt(), shot()], &[shot(), apt()]));
		assert!(mounts_changed(&[apt()], &[]));
		assert!(mounts_changed(&[], &[apt()]));
		assert!(mounts_changed(&[apt()], &[shot()]));
	}
}
