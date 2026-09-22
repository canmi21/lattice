//! Finding `data/bucket` from wherever the command was run.
//!
//! Walking up for the marker rather than taking a compile-time path, because the binary is
//! run from anywhere in the tree and `CARGO_MANIFEST_DIR` would bake in whichever machine
//! built it.

use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Copy, PartialEq, Eq, thiserror::Error)]
#[error(
	"could not find data/bucket above the current directory -- run this from inside the repository"
)]
pub struct NotFound;

/// The repository root, found by looking for `data/bucket` above the working directory.
///
/// Every command joins its own paths onto this rather than being handed one: the article tree,
/// the originals and the mirrors are siblings, and a command that only knew where objects go
/// could not read the articles deciding what belongs there.
///
/// The marker is the parent of both mirrors rather than one of them: what is inside has been
/// relaid twice, and that this repository publishes to buckets at all has not.
pub fn repo_root() -> Result<PathBuf, NotFound> {
	let start = std::env::current_dir().map_err(|_| NotFound)?;
	find_upwards(&start)
		.and_then(|bucket| bucket.parent().and_then(Path::parent).map(Path::to_path_buf))
		.ok_or(NotFound)
}

/// The tree the CDN serves: content-addressed bytes and nothing else.
pub fn objects_root(repo: &Path) -> PathBuf {
	bucket_root(repo).join("objects")
}

/// The tree the API reads: the published root and one record per asset.
///
/// A separate tree because it becomes a separate bucket, and that is a boundary rather than a
/// tidy-up: these keys are names that get rewritten in place, and the CDN must not be able to
/// reach them. See spec/architecture/data.md, "One bucket holds records and the other holds
/// bytes".
pub fn metadata_root(repo: &Path) -> PathBuf {
	bucket_root(repo).join("metadata")
}

/// The directory holding both mirrors, and the marker `repo_root` walks up for.
///
/// One parent so that what leaves this machine is one directory a reader can point at. That is
/// the publication gate restated as a path: `rclone` is aimed inside here and can see nothing
/// else under `data/`. See spec/architecture/data.md.
pub fn bucket_root(repo: &Path) -> PathBuf {
	repo.join("data").join("bucket")
}

/// The draft corpus, which is one root and a link to the published records.
///
/// Bucket-shaped like its two neighbours -- `wrangler dev` binds it as one -- and the only one of
/// the three that is never mirrored. A draft's objects are in the objects tree like everything
/// else; what withholds one is that the published root does not name it. See spec/drafts.md.
pub fn draft_root(repo: &Path) -> PathBuf {
	bucket_root(repo).join("draft")
}

/// The text a person curates, which is the one part of `data/` git keeps.
///
/// Every record goes through this rather than being spelled where it is read: the commit that
/// moved them into one directory corrected five doc comments and none of the five paths, so
/// `cms tn` was reading a missing file as an empty table -- which its own loader documents as the
/// way to spend the money twice. A helper is what makes that a compile-time fact rather than a
/// comment. See spec/architecture/data.md, "What `data/` keeps out of git".
pub fn record_root(repo: &Path) -> PathBuf {
	repo.join("data").join("record")
}

/// The bytes nothing derives: originals, fonts, a geocoding database, the site's own marks.
///
/// Every one of them is an input. What is published from here is hashed in by the publisher, so
/// nothing under it is addressed by a reader. See spec/architecture/data.md.
pub fn source_root(repo: &Path) -> PathBuf {
	repo.join("data").join("source")
}

/// Pictures as they arrived, under whatever name they arrived with.
pub fn image_originals(repo: &Path) -> PathBuf {
	source_root(repo).join("image")
}

/// Clips as they arrived. The originals, never the encoded rungs.
pub fn video_originals(repo: &Path) -> PathBuf {
	source_root(repo).join("video")
}

/// Icons fetched from other people's sites, which are a source rather than a published object.
///
/// They used to sit inside the published tree, which stopped being a place for anything that is
/// not addressed by its own content. The publisher hashes them in; this is where they arrive.
pub fn favicon_root(repo: &Path) -> PathBuf {
	source_root(repo).join("favicon")
}

fn find_upwards(start: &Path) -> Option<PathBuf> {
	start
		.ancestors()
		.map(|directory| directory.join("data").join("bucket"))
		.find(|candidate| candidate.is_dir())
}

#[cfg(test)]
mod tests {
	use super::*;

	/// Every curated record is under `data/record`, and each of these was once not.
	///
	/// The five paths below were left spelling `data/<name>` when the records moved, so two of
	/// them wrote to files git never saw and three read a missing file as an empty one. Naming
	/// them here is what makes the next one fail loudly rather than quietly cost money.
	#[test]
	fn every_curated_record_is_under_the_record_directory() {
		let repo = Path::new("/repo");
		let record = record_root(repo);
		for path in [
			crate::media::path_for(repo),
			crate::tags::path_for(repo),
			crate::diagram::store_path(repo),
			crate::licenses::assertions_path(repo),
			crate::i18n::tn::path_for(repo),
		] {
			assert!(path.starts_with(&record), "{} is not under {}", path.display(), record.display());
		}
	}

	#[test]
	fn finds_the_marker_from_a_nested_directory() {
		let temporary = tempfile::tempdir().expect("temp");
		let root = temporary.path();
		let nested = root.join("apps").join("cms").join("src");
		std::fs::create_dir_all(&nested).unwrap();
		std::fs::create_dir_all(root.join("data").join("bucket")).unwrap();

		assert_eq!(find_upwards(&nested), Some(root.join("data").join("bucket")));

		std::fs::remove_dir_all(&root).unwrap();
	}

	#[test]
	fn returns_nothing_when_there_is_no_marker() {
		let temporary = tempfile::tempdir().expect("temp");
		let root = temporary.path();
		std::fs::create_dir_all(&root).unwrap();
		// A temp directory has no data/bucket above it, and finding one would mean the walk
		// escaped into somebody's home.
		assert_eq!(find_upwards(&root), None);
		std::fs::remove_dir_all(&root).unwrap();
	}
}
