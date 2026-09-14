//! The `cms video` command: what the articles ask for, encoded and published.
//!
//! The same arrangement `image::run` uses, and deliberately the same vocabulary. Articles drive
//! this, not the contents of a directory: a reference is either finished -- `{cid}.mp4` -- or it
//! still names a file, in which case that file is looked for under the originals directory,
//! encoded, published, and the reference rewritten to what it became. Rewriting is what records
//! that the work is done, so the state lives in the article rather than in a log beside it.

use super::{encode, is_video};
use crate::image::manifest::{self, Media, Merged};
use crate::image::run::{MERGED, load, rewrite_references};
use crate::image::store;
use crate::media;
use crate::refs::{self, Scan};
use std::collections::{BTreeMap, BTreeSet};
use std::path::{Path, PathBuf};

#[derive(Debug, Default)]
pub struct Outcome {
	pub processed: usize,
	pub skipped: usize,
	pub rewritten: usize,
	pub failed: Vec<(PathBuf, String)>,
	/// References naming a file that is not under the originals directory.
	///
	/// Not an error: an article may be written before its clip is dropped in, and stopping the
	/// run would leave every other clip unencoded for the sake of one that is late.
	pub missing: Vec<String>,
	/// Posters given a `cid://` source in `data/media.yaml` because they had none.
	pub sourced: usize,
}

pub struct Options<'a> {
	pub force: bool,
	/// Files named on the command line. Empty means "whatever the articles ask for".
	pub only: &'a [PathBuf],
}

/// Encode and publish every clip the articles reference, then rewrite the references.
///
/// Nothing here migrates a stale record the way `image::run` does. Both commands write into one
/// merged manifest and `image::run::republish` rewrites a record of either kind from what the
/// manifest already holds, so a second migration pass here would be the same work done twice.
pub fn run(
	repo: &Path,
	originals: &Path,
	public: &Path,
	articles: &Path,
	options: &Options<'_>,
) -> std::io::Result<Outcome> {
	let merged_path = repo.join(MERGED);
	let mut merged = load(&merged_path)?;
	let media_path = media::path_for(repo);
	let mut authored = media::load(&media_path)?;
	let mut outcome = Outcome::default();
	let scan = refs::scan(articles)?;

	// What the article wrote, mapped to what it should say now.
	let mut rewrites: BTreeMap<String, String> = BTreeMap::new();

	for (reference, path) in wanted(&scan, originals, public, &merged, options, &mut outcome) {
		let bytes = match std::fs::read(&path) {
			Ok(bytes) => bytes,
			Err(error) => {
				outcome.failed.push((path, error.to_string()));
				continue;
			}
		};

		// Read whole rather than streamed, so the id comes from `image::cid` and there is one
		// definition of how a content id is truncated. These are excerpts, not masters.
		let id = crate::image::cid(&bytes);
		if !options.force && published(public, &merged, merged.media.get(&id)) {
			outcome.skipped += 1;
			if let Some(target) = reference.as_deref() {
				rewrites.insert(target.to_owned(), resolved_name(&id));
			}
			continue;
		}

		let published = super::publish(&path, &bytes, public, &merged.media);
		match published {
			Ok(prepared) => {
				if let Some(target) = reference.as_deref() {
					rewrites.insert(target.to_owned(), resolved_name(&id));
				}
				// The poster is a second asset with a record of its own, not a field of the clip.
				let poster = prepared.poster.media.blake3.clone();
				merged.media.insert(poster.clone(), prepared.poster.media.clone());
				merged.media.insert(id.clone(), prepared.media.clone());
				if note_poster_source(&mut authored, &poster, &id) {
					outcome.sourced += 1;
				}
				outcome.processed += 1;
			}
			Err(error) => outcome.failed.push((path, error.to_string())),
		}
	}

	merged.updated = manifest::now();
	let json = serde_json::to_string_pretty(&merged)
		.map_err(|error| std::io::Error::other(error.to_string()))?;
	store::write(&merged_path, format!("{json}\n").as_bytes())?;
	media::save(&media_path, &authored)?;

	// Bytes and records land first because a crash after publishing can only leave a clip no
	// article references yet; that is harmless and a rerun repairs it. Rewriting first could
	// crash before the bytes land, leaving an article pointing at nothing, and the lost original
	// filename would leave a later run no way to repair it. See spec/tasks.md.
	outcome.rewritten = rewrite_references(articles, &rewrites)?;
	Ok(outcome)
}

/// Give a poster the provenance the clip already has, once.
///
/// `cid://{blake3}` with no label: the target is an asset in this repository, so there is no
/// publication to credit and following the link reaches the clip's own source. Only written
/// when the entry has none -- a source is a claim a person may have corrected by hand, and this
/// must never be the thing that overwrites it. See spec/architecture/media.md.
fn note_poster_source(authored: &mut media::Media, poster: &str, clip: &str) -> bool {
	let entry = authored.media.entry(poster.to_owned()).or_default();
	if entry.source.is_some() {
		return false;
	}
	// The asset id and not a rung's: the frame came from the clip, not from the 1080p rendition
	// of it, and a rung's id changes whenever the ladder does. No extension either -- that is how
	// a request asks for one representation, and this names the thing.
	entry.source = Some(media::Source { url: format!("cid://{clip}"), label: None });
	true
}

