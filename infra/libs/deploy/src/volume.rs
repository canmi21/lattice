//! Each app's directory as a btrfs subvolume, and the snapshots a deploy is undone from. See
//! spec/architecture/host.md, "One version runs, and a failed deploy puts the last one back".

use crate::btrfs;
use std::path::{Path, PathBuf};

/// Snapshots kept per app once a deploy succeeds. Copy-on-write, so the cost is what changed.
const KEEP: usize = 3;

#[derive(Debug, thiserror::Error)]
pub enum Error {
	#[error(transparent)]
	Btrfs(#[from] btrfs::Error),
	#[error("{path}: {source}")]
	Io { path: PathBuf, source: std::io::Error },
}

fn io(path: &Path) -> impl FnOnce(std::io::Error) -> Error + '_ {
	move |source| Error::Io { path: path.to_path_buf(), source }
}

/// A btrfs call is a blocking syscall, so it runs where blocking is allowed.
async fn blocking<F>(work: F) -> Result<(), Error>
where
	F: FnOnce() -> Result<(), btrfs::Error> + Send + 'static,
{
	match tokio::task::spawn_blocking(work).await {
		Ok(result) => Ok(result?),
		Err(joined) => Err(Error::Io { path: PathBuf::new(), source: std::io::Error::other(joined) }),
	}
}

pub struct Volumes {
	apps: PathBuf,
	snapshots: PathBuf,
	logs: PathBuf,
}

impl Volumes {
	pub fn new(apps: PathBuf, snapshots: PathBuf, logs: PathBuf) -> Self {
		Self { apps, snapshots, logs }
	}

	/// Where an app's containers' logs are archived, one file per container.
	pub fn logs(&self, name: &str) -> PathBuf {
		self.logs.join(name)
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
			let path = root.clone();
			blocking(move || btrfs::create(&path)).await?;
		}
		let data = self.data(name);
		tokio::fs::create_dir_all(&data).await.map_err(io(&data))
	}

	/// Read-only, named so that sorting them is ordering them by time.
	pub async fn snapshot(&self, name: &str) -> Result<PathBuf, Error> {
		let directory = self.snapshots.join(name);
		tokio::fs::create_dir_all(&directory).await.map_err(io(&directory))?;
		let target = directory.join(jiff::Timestamp::now().strftime("%Y%m%dT%H%M%S%.3fZ").to_string());
		let (source, made) = (self.root(name), target.clone());
		blocking(move || btrfs::snapshot(&source, &made, true)).await?;
		Ok(target)
	}

	/// Put the app's directory back as it was when `snapshot` was taken. The directory that failed
	/// is moved aside first and deleted last, so no step leaves the app with no directory at all.
	pub async fn restore(&self, name: &str, snapshot: &Path) -> Result<(), Error> {
		let root = self.root(name);
		let aside = self.snapshots.join(name).join("failed");
		if aside.exists() {
			let path = aside.clone();
			blocking(move || btrfs::delete(&path)).await?;
		}
		tokio::fs::rename(&root, &aside).await.map_err(io(&root))?;
		let (source, made) = (snapshot.to_path_buf(), root.clone());
		blocking(move || btrfs::snapshot(&source, &made, false)).await?;
		blocking(move || btrfs::delete(&aside)).await
	}

	/// Give the app's directory -- the directory itself, not what is in it -- to the user its image
	/// runs as, so an app that is not root can write there. See spec/architecture/host.md, "An
	/// app's directory belongs to the user its image runs as".
	pub async fn hand_over(&self, name: &str, uid: u32, gid: u32) -> Result<(), Error> {
		use std::os::unix::fs::MetadataExt;
		let data = self.data(name);
		let metadata = tokio::fs::metadata(&data).await.map_err(io(&data))?;
		if (metadata.uid(), metadata.gid()) == (uid, gid) {
			return Ok(());
		}
		std::os::unix::fs::chown(&data, Some(uid), Some(gid)).map_err(io(&data))
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
			let path = directory.join(stamp);
			blocking(move || btrfs::delete(&path)).await?;
		}
		Ok(())
	}
}

#[cfg(test)]
mod tests {
	use super::*;
	use std::os::unix::fs::MetadataExt;

	#[tokio::test]
	async fn hands_the_directory_over_and_leaves_one_already_handed_over() {
		let root = tempfile::tempdir().unwrap();
		let volumes = Volumes::new(root.path().into(), root.path().join("s"), root.path().join("l"));
		let data = volumes.data("probe");
		std::fs::create_dir_all(&data).unwrap();
		// Only to its own owner, which is all a test that is not root may do.
		let metadata = std::fs::metadata(&data).unwrap();
		volumes.hand_over("probe", metadata.uid(), metadata.gid()).await.unwrap();
		assert!(volumes.hand_over("missing", 1, 1).await.is_err());
	}
}
