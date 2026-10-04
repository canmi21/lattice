//! Where captures are kept: a file per format and the task's record, named by the capture's id, in
//! the service's own directory, written through a temporary name so a half-written one is never
//! served. It holds at most its capacity, and the oldest capture goes when a new one would pass it.
//! See spec/architecture/shot.md, "Kept on disk, four gigabytes, oldest first".

use std::collections::{HashMap, VecDeque};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard};
use uuid::Uuid;

/// How many bytes the store holds, pictures and records together, unless `SHOT_STORE_BYTES` says.
pub const CAPACITY: u64 = 4 * 1024 * 1024 * 1024;

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

/// Every file a capture may leave.
const EXTENSIONS: [&str; 3] = ["png", "webp", "json"];

/// The captures kept, oldest first, each with its bytes on disk.
#[derive(Debug, Default)]
struct Kept {
	order: VecDeque<(Uuid, u64)>,
	bytes: u64,
}

impl Kept {
	fn release(&mut self, id: Uuid) {
		if let Some(at) = self.order.iter().position(|(kept, _)| *kept == id) {
			let (_, bytes) = self.order.remove(at).expect("a position it found");
			self.bytes -= bytes;
		}
	}

	/// Take `id` as the newest, and answer the oldest that must go for it to fit.
	fn admit(&mut self, id: Uuid, bytes: u64, capacity: u64) -> Vec<Uuid> {
		self.release(id);
		let mut out = Vec::new();
		while self.bytes + bytes > capacity {
			let Some((old, old_bytes)) = self.order.pop_front() else { break };
			self.bytes -= old_bytes;
			out.push(old);
		}
		self.order.push_back((id, bytes));
		self.bytes += bytes;
		out
	}
}

pub struct Store {
	directory: PathBuf,
	capacity: u64,
	kept: Mutex<Kept>,
}

impl Store {
	/// Opened over what a previous run kept, oldest first by when each capture finished. A picture
	/// without its record, or a half-written file, is a capture that never finished, and goes.
	pub fn open(directory: &Path, capacity: u64) -> std::io::Result<Self> {
		let directory = directory.join("shots");
		std::fs::create_dir_all(&directory)?;
		let mut files: HashMap<Uuid, Vec<(PathBuf, u64)>> = HashMap::new();
		for entry in std::fs::read_dir(&directory)? {
			let path = entry?.path();
			let (Some(stem), Some(extension)) =
				(path.file_stem().and_then(|s| s.to_str()), path.extension().and_then(|e| e.to_str()))
			else {
				continue;
			};
			if extension == "partial" {
				let _ = std::fs::remove_file(&path);
				continue;
			}
			let Ok(id) = Uuid::parse_str(stem) else { continue };
			if EXTENSIONS.contains(&extension) {
				let bytes = std::fs::metadata(&path).map(|meta| meta.len()).unwrap_or(0);
				files.entry(id).or_default().push((path, bytes));
			}
		}
		let mut found = Vec::new();
		for (id, paths) in files {
			let record = directory.join(format!("{id}.json"));
			let finished = std::fs::read(&record)
				.ok()
				.and_then(|bytes| serde_json::from_slice::<serde_json::Value>(&bytes).ok())
				.map(|kept| crate::record::finished_at(&kept).or_else(|| modified(&record)));
			match finished {
				Some(at) => found.push((at, id, paths.iter().map(|(_, bytes)| bytes).sum::<u64>())),
				None => {
					for (path, _) in paths {
						let _ = std::fs::remove_file(path);
					}
				}
			}
		}
		found.sort();
		let store = Self { directory, capacity, kept: Mutex::new(Kept::default()) };
		for (_, id, bytes) in found {
			for old in store.kept().admit(id, bytes, capacity) {
				for extension in EXTENSIONS {
					let _ = std::fs::remove_file(store.path(old, extension));
				}
			}
		}
		Ok(store)
	}

	/// What is kept; a panic while it was held leaves nothing half-changed worth refusing over.
	fn kept(&self) -> MutexGuard<'_, Kept> {
		self.kept.lock().unwrap_or_else(std::sync::PoisonError::into_inner)
	}

	fn path(&self, id: Uuid, extension: &str) -> PathBuf {
		self.directory.join(format!("{id}.{extension}"))
	}

	async fn put(&self, path: PathBuf, bytes: &[u8]) -> std::io::Result<()> {
		let partial = path.with_extension("partial");
		tokio::fs::write(&partial, bytes).await?;
		tokio::fs::rename(&partial, &path).await
	}

	pub async fn write(&self, id: Uuid, format: Format, bytes: &[u8]) -> std::io::Result<()> {
		self.put(self.path(id, format.extension()), bytes).await
	}

	/// What `status?task=<id>` answers with, kept beside the pictures.
	pub async fn write_record(&self, id: Uuid, bytes: &[u8]) -> std::io::Result<()> {
		self.put(self.path(id, "json"), bytes).await
	}

	/// The picture, if it is still kept.
	pub async fn read(&self, id: Uuid, format: Format) -> Option<Vec<u8>> {
		tokio::fs::read(self.path(id, format.extension())).await.ok()
	}

	/// The task's record, if it is still kept.
	pub async fn read_record(&self, id: Uuid) -> Option<serde_json::Value> {
		let bytes = tokio::fs::read(self.path(id, "json")).await.ok()?;
		serde_json::from_slice(&bytes).ok()
	}

	/// Make room for a capture of `bytes` about to be written, rolling the oldest out until it
	/// fits; answers those rolled out.
	pub async fn admit(&self, id: Uuid, bytes: u64) -> Vec<Uuid> {
		let out = self.kept().admit(id, bytes, self.capacity);
		for old in &out {
			self.delete(*old).await;
		}
		out
	}

	pub async fn remove(&self, id: Uuid) {
		self.kept().release(id);
		self.delete(id).await;
	}

	async fn delete(&self, id: Uuid) {
		for extension in EXTENSIONS {
			let _ = tokio::fs::remove_file(self.path(id, extension)).await;
		}
	}

	/// The bytes kept, as counted.
	pub fn bytes(&self) -> u64 {
		self.kept().bytes
	}
}