/// Every clip to look at this run, paired with the reference that asked for it.
///
/// Files named on the command line have no reference to rewrite: they are being imported ahead
/// of the article that will use them.
fn wanted(
	scan: &Scan,
	originals: &Path,
	public: &Path,
	merged: &Merged,
	options: &Options<'_>,
	outcome: &mut Outcome,
) -> Vec<(Option<String>, PathBuf)> {
	if !options.only.is_empty() {
		return options.only.iter().map(|path| (None, path.clone())).collect();
	}

	let mut found: Vec<(Option<String>, PathBuf)> = Vec::new();

	// `refs` collects what an article names, and a clip is named the same way a picture is. A
	// `::video` directive is not read yet, and when `refs` learns it those references arrive in
	// this same list with nothing here to change.
	for reference in scan.unresolved().into_iter().filter(|image| is_video(&image.value)) {
		let candidate = originals.join(&reference.value);
		if candidate.is_file() {
			found.push((Some(reference.value.clone()), candidate));
		} else {
			outcome.missing.push(reference.value.clone());
		}
	}

	// A finished reference whose rungs are gone -- swept, or never published on this machine.
	// The original is found by hashing, because the id is the hash.
	let unpublished: Vec<String> = resolved(scan)
		.into_iter()
		.filter(|cid| !published(public, merged, merged.media.get(cid)))
		.collect();
	if !unpublished.is_empty() {
		let by_id = originals_by_id(originals);
		for cid in unpublished {
			match by_id.get(&cid) {
				Some(path) => found.push((None, path.clone())),
				None => outcome.missing.push(cid),
			}
		}
	}

	found
}

/// The content ids of every clip an article has already resolved.
fn resolved(scan: &Scan) -> BTreeSet<String> {
	scan
		.images
		.iter()
		.filter_map(|image| image.resolved())
		.filter(|(_, extension)| *extension == encode::EXTENSION)
		.map(|(cid, _)| cid.to_owned())
		.collect()
}

/// Content id of every original on hand, so a swept clip can be rebuilt from its id alone.
fn originals_by_id(originals: &Path) -> BTreeMap<String, PathBuf> {
	sources(originals)
		.unwrap_or_default()
		.into_iter()
		.filter_map(|path| Some((crate::image::cid(&std::fs::read(&path).ok()?), path)))
		.collect()
}

/// Whether every object a record claims is actually on disk, the poster's included.
///
/// The manifest alone is not evidence: after a sweep it still lists assets whose bytes are gone,
/// and trusting it would leave articles pointing at nothing. The poster counts because it is the
/// fallback -- a clip whose rungs are all present and whose poster is missing has lost exactly
/// what the reader who cannot decode AV1 was going to see.
fn published(public: &Path, merged: &Merged, media: Option<&Media>) -> bool {
	let Some(video) = media.and_then(Media::video) else {
		return false;
	};
	let rungs = video.variants.keys().all(|cid| store::video_path(public, cid).is_file());
	rungs && poster_published(public, merged, &video.poster)
}

fn poster_published(public: &Path, merged: &Merged, poster: &str) -> bool {
	merged.media.get(poster).and_then(Media::image).is_some_and(|image| {
		image.variants.iter().all(|(cid, record)| {
			store::variant_path(public, cid, crate::extension::for_variant(&record.mime)).is_file()
		})
	})
}

/// What an article should call this clip. One codec and one container, so unlike a picture
/// there is nothing to look up: the extension is the only one a rung is ever written under.
fn resolved_name(cid: &str) -> String {
	format!("{cid}.{}", encode::EXTENSION)
}

fn sources(directory: &Path) -> std::io::Result<Vec<PathBuf>> {
	if !directory.is_dir() {
		return Ok(Vec::new());
	}
	let mut found: Vec<PathBuf> = std::fs::read_dir(directory)?
		.filter_map(Result::ok)
		.map(|entry| entry.path())
		.filter(|path| path.is_file() && is_video(&path.to_string_lossy()))
		.collect();
	// Sorted so a run over the same directory reports in the same order twice, which is what
	// makes a failure reproducible.
	found.sort();
	Ok(found)
}

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn a_resolved_name_is_the_id_and_the_one_format() {
		assert_eq!(
			resolved_name("44b6081deaf0242ca3bf83d62a3b6c95"),
			"44b6081deaf0242ca3bf83d62a3b6c95.mp4"
		);
	}

	#[test]
	fn a_poster_keeps_a_source_somebody_wrote() {
		// A source is a claim a person may have corrected by hand. Re-running the import rebuilds
		// every pixel and must not take it with them, which is the rule `data/media.yaml` exists
		// to enforce.
		let mut authored = media::Media::default();
		authored.media.insert(
			"poster".to_owned(),
			media::Entry {
				source: Some(media::Source {
					url: "https://example.invalid/newsroom".to_owned(),
					label: Some("Apple".to_owned()),
				}),
				..media::Entry::default()
			},
		);
		assert!(!note_poster_source(&mut authored, "poster", "clip"));
		assert_eq!(
			authored.media["poster"].source.as_ref().expect("kept").url,
			"https://example.invalid/newsroom"
		);
	}

	#[test]
	fn a_poster_with_no_source_is_pointed_at_its_clip_without_a_label() {
		let mut authored = media::Media::default();
		assert!(note_poster_source(&mut authored, "poster", "44b6081deaf0242ca3bf83d62a3b6c95"));
		let source = authored.media["poster"].source.as_ref().expect("written");
		assert_eq!(source.url, "cid://44b6081deaf0242ca3bf83d62a3b6c95");
		// The target is an asset here, so there is no publication to credit and a hand-typed name
		// for something the system already knows is a name nothing checks.
		assert_eq!(source.label, None);
		// No extension: that is how a request asks for one representation, not how a thing is named.
		assert!(!source.url.ends_with(".mp4"));
	}
}
