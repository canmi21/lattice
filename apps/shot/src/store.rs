//! Where captures wait out their five minutes: a file per format, named by the capture's id, in the
//! service's own directory, written through a temporary name so a half-written one is never served.
//! See spec/architecture/shot.md, "Kept on disk, five minutes".

use std::path::{Path, PathBuf};
use uuid::Uuid;

/// The two formats a capture is kept in.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Format {
	Png,
	Webp,
}

impl Format {
	pub fn extension(self) -> &'static str {
		match self {
			Format::Png => "png",
			Format::Webp => "webp",
		}
	}

	pub fn media_type(self) -> &'static str {
		match self {
			Format::Png => "image/png",
			Format::Webp => "image/webp",
		}
	}

	pub fn from_extension(extension: &str) -> Option<Self> {
		match extension {
			"png" => Some(Format::Png),
			"webp" => Some(Format::Webp),
			_ => None,
		}
	}
}

pub struct Store {
	directory: PathBuf,
}

impl Store {
	/// Opened empty: what a previous run left is past keeping, and its queue is gone with it.
	pub fn open(directory: &Path) -> std::io::Result<Self> {
		let directory = directory.join("shots");
		if directory.exists() {
			std::fs::remove_dir_all(&directory)?;
		}
		std::fs::create_dir_all(&directory)?;
		Ok(Self { directory })
	}

	fn path(&self, id: Uuid, format: Format) -> PathBuf {
		self.directory.join(format!("{id}.{}", format.extension()))
	}

	pub async fn write(&self, id: Uuid, format: Format, bytes: &[u8]) -> std::io::Result<()> {
		let path = self.path(id, format);
		let partial = path.with_extension("partial");
		tokio::fs::write(&partial, bytes).await?;
		tokio::fs::rename(&partial, &path).await
	}

	/// The picture, if it is still kept.
	pub async fn read(&self, id: Uuid, format: Format) -> Option<Vec<u8>> {
		tokio::fs::read(self.path(id, format)).await.ok()
	}

	pub async fn remove(&self, id: Uuid) {
		for format in [Format::Png, Format::Webp] {
			let _ = tokio::fs::remove_file(self.path(id, format)).await;
		}
	}
}

#[cfg(test)]
mod tests {
	use super::*;

	#[tokio::test]
	async fn keeps_what_it_is_given_and_nothing_a_run_before_left() {
		let root = tempfile::tempdir().unwrap();
		std::fs::create_dir_all(root.path().join("shots")).unwrap();
		std::fs::write(root.path().join("shots/stale.png"), b"old").unwrap();
		let store = Store::open(root.path()).unwrap();
		assert!(!root.path().join("shots/stale.png").exists());

		let id = Uuid::new_v4();
		store.write(id, Format::Png, b"png").await.unwrap();
		assert_eq!(store.read(id, Format::Png).await.as_deref(), Some(&b"png"[..]));
		assert_eq!(store.read(id, Format::Webp).await, None);
		store.remove(id).await;
		assert_eq!(store.read(id, Format::Png).await, None);
		assert_eq!(std::fs::read_dir(root.path().join("shots")).unwrap().count(), 0);
	}
}