/// When a file was last written, as an instant.
fn modified(path: &Path) -> Option<jiff::Timestamp> {
	let at = std::fs::metadata(path).ok()?.modified().ok()?;
	jiff::Timestamp::try_from(at).ok()
}

#[cfg(test)]
mod tests {
	use super::*;

	fn record(finished_at: &str) -> Vec<u8> {
		serde_json::to_vec(&serde_json::json!({ "task": { "finished_at": finished_at } })).unwrap()
	}

	#[tokio::test]
	async fn keeps_what_it_is_given_across_a_restart_and_drops_what_never_finished() {
		let root = tempfile::tempdir().unwrap();
		let shots = root.path().join("shots");
		let store = Store::open(root.path(), CAPACITY).unwrap();
		let id = Uuid::new_v4();
		store.admit(id, 3 + 4 + 7).await;
		store.write(id, Format::Png, b"png").await.unwrap();
		store.write(id, Format::Webp, b"webp").await.unwrap();
		store.write_record(id, b"{\"a\":1}").await.unwrap();
		assert_eq!(store.read(id, Format::Png).await.as_deref(), Some(&b"png"[..]));
		// A capture that never wrote its record, and a half-written file, are gone at the next start.
		let orphan = Uuid::new_v4();
		std::fs::write(shots.join(format!("{orphan}.png")), b"png").unwrap();
		std::fs::write(shots.join(format!("{orphan}.partial")), b"pn").unwrap();
		drop(store);

		let store = Store::open(root.path(), CAPACITY).unwrap();
		assert_eq!(store.read(id, Format::Webp).await.as_deref(), Some(&b"webp"[..]));
		assert_eq!(store.read_record(id).await, Some(serde_json::json!({ "a": 1 })));
		assert_eq!(store.bytes(), 14);
		assert!(!shots.join(format!("{orphan}.png")).exists());
		assert!(!shots.join(format!("{orphan}.partial")).exists());
		store.remove(id).await;
		assert_eq!(store.read(id, Format::Png).await, None);
		assert_eq!((store.bytes(), std::fs::read_dir(&shots).unwrap().count()), (0, 0));
	}

	#[tokio::test]
	async fn rolls_out_the_oldest_when_a_new_capture_would_pass_it() {
		let root = tempfile::tempdir().unwrap();
		let store = Store::open(root.path(), 10).unwrap();
		let ids: Vec<Uuid> = (0..3).map(|_| Uuid::new_v4()).collect();
		for id in &ids[..2] {
			assert!(store.admit(*id, 4).await.is_empty());
			store.write_record(*id, b"four").await.unwrap();
		}
		assert_eq!(store.admit(ids[2], 4).await, [ids[0]]);
		store.write_record(ids[2], b"four").await.unwrap();
		assert_eq!(store.read_record(ids[0]).await, None);
		assert_eq!(store.bytes(), 8);
		// Its own record rewritten, a capture is the newest again rather than counted twice.
		assert!(store.admit(ids[1], 4).await.is_empty());
		assert_eq!(store.admit(Uuid::new_v4(), 4).await, [ids[2]]);
	}

	#[tokio::test]
	async fn orders_what_it_finds_by_when_each_finished() {
		let root = tempfile::tempdir().unwrap();
		let store = Store::open(root.path(), CAPACITY).unwrap();
		let (older, newer) = (Uuid::new_v4(), Uuid::new_v4());
		// Written newest first, so only the record's own time can tell them apart.
		store.write_record(newer, &record("2026-09-28T12:00:00Z")).await.unwrap();
		store.write_record(older, &record("2026-09-28T11:00:00Z")).await.unwrap();
		let each = record("2026-09-28T12:00:00Z").len() as u64;
		drop(store);
		// Reopened with room for one, the older goes.
		let store = Store::open(root.path(), each + 1).unwrap();
		assert_eq!(store.read_record(older).await, None);
		assert!(store.read_record(newer).await.is_some());
	}
}
