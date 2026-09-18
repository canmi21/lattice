//! What each published card was drawn from, so a stale one can be recognised.
//!
//! The command used to skip any card whose file already existed. That is only correct while a
//! card is a function of its own path, and it never quite was -- editing a title left the old
//! card in place until somebody remembered `--force` -- but it stopped being defensible once a
//! card started carrying a read count, which changes without anything in the repository
//! changing at all.
//!
//! So the decision moves from "does the file exist" to "was it drawn from these inputs". The
//! record is a hash per card: small, order-independent, and it says nothing about what the
//! inputs were, which is deliberate. Storing the title would put a second copy of the article
//! in a build artifact and invite somebody to read it from here.

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

pub const VERSION: u32 = 3;

/// One drawn card: what it was drawn from, and the object it was published as.
///
/// Both, because they answer different questions. `hash` decides whether it still needs drawing;
/// `cid` is where the bytes went, and it is the only place that address is written down -- a card
/// is content-addressed like everything else now, so nothing can derive one from a slug.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Card {
	pub hash: String,
	pub cid: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Manifest {
	pub version: u32,
	/// `{view}/{slug}`, to what drew the card and what it was published as.
	#[serde(default)]
	pub cards: BTreeMap<String, Card>,
}

impl Default for Manifest {
	fn default() -> Self {
		Self { version: VERSION, cards: BTreeMap::new() }
	}
}

pub fn path_for(repo: &Path) -> PathBuf {
	repo.join("data").join("build").join("opengraph.json")
}

/// Read the record, treating anything unreadable or of another version as empty.
///
/// An unreadable manifest means every card is redrawn, which is slow and correct. Guessing
/// that an older shape is close enough would mean deciding a card is current on evidence
/// written by different code.
pub fn load(path: &Path) -> Manifest {
	std::fs::read_to_string(path)
		.ok()
		.and_then(|text| serde_json::from_str::<Manifest>(&text).ok())
		.filter(|manifest| manifest.version == VERSION)
		.unwrap_or_default()
}

pub fn save(path: &Path, manifest: &Manifest) -> std::io::Result<()> {
	if let Some(parent) = path.parent() {
		std::fs::create_dir_all(parent)?;
	}
	let mut text = serde_json::to_string_pretty(manifest)
		.map_err(|error| std::io::Error::other(error.to_string()))?;
	text.push('\n');
	std::fs::write(path, text)
}

/// A hash of everything that decides what a card looks like.
///
/// Fed as length-prefixed parts rather than concatenated, so a title ending in the text a
/// subtitle begins with cannot hash the same as the two swapped.
pub fn digest(parts: &[&str]) -> String {
	let mut hasher = blake3::Hasher::new();
	for part in parts {
		hasher.update(&(part.len() as u64).to_le_bytes());
		hasher.update(part.as_bytes());
	}
	hasher.finalize().to_hex()[..32].to_owned()
}

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn changing_any_input_changes_the_hash() {
		let base = digest(&["A Thing", "about it", "9510"]);
		assert_ne!(base, digest(&["A Thing", "about it", "9511"]));
		assert_ne!(base, digest(&["A Thing!", "about it", "9510"]));
		assert_eq!(base, digest(&["A Thing", "about it", "9510"]));
	}

	#[test]
	fn a_boundary_cannot_be_moved_between_parts() {
		// Concatenated, both of these would be "ab"; length-prefixed they cannot collide, which
		// is what stops a title absorbing the start of its subtitle from looking unchanged.
		assert_ne!(digest(&["a", "b"]), digest(&["ab", ""]));
	}

	#[test]
	fn another_version_is_read_as_no_record_at_all() {
		let temporary = tempfile::tempdir().expect("temp");
		let root = temporary.path();
		std::fs::create_dir_all(&root).expect("dir");
		let path = root.join("opengraph.json");
		std::fs::write(&path, r#"{"version":999,"cards":{"a.png":"deadbeef"}}"#).expect("write");
		assert!(load(&path).cards.is_empty());
		std::fs::remove_dir_all(&root).ok();
	}
}
