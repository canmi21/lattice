//! `/api/inspect/disk`: each mounted filesystem host sees that matters, every app's subvolume
//! size, and the snapshots kept for it. See spec/architecture/inspect.md.

use crate::Host;
use axum::extract::State;
use axum::http::StatusCode;
use axum::response::Response;
use deploy::engine::filesystem_usage;
use serde::Serialize;
use std::path::Path;
use std::sync::Arc;
use std::time::{Duration, Instant};

/// The filesystems host is asked about beside `APPS_ROOT`, which is answered as one of the apps'
/// own mount points when it is one.
const ALSO: [&str; 1] = ["/"];

/// How long one app's subvolume may be walked before its size is reported partial.
const WALK_BUDGET: Duration = Duration::from_secs(2);

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct Mount {
	pub path: String,
	pub total: u64,
	pub used: u64,
	pub available: u64,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct AppUsage {
	pub app: String,
	pub bytes: u64,
	/// Set when the walk was cut off by its time budget, so `bytes` is a lower bound.
	pub partial: bool,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct Snapshot {
	pub name: String,
	pub app: String,
	pub created: jiff::Timestamp,
}

#[derive(Debug, Serialize)]
pub struct Disk {
	pub mounts: Vec<Mount>,
	pub apps: Vec<AppUsage>,
	pub snapshots: Vec<Snapshot>,
}

/// One filesystem's usage at `path`, or nothing when it cannot be read -- an unmounted path is
/// left out rather than answered as an error. Pure, so it is tested without Docker.
pub fn mount(path: &Path) -> Option<Mount> {
	let usage = filesystem_usage(path).ok()?;
	Some(Mount {
		path: path.display().to_string(),
		total: usage.total,
		used: usage.used,
		available: usage.available,
	})
}

/// The size of everything under `root`, walked until `budget` runs out; the second value says
/// whether it did. Pure over the filesystem alone, so it is tested without Docker.
pub async fn subvolume_size(root: &Path, budget: Duration) -> (u64, bool) {
	let deadline = Instant::now() + budget;
	let mut total = 0u64;
	let mut directories = vec![root.to_path_buf()];
	while let Some(directory) = directories.pop() {
		if Instant::now() >= deadline {
			return (total, true);
		}
		let Ok(mut entries) = tokio::fs::read_dir(&directory).await else { continue };
		loop {
			if Instant::now() >= deadline {
				return (total, true);
			}
			let Ok(Some(entry)) = entries.next_entry().await else { break };
			let Ok(file_type) = entry.file_type().await else { continue };
			if file_type.is_dir() {
				directories.push(entry.path());
			} else if let Ok(metadata) = entry.metadata().await {
				total += metadata.len();
			}
		}
	}
	(total, false)
}

/// Every snapshot kept under `snapshots_root`, one directory per app and one entry per snapshot
/// besides `failed`, newest first. Named so that parsing the name back is ordering them by time --
/// see infra/libs/deploy/src/volume.rs, `Volumes::snapshot`.
pub async fn snapshots(snapshots_root: &Path) -> Vec<Snapshot> {
	let mut all = Vec::new();
	let Ok(mut apps) = tokio::fs::read_dir(snapshots_root).await else { return all };
	while let Ok(Some(app_entry)) = apps.next_entry().await {
		let Ok(app_type) = app_entry.file_type().await else { continue };
		if !app_type.is_dir() {
			continue;
		}
		let app = app_entry.file_name().to_string_lossy().into_owned();
		let Ok(mut entries) = tokio::fs::read_dir(app_entry.path()).await else { continue };
		while let Ok(Some(entry)) = entries.next_entry().await {
			let name = entry.file_name().to_string_lossy().into_owned();
			if name == "failed" {
				continue;
			}
			// `Timestamp::strptime` refuses a bare `Z`: it wants an offset directive, not a literal
			// one, so the name is read as a civil time and then given the UTC it was written in.
			let Some(stripped) = name.strip_suffix('Z') else { continue };
			let Ok(civil) = jiff::civil::DateTime::strptime("%Y%m%dT%H%M%S%.3f", stripped) else {
				continue;
			};
			let Ok(zoned) = civil.to_zoned(jiff::tz::TimeZone::UTC) else { continue };
			all.push(Snapshot { name, app: app.clone(), created: zoned.timestamp() });
		}
	}
	all.sort_by(|a, b| b.created.cmp(&a.created));
	all
}

/// Every app's subvolume under `apps_root`, walked one at a time.
async fn apps(apps_root: &Path) -> Vec<AppUsage> {
	let mut all = Vec::new();
	let Ok(mut entries) = tokio::fs::read_dir(apps_root).await else { return all };
	while let Ok(Some(entry)) = entries.next_entry().await {
		let Ok(file_type) = entry.file_type().await else { continue };
		if !file_type.is_dir() {
			continue;
		}
		let app = entry.file_name().to_string_lossy().into_owned();
		let (bytes, partial) = subvolume_size(&entry.path(), WALK_BUDGET).await;
		all.push(AppUsage { app, bytes, partial });
	}
	all.sort_by(|a, b| a.app.cmp(&b.app));
	all
}

pub async fn get(State(host): State<Arc<Host>>) -> Response {
	let mounts = std::iter::once(host.config.apps_root.as_path())
		.chain(ALSO.iter().map(Path::new))
		.filter_map(mount)
		.collect();
	let apps = apps(&host.config.apps_root).await;
	let snapshots = snapshots(&host.config.snapshots_root).await;
	response::success(StatusCode::OK, Disk { mounts, apps, snapshots })
}

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn a_mounted_path_answers_and_a_missing_one_does_not() {
		let root = tempfile::tempdir().unwrap();
		let usage = mount(root.path()).unwrap();
		assert!(usage.total > 0 && usage.total >= usage.available);
		assert!(mount(Path::new("/no/such/mount")).is_none());
	}

	#[tokio::test]
	async fn sums_a_subvolumes_files_and_says_when_the_budget_ran_out() {
		let root = tempfile::tempdir().unwrap();
		std::fs::create_dir_all(root.path().join("data")).unwrap();
		std::fs::write(root.path().join("data/a"), [0u8; 10]).unwrap();
		std::fs::write(root.path().join("b"), [0u8; 5]).unwrap();
		let (bytes, partial) = subvolume_size(root.path(), Duration::from_secs(2)).await;
		assert_eq!(bytes, 15);
		assert!(!partial);
		let (_, partial) = subvolume_size(root.path(), Duration::from_secs(0)).await;
		assert!(partial);
	}

	#[tokio::test]
	async fn lists_snapshots_newest_first_and_skips_the_failed_one() {
		let root = tempfile::tempdir().unwrap();
		for (app, name) in [
			("geo", "20260101T000000.000Z"),
			("geo", "20260901T000000.000Z"),
			("geo", "failed"),
			("shot", "20260501T000000.000Z"),
		] {
			std::fs::create_dir_all(root.path().join(app).join(name)).unwrap();
		}
		let listed = snapshots(root.path()).await;
		let names: Vec<_> =
			listed.iter().map(|snapshot| (snapshot.app.as_str(), snapshot.name.as_str())).collect();
		assert_eq!(
			names,
			[
				("geo", "20260901T000000.000Z"),
				("shot", "20260501T000000.000Z"),
				("geo", "20260101T000000.000Z")
			]
		);
	}

	#[test]
	fn every_code_it_answers_with_is_in_the_catalogue() {
		for code in response::codes_named(include_str!("disk.rs")) {
			assert!(
				response::message_of(code).is_some(),
				"`{code}` is not in lib/pkgs/response/codes.json"
			);
		}
	}
}
