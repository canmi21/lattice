//! Each app's directory as a btrfs subvolume, and the snapshots a deploy is undone from. See
//! spec/architecture/host.md, "One version runs, and a failed deploy puts the last one back".

use std::path::{Path, PathBuf};
use tokio::process::Command;

/// Snapshots kept per app once a deploy succeeds. Copy-on-write, so the cost is what changed.
const KEEP: usize = 3;

#[derive(Debug, thiserror::Error)]
pub enum Error {
	#[error("`btrfs {args}` failed: {detail}")]
	Btrfs { args: String, detail: String },
	#[error("{path}: {source}")]
	Io { path: PathBuf, source: std::io::Error },
}

fn io(path: &Path) -> impl FnOnce(std::io::Error) -> Error + '_ {
	move |source| Error::Io { path: path.to_path_buf(), source }
}

async fn btrfs(args: &[&str]) -> Result<(), Error> {
	let output = Command::new("btrfs")
		.args(args)
		.output()
		.await
		.map_err(|e| Error::Btrfs { args: args.join(" "), detail: e.to_string() })?;
	if output.status.success() {
		return Ok(());
	}
	Err(Error::Btrfs {
		args: args.join(" "),
		detail: String::from_utf8_lossy(&output.stderr).trim().to_owned(),
	})
}

fn text(path: &Path) -> &str {
	path.to_str().unwrap_or_default()
}

pub struct Volumes {
	apps: PathBuf,
	snapshots: PathBuf,
}

impl Volumes {
	pub fn new(apps: PathBuf, snapshots: PathBuf) -> Self {
		Self { apps, snapshots }
	}

	pub fn root(&self, name: &str) -> PathBuf {
		self.apps.join(name)
	}

	/// What an app's container is given, inside its subvolume.
	pub fn data(&self, name: &str) -> PathBuf {
		self.root(name).join("data")
	}

	/// Created as a subvolume, never with `mkdir`: a plain directory cannot be snapshotted alone.
	pub async fn ensure(&self, name: &str) -> Result<(), Error> {
		let root = self.root(name);
		if !root.exists() {
			btrfs(&["subvolume", "create", text(&root)]).await?;
		}
		let data = self.data(name);
		tokio::fs::create_dir_all(&data).await.map_err(io(&data))
	}

	/// Read-only, named so that sorting them is ordering them by time.
	pub async fn snapshot(&self, name: &str) -> Result<PathBuf, Error> {
		let directory = self.snapshots.join(name);
		tokio::fs::create_dir_all(&directory).await.map_err(io(&directory))?;
		let target = directory.join(jiff::Timestamp::now().strftime("%Y%m%dT%H%M%S%.3fZ").to_string());
		btrfs(&["subvolume", "snapshot", "-r", text(&self.root(name)), text(&target)]).await?;
		Ok(target)
	}

	/// Put the app's directory back as it was when `snapshot` was taken. The directory that failed
	/// is moved aside first and deleted last, so no step leaves the app with no directory at all.
	pub async fn restore(&self, name: &str, snapshot: &Path) -> Result<(), Error> {
		let root = self.root(name);
		let aside = self.snapshots.join(name).join("failed");
		if aside.exists() {
			btrfs(&["subvolume", "delete", text(&aside)]).await?;
		}
		tokio::fs::rename(&root, &aside).await.map_err(io(&root))?;
		btrfs(&["subvolume", "snapshot", text(snapshot), text(&root)]).await?;
		btrfs(&["subvolume", "delete", text(&aside)]).await
	}

	pub async fn prune(&self, name: &str) -> Result<(), Error> {
		let directory = self.snapshots.join(name);
		let mut entries = tokio::fs::read_dir(&directory).await.map_err(io(&directory))?;
		let mut stamps = Vec::new();
		while let Some(entry) = entries.next_entry().await.map_err(io(&directory))? {
			let file_name = entry.file_name().to_string_lossy().into_owned();
			if file_name != "failed" {
				stamps.push(file_name);
			}
		}
		stamps.sort();
		let excess = stamps.len().saturating_sub(KEEP);
		for stamp in &stamps[..excess] {
			btrfs(&["subvolume", "delete", text(&directory.join(stamp))]).await?;
		}
		Ok(())
	}
}
