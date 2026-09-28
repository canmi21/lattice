//! `/api/inspect/files/{app}[/{*path}]`: one directory under an app's own, listed -- never a
//! file's contents, and never a path that would leave the app's directory. See
//! spec/architecture/inspect.md.

use crate::Host;
use crate::api;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::Response;
use serde::Serialize;
use std::path::{Path as FsPath, PathBuf};
use std::sync::Arc;

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct Entry {
	pub name: String,
	pub kind: &'static str,
	pub size: u64,
	#[serde(skip_serializing_if = "Option::is_none")]
	pub modified: Option<jiff::Timestamp>,
}

/// What resolving a requested path under an app's root came to.
enum Resolved {
	Under(PathBuf),
	/// The path names `..`, or canonicalizes outside the root -- a symlink followed out, most of
	/// all.
	Escapes,
	/// Nothing is there, so there is nothing to say it escapes either.
	Missing,
}

/// `requested`'s segments, joined onto `root` and refused the moment one is `..`; then the whole
/// thing is canonicalized and refused again if that leaves `root`, which is what catches a
/// symlink resolving outside it. Pure over the filesystem alone, so it is tested without Docker.
fn resolve(root: &FsPath, requested: Option<&str>) -> Resolved {
	let mut target = root.to_path_buf();
	for segment in requested.into_iter().flat_map(|requested| requested.split('/')) {
		if segment.is_empty() || segment == "." {
			continue;
		}
		if segment == ".." {
			return Resolved::Escapes;
		}
		target.push(segment);
	}
	let Ok(canonical_root) = std::fs::canonicalize(root) else { return Resolved::Missing };
	let Ok(canonical_target) = std::fs::canonicalize(&target) else { return Resolved::Missing };
	if canonical_target.starts_with(&canonical_root) {
		Resolved::Under(canonical_target)
	} else {
		Resolved::Escapes
	}
}

/// One directory's entries: name, kind, size and modification time, never a file's contents.
/// `DirEntry::metadata` does not follow a symlink, so a link is answered as one rather than as
/// what it happens to point to.
async fn listing(directory: &FsPath) -> std::io::Result<Vec<Entry>> {
	let mut read = tokio::fs::read_dir(directory).await?;
	let mut entries = Vec::new();
	while let Some(entry) = read.next_entry().await? {
		let metadata = entry.metadata().await?;
		let file_type = metadata.file_type();
		let kind = if file_type.is_symlink() {
			"symlink"
		} else if file_type.is_dir() {
			"dir"
		} else if file_type.is_file() {
			"file"
		} else {
			use std::os::unix::fs::FileTypeExt;
			if file_type.is_socket() { "socket" } else { "other" }
		};
		let modified = metadata.modified().ok().and_then(|time| jiff::Timestamp::try_from(time).ok());
		entries.push(Entry {
			name: entry.file_name().to_string_lossy().into_owned(),
			kind,
			size: metadata.len(),
			modified,
		});
	}
	entries.sort_by(|a, b| a.name.cmp(&b.name));
	Ok(entries)
}

async fn answer(host: &Host, app: &str, requested: Option<&str>) -> Response {
	if let Err(refused) = api::known(host, app) {
		return refused;
	}
	let root = host.volumes.root(app);
	let target = match resolve(&root, requested) {
		Resolved::Under(target) => target,
		Resolved::Escapes => {
			return response::failure_with(
				StatusCode::FORBIDDEN,
				"invalid_target",
				"This path leaves the app's own directory",
			);
		}
		Resolved::Missing => return response::failure(StatusCode::NOT_FOUND, "no_such_object"),
	};
	match listing(&target).await {
		Ok(entries) => response::success(StatusCode::OK, entries),
		Err(error) if error.kind() == std::io::ErrorKind::NotADirectory => {
			response::failure(StatusCode::NOT_FOUND, "no_such_object")
		}
		Err(error) => response::failure_with(StatusCode::INTERNAL_SERVER_ERROR, "store_unavailable", error),
	}
}

pub async fn root(State(host): State<Arc<Host>>, Path(app): Path<String>) -> Response {
	answer(&host, &app, None).await
}

pub async fn nested(State(host): State<Arc<Host>>, Path((app, path)): Path<(String, String)>) -> Response {
	answer(&host, &app, Some(&path)).await
}

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn stays_under_the_root_and_refuses_what_would_not() {
		let root = tempfile::tempdir().unwrap();
		std::fs::create_dir_all(root.path().join("data/logs")).unwrap();
		std::fs::write(root.path().join("data/logs/a.log"), "x").unwrap();
		assert!(matches!(resolve(root.path(), None), Resolved::Under(_)));
		assert!(matches!(resolve(root.path(), Some("data/logs")), Resolved::Under(_)));
		assert!(matches!(resolve(root.path(), Some("data/../../etc")), Resolved::Escapes));
		assert!(matches!(resolve(root.path(), Some("..")), Resolved::Escapes));
		assert!(matches!(resolve(root.path(), Some("no/such/path")), Resolved::Missing));
	}

	#[test]
	fn a_symlink_leaving_the_root_is_refused_even_though_it_resolves() {
		let root = tempfile::tempdir().unwrap();
		let outside = tempfile::tempdir().unwrap();
		std::os::unix::fs::symlink(outside.path(), root.path().join("escape")).unwrap();
		assert!(matches!(resolve(root.path(), Some("escape")), Resolved::Escapes));
	}

	#[tokio::test]
	async fn lists_one_directory_by_name_kind_size_and_time_never_contents() {
		let root = tempfile::tempdir().unwrap();
		std::fs::write(root.path().join("b.txt"), "hello").unwrap();
		std::fs::create_dir(root.path().join("a-dir")).unwrap();
		let entries = listing(root.path()).await.unwrap();
		assert_eq!(entries.len(), 2);
		assert_eq!(entries[0].name, "a-dir");
		assert_eq!(entries[0].kind, "dir");
		assert_eq!(entries[1].name, "b.txt");
		assert_eq!(entries[1].kind, "file");
		assert_eq!(entries[1].size, 5);
		assert!(entries[1].modified.is_some());
		assert!(!serde_json::to_string(&entries).unwrap().contains("hello"));
	}

	#[test]
	fn every_code_it_answers_with_is_in_the_catalogue() {
		for code in response::codes_named(include_str!("files.rs")) {
			assert!(response::message_of(code).is_some(), "`{code}` is not in libs/response/codes.json");
		}
	}
}
