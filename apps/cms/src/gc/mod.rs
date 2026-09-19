//! The `cms gc` command: dropping what no article asks for any more.
//!
//! Dry by default and never run as a side effect. See spec/architecture/data.md, "Deletion is
//! the one thing that never happens as a side effect".
//!
//! **Two sweeps live here and they collect different rubbish.** This module drops published bytes
//! nothing references; [segments] drops translations for paragraphs an article no longer contains.
//! They share a word -- each calls its findings orphans -- and nothing else, which is why they are
//! separate modules rather than one plan carrying two lists.

pub mod segments;

use crate::image::manifest::{Body, Media};
use crate::image::run::{MERGED, load};
use crate::licenses;
use crate::opengraph;
use crate::refs;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};
use std::path::{Path, PathBuf};

/// How long an object stays unnamed before this sweep will delete it.
///
/// The published root is cached for five minutes, so for five minutes after a republish there are
/// readers holding a root that names objects the new one does not. An hour is that window plus a
/// margin wide enough that nothing here has to be precise about clocks. See
/// spec/architecture/artifacts.md, "An object is swept an hour after nothing names it".
const DELAY: jiff::SignedDuration = jiff::SignedDuration::from_hours(1);

pub const VERSION: u32 = 1;

/// What the last run found unnamed, and when it first found it so.
///
/// A sweep can see that nothing names an object; it cannot see when that became true. This is the
/// missing half, and it is only ever that: content id to the moment it was first observed
/// unnamed, written as ISO 8601 in UTC so it means the same on whichever machine reads it.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Pending {
	pub version: u32,
	#[serde(default)]
	pub unnamed: BTreeMap<String, String>,
}

impl Default for Pending {
	fn default() -> Self {
		Self { version: VERSION, unnamed: BTreeMap::new() }
	}
}

/// Regenerable by waiting, so it sits under `data/build/` with the rest of what a tool rebuilds.
///
/// Losing it costs one more cycle -- the next run records again and the one after it deletes --
/// and nothing else, which is the whole test for what belongs there.
pub fn record_path(repo: &Path) -> PathBuf {
	repo.join("data").join("build").join("sweep.json")
}

/// How many ids are waiting out the delay, for a report that has to say so.
///
/// A run that collects nothing has two meanings -- nothing is unnamed, or nothing has been
/// unnamed long enough -- and only the second says the next run will delete.
pub fn pending(repo: &Path) -> usize {
	load_record(&record_path(repo)).unnamed.len()
}

/// Read the record, treating anything unreadable or of another version as empty.
///
/// Empty delays every deletion by one more cycle, which is the safe direction. The alternative is
/// reading a shape written by different code as evidence that deleting is now safe.
pub fn load_record(path: &Path) -> Pending {
	std::fs::read_to_string(path)
		.ok()
		.and_then(|text| serde_json::from_str::<Pending>(&text).ok())
		.filter(|record| record.version == VERSION)
		.unwrap_or_default()
}

pub fn save_record(path: &Path, record: &Pending) -> std::io::Result<()> {
	if let Some(parent) = path.parent() {
		std::fs::create_dir_all(parent)?;
	}
	let mut text = serde_json::to_string_pretty(record)
		.map_err(|error| std::io::Error::other(error.to_string()))?;
	text.push('\n');
	std::fs::write(path, text)
}

/// Whether an id first seen unnamed at `first_seen` has been unnamed for the whole delay.
///
/// A stamp that does not parse reads as now rather than as long ago. The record exists to say
/// when deleting becomes safe, and evidence nobody can read is not a licence to delete.
fn unnamed_long_enough(first_seen: &str, now: jiff::Timestamp) -> bool {
	first_seen.parse::<jiff::Timestamp>().is_ok_and(|seen| now.duration_since(seen) >= DELAY)
}

/// Every content id one root mentions, read as text rather than against a schema.
///
/// The root is the site publisher's to shape, so a parser here would be a second declaration of
/// it that can fall behind. A 32-character hex run is a content id wherever it appears, and
/// keeping one too many costs a file while missing one costs an article.
fn hashes_in_root(root: &Path) -> BTreeSet<String> {
	let Ok(text) = std::fs::read_to_string(root.join("state/index.json")) else {
		return BTreeSet::new();
	};
	let mut found = BTreeSet::new();
	let bytes = text.as_bytes();
	let mut start = 0;
	for (index, byte) in bytes.iter().enumerate().chain(std::iter::once((bytes.len(), &b' '))) {
		if byte.is_ascii_hexdigit() && byte.is_ascii_lowercase() || byte.is_ascii_digit() {
			continue;
		}
		if index - start == 32 {
			found.insert(text[start..index].to_owned());
		}
		start = index + 1;
	}
	found
}

/// Every file under a two-hex fan-out directory, which is exactly what `storageKey` writes.
///
/// A named prefix beside them -- `license/full.txt`, the cards, the fonts -- is not addressed by
/// content and is swept, if at all, against whatever does name it.
fn fanned_files(public: &Path) -> std::io::Result<Vec<PathBuf>> {
	let mut found = Vec::new();
	for directory in directories_under(public)? {
		let name = directory.file_name().and_then(|n| n.to_str()).unwrap_or_default();
		if name.len() == 2 && name.bytes().all(|b| b.is_ascii_hexdigit()) {
			found.extend(files_under(&directory)?);
		}
	}
	Ok(found)
}

#[derive(Debug, Default)]
pub struct Sweep {
	/// Files no reachable asset claims.
	pub orphans: Vec<PathBuf>,
	/// Manifest entries for assets no article references any more.
	pub entries: Vec<String>,
	pub bytes: u64,
}

/// Everything in the objects tree that nothing reachable from an article accounts for.
///
/// `metadata` is the other tree: the published root lives there, and every hash it names is what
/// keeps the compiled corpus out of the orphan list.
///
/// **Nothing is offered until it has been unnamed for an hour**, so the first run of a pair
/// records and collects nothing. Planning writes that record; it still deletes nothing.
pub fn plan(
	repo: &Path,
	public: &Path,
	metadata: &Path,
	articles: &Path,
) -> std::io::Result<Sweep> {
	let scan = refs::scan(articles)?;
	let merged = load(&repo.join(MERGED))?;
	let wanted = scan.cids();

	// An article names the original; the manifest is the only link from it to the objects on
	// disk, so a cid missing from the manifest keeps nothing alive -- correct, since the site
	// could not resolve it either.
	//
	// A clip's poster is a whole asset the article never names, only the clip's record does --
	// skipping that hop would sweep it on the first run, though it is the entire fallback for a
	// device that cannot decode the video.
	let mut keep: BTreeSet<String> = wanted.clone();
	let mut posters: Vec<String> = Vec::new();
	for cid in &wanted {
		match merged.media.get(cid).map(|media| &media.body) {
			Some(Body::Image(image)) => keep.extend(image.variants.keys().cloned()),
			Some(Body::Video(video)) => {
				keep.extend(video.variants.keys().cloned());
				keep.extend(video.captions.keys().cloned());
				keep.insert(video.poster.clone());
				posters.push(video.poster.clone());
			}
			None => {}
		}
	}
	for poster in posters {
		if let Some(image) = merged.media.get(&poster).and_then(Media::image) {
			keep.extend(image.variants.keys().cloned());
		}
	}

	// Every hash either root names, which is what stops this from deleting the corpus.
	//
	// **Both roots, and the draft one is not optional.** A draft compiles into the same objects
	// tree as everything else and only the draft root names it, so reading the published root
	// alone would sweep every draft body on every run and the next publish would write it back.
	// The objects tree holds compiled articles beside the assets, so a sweep that knew about
	// assets alone would walk past every article body and call it an orphan.
	keep.extend(hashes_in_root(metadata));
	keep.extend(hashes_in_root(&crate::paths::draft_root(repo)));

	// Cards are content-addressed too and share the flat space, but no article names one: they
	// hang off `cms og`'s record. The live set is what that command would draw -- every non-draft
	// article and the home page, in every view -- asked of it rather than restated, so the two
	// cannot disagree about a slug. See spec/architecture/media.md.
	let drawn = opengraph::manifest::load(&opengraph::manifest::path_for(repo));
	let wanted_cards = opengraph::wanted(articles)?;
	keep.extend(
		drawn
			.cards
			.iter()
			.filter(|(key, _)| wanted_cards.contains(*key))
			.map(|(_, card)| card.cid.clone()),
	);

	// Licence texts are content-addressed too and share the flat space, but nothing in an article
	// or the root reaches one: they hang off the dependency record instead. Without this every
	// licence in the bucket reads as garbage.
	let record: licenses::Record = std::fs::read(licenses::record_path(repo))
		.ok()
		.and_then(|bytes| serde_json::from_slice(&bytes).ok())
		.unwrap_or_default();
	keep.extend(licenses::referenced(&record));

	// A poster's entry stays in the manifest for the same reason its bytes stay on disk: the
	// clip's record points at it, and a record naming an entry that is gone is the one failure
	// this sweep must not create.
	let unnamed_entries: Vec<String> = merged
		.media
		.keys()
		.filter(|cid| !wanted.contains(*cid) && !keep.contains(*cid))
		.cloned()
		.collect();

	// The whole content-addressed space, which is now one flat tree rather than a prefix per kind.
	// A two-hex directory at the top of the objects tree is a fan-out segment and nothing else is,
	// so this walks exactly what `storageKey` writes and never a named prefix beside it. That
	// replaced a list of trees to keep complete -- `video/` and `captions/` were missing from it,
	// which is the quietest way for a store to leak: a tree nothing sweeps has no orphans by
	// definition, so it reports clean while it grows.
	let unnamed_files: Vec<PathBuf> =
		fanned_files(public)?.into_iter().filter(|path| !keep.contains(&stem_of(path))).collect();

	// Nothing above knows when an object stopped being named, only that nothing names it now, so
	// this run writes that down and collects what an earlier run wrote down an hour ago. The new
	// record is built out of what is unnamed today rather than edited into the old one, which is
	// what clears the timer for anything named again: an id that came back is not carried over,
	// and so cannot be deleted later on the strength of a run that predates its return.
	let now = jiff::Timestamp::now();
	let recorded = load_record(&record_path(repo));
	let mut pending = Pending::default();
	let mut due: BTreeSet<String> = BTreeSet::new();
	let unnamed = unnamed_entries.iter().cloned().chain(unnamed_files.iter().map(|p| stem_of(p)));
	for cid in unnamed {
		let first_seen = recorded.unnamed.get(&cid).cloned().unwrap_or_else(|| now.to_string());
		if unnamed_long_enough(&first_seen, now) {
			due.insert(cid.clone());
		}
		pending.unnamed.insert(cid, first_seen);
	}
	save_record(&record_path(repo), &pending)?;

	let mut sweep = Sweep {
		entries: unnamed_entries.into_iter().filter(|cid| due.contains(cid)).collect(),
		..Sweep::default()
	};
	for path in unnamed_files {
		if due.contains(&stem_of(&path)) {
			sweep.bytes += path.metadata().map(|meta| meta.len()).unwrap_or_default();
			sweep.orphans.push(path);
		}
	}

	// Icons are swept by domain rather than by content: the directory existing is the record
	// that the domain was checked, so removing one file inside it would claim the site was
	// asked and had no icon. They are swept where they are fetched, not where they are published:
	// the published copy is content-addressed and falls out of `keep` with everything else.
	// The hour above does not reach here: no published key is addressed by this name.
	let wanted_domains: BTreeSet<String> =
		scan.wanted().into_iter().map(|icon| icon.domain).collect();
	for directory in directories_under(&crate::paths::favicon_root(repo))? {
		let name = directory.file_name().and_then(|n| n.to_str()).unwrap_or_default().to_owned();
		if !wanted_domains.contains(&name) {
			sweep.bytes += files_under(&directory)?
				.iter()
				.filter_map(|path| path.metadata().ok())
				.map(|meta| meta.len())
				.sum::<u64>();
			sweep.orphans.push(directory);
		}
	}

	sweep.orphans.sort();
	Ok(sweep)
}

/// Carry out a plan, and rewrite the manifest without the entries it dropped.
///
/// The manifest is rewritten before a single byte is removed, and the whole document is read
/// and serialised before either. Deleting first and then failing to record it leaves the
/// manifest pointing at files that are gone, which a site build resolves into missing images;
/// recording first and then failing to delete leaves bytes nothing references, which the next
/// sweep finds and offers again. Only one of those two repairs itself.
pub fn apply(repo: &Path, sweep: &Sweep) -> std::io::Result<()> {
	if !sweep.entries.is_empty() {
		let merged_path = repo.join(MERGED);
		let mut merged = load(&merged_path)?;
		for cid in &sweep.entries {
			merged.media.remove(cid);
		}
		merged.updated = crate::image::manifest::now();
		let json = serde_json::to_string_pretty(&merged)
			.map_err(|error| std::io::Error::other(error.to_string()))?;
		crate::image::store::write(&merged_path, format!("{json}\n").as_bytes())?;
	}

	for path in &sweep.orphans {
		if path.is_dir() {
			std::fs::remove_dir_all(path)?;
		} else {
			std::fs::remove_file(path)?;
		}
	}
	Ok(())
}

/// The content id a stored file is named by, whatever it is nested under.
fn stem_of(path: &Path) -> String {
	path.file_stem().and_then(|stem| stem.to_str()).unwrap_or_default().to_owned()
}

fn files_under(directory: &Path) -> std::io::Result<Vec<PathBuf>> {
	let mut found = Vec::new();
	if !directory.is_dir() {
		return Ok(found);
	}
	for entry in std::fs::read_dir(directory)?.filter_map(Result::ok) {
		let path = entry.path();
		if path.is_dir() {
			found.extend(files_under(&path)?);
		} else {
			found.push(path);
		}
	}
	Ok(found)
}

fn directories_under(directory: &Path) -> std::io::Result<Vec<PathBuf>> {
	if !directory.is_dir() {
		return Ok(Vec::new());
	}
	Ok(
		std::fs::read_dir(directory)?
			.filter_map(Result::ok)
			.map(|entry| entry.path())
			.filter(|path| path.is_dir())
			.collect(),
	)
}

#[cfg(test)]
mod tests {
	use super::*;
	use crate::image::manifest::{Body, Image, Media, Merged, Source, VariantRecord};
	use std::collections::BTreeMap;

	/// A directory that removes itself, however the test ends.
	///
	/// `TempDir` deletes on drop, which the hand-rolled predecessor could not: a panicking test
	/// left its directory behind, and the name carried the process id because two tests choosing
	/// the same one would otherwise share a directory. Both problems belonged to the workaround.
	fn temp() -> tempfile::TempDir {
		tempfile::tempdir().expect("temp")
	}

	/// What a pair of runs an hour apart collects, which is what every test below is about.
	///
	/// The first run of a pair only records, so a test asking what gets swept has to be the
	/// second one. Neither run deletes anything: `plan` is still pure that way.
	fn swept(repo: &Path, public: &Path, metadata: &Path, articles: &Path) -> Sweep {
		plan(repo, public, metadata, articles).expect("first plan");
		let hour_passes = jiff::Timestamp::now() - DELAY - jiff::SignedDuration::from_secs(1);
		let path = record_path(repo);
		let mut record = load_record(&path);
		for stamp in record.unnamed.values_mut() {
			*stamp = hour_passes.to_string();
		}
		save_record(&path, &record).expect("record");
		plan(repo, public, metadata, articles).expect("second plan")
	}

	fn media(variant: &str) -> Media {
		let mut variants = BTreeMap::new();
		variants.insert(
			variant.to_owned(),
			VariantRecord { mime: "image/avif".into(), width: 640, height: 360, quality: 0.68, bytes: 1 },
		);
		Media {
			created: "2026-07-31T00:00:00Z".into(),
			updated: "2026-07-31T00:00:00Z".into(),
			blake3: String::new(),
			body: Body::Image(Image {
				thumbhash: String::new(),
				source: Source {
					mime: "image/png".into(),
					width: 640,
					height: 360,
					ratio: "16:9".into(),
					bytes: 1,
				},
				metadata: None,
				variants,
			}),
		}
	}

	/// A repository with one referenced asset and one abandoned one.
	///
	/// The guard comes back with the paths: it owns the directory, so dropping it here would
	/// delete everything the caller is about to look at.
	fn scenario() -> (tempfile::TempDir, PathBuf, String, String) {
		let temporary = temp();
		let root = temporary.path().to_path_buf();
		let kept = "44b6081deaf0242ca3bf83d62a3b6c95".to_owned();
		let dropped = "12faaa76365814de1195d6bdf1e5ba05".to_owned();
		let kept_variant = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa".to_owned();
		let dropped_variant = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb".to_owned();

		std::fs::create_dir_all(root.join("contents")).expect("dir");
		std::fs::write(root.join("contents/a.md"), format!("![]({kept}.avif)")).expect("write");

		let mut assets = BTreeMap::new();
		assets.insert(kept.clone(), media(&kept_variant));
		assets.insert(dropped.clone(), media(&dropped_variant));
		let merged = Merged {
			version: 1,
			created: "2026-07-31T00:00:00Z".into(),
			updated: "2026-07-31T00:00:00Z".into(),
			media: assets,
		};
		// Through the same writer production uses, which creates the parent. The manifest sits
		// at `data/record/metadata.json` now, so a bare write lands in a directory that is not there.
		crate::image::store::write(
			&root.join(MERGED),
			serde_json::to_string(&merged).expect("json").as_bytes(),
		)
		.expect("write");

		let public = root.join("public");
		for (cid, variant) in [(&kept, &kept_variant), (&dropped, &dropped_variant)] {
			let object = crate::image::store::variant_path(&public, variant, "avif");
			crate::image::store::write(&object, b"bytes").expect("write");
			crate::image::store::write(&crate::image::store::meta_path(&public, cid), b"{}")
				.expect("write");
		}
		(temporary, root, kept_variant, dropped_variant)
	}

	#[test]
	fn keeps_the_variants_of_a_referenced_asset() {
		let (_temporary, root, kept_variant, dropped_variant) = scenario();
		let sweep = swept(&root, &root.join("public"), &root.join("metadata"), &root.join("contents"));

		let names: Vec<String> = sweep.orphans.iter().map(|p| stem_of(p)).collect();
		assert!(!names.contains(&kept_variant), "swept a live variant");
		assert!(names.contains(&dropped_variant), "kept a dead variant");
		std::fs::remove_dir_all(&root).ok();
	}

	#[test]
	fn drops_the_manifest_entry_along_with_the_bytes() {
		// Leaving the record behind would make the manifest grow forever and would let a
		// later reference resolve to variants that are no longer there.
		let (_temporary, root, _, _) = scenario();
		let sweep = swept(&root, &root.join("public"), &root.join("metadata"), &root.join("contents"));
		assert_eq!(sweep.entries, vec!["12faaa76365814de1195d6bdf1e5ba05"]);

		apply(&root, &sweep).expect("apply");
		let merged = load(&root.join(MERGED)).expect("merged");
		assert_eq!(merged.media.len(), 1);
		assert!(merged.media.contains_key("44b6081deaf0242ca3bf83d62a3b6c95"));
		std::fs::remove_dir_all(&root).ok();
	}

	#[test]
	fn planning_alone_deletes_nothing() {
		let (_temporary, root, _, _) = scenario();
		let sweep = swept(&root, &root.join("public"), &root.join("metadata"), &root.join("contents"));
		assert!(!sweep.orphans.is_empty());
		for path in &sweep.orphans {
			assert!(path.exists(), "planning removed {}", path.display());
		}
		std::fs::remove_dir_all(&root).ok();
	}

	#[test]
	fn a_clip_keeps_its_rungs_its_tracks_and_the_poster_nothing_else_names() {
		// The poster is the whole fallback for a device that cannot decode AV1, and no article
		// ever names it -- only the clip's record does. Sweeping by references alone takes it on
		// the first run, and takes its own variants and record with it.
		use crate::image::manifest::{Caption, Video, VideoSource, VideoVariant};

		let temporary = temp();
		let root = temporary.path().to_path_buf();
		let clip = "44b6081deaf0242ca3bf83d62a3b6c95".to_owned();
		let poster = "12faaa76365814de1195d6bdf1e5ba05".to_owned();
		let rung = "cccccccccccccccccccccccccccccccc".to_owned();
		let track = "dddddddddddddddddddddddddddddddd".to_owned();
		let poster_variant = "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee".to_owned();

		std::fs::create_dir_all(root.join("contents")).expect("dir");
		std::fs::write(root.join("contents/a.md"), format!("![]({clip}.avif)")).expect("write");

		let mut assets = BTreeMap::new();
		assets.insert(poster.clone(), media(&poster_variant));
		assets.insert(
			clip.clone(),
			Media {
				created: "2026-09-14T00:00:00Z".into(),
				updated: "2026-09-14T00:00:00Z".into(),
				blake3: clip.clone(),
				body: Body::Video(Video {
					source: VideoSource {
						mime: "video/mp4".into(),
						width: 1920,
						height: 1080,
						ratio: "16:9".into(),
						bytes: 1,
						duration: 1.0,
						frame_rate: 30.0,
						frames: 30,
						audio: false,
						loudness: None,
						peak: None,
					},
					poster: poster.clone(),
					variants: BTreeMap::from([(
						rung.clone(),
						VideoVariant {
							mime: "video/mp4".into(),
							width: 1920,
							height: 1080,
							bytes: 1,
							codec: "av01.0.05M.08".into(),
						},
					)]),
					captions: BTreeMap::from([(
						track.clone(),
						Caption {
							mime: "text/vtt".into(),
							language: "en".into(),
							kind: "captions".into(),
							bytes: 1,
						},
					)]),
				}),
			},
		);
		crate::image::store::write(
			&root.join(MERGED),
			serde_json::to_string(&Merged {
				version: crate::image::manifest::VERSION,
				created: "2026-09-14T00:00:00Z".into(),
				updated: "2026-09-14T00:00:00Z".into(),
				media: assets,
			})
			.expect("json")
			.as_bytes(),
		)
		.expect("write");

		use crate::image::store;

		let public = root.join("public");
		store::write(&store::video_path(&public, &rung), b"bytes").expect("rung");
		store::write(&store::caption_path(&public, &track), b"WEBVTT").expect("track");
		store::write(&store::variant_path(&public, &poster_variant, "avif"), b"bytes")
			.expect("poster variant");
		let orphan = "ffffffffffffffffffffffffffffffff";
		store::write(&store::variant_path(&public, orphan, "avif"), b"x").expect("orphan");
		for cid in [&clip, &poster] {
			store::write(&store::meta_path(&public, cid), b"{}").expect("record");
		}

		let sweep = swept(&root, &public, &root.join("metadata"), &root.join("contents"));
		let names: Vec<String> = sweep.orphans.iter().map(|path| stem_of(path)).collect();
		assert!(!names.contains(&rung), "swept a live rung");
		assert!(!names.contains(&track), "swept a live caption");
		assert!(!names.contains(&poster), "swept the poster's record");
		assert!(!names.contains(&poster_variant), "swept the poster's own variant");
		assert_eq!(names, vec!["ffffffffffffffffffffffffffffffff"]);
		// The poster is reachable only through the clip, so its manifest entry has to survive
		// the same hop its bytes did.
		assert!(sweep.entries.is_empty(), "{:?}", sweep.entries);
		std::fs::remove_dir_all(&root).ok();
	}

	#[test]
	fn a_draft_body_is_kept_by_the_root_only_the_draft_names_it() {
		// A draft compiles into the same objects tree as everything else, and the published root
		// does not name it. Reading that root alone would sweep every draft body on every run.
		let temporary = temp();
		let root = temporary.path().to_path_buf();
		std::fs::create_dir_all(root.join("contents")).expect("dir");

		let public = root.join("public");
		let body = "ab".repeat(16);
		crate::image::store::write(&crate::image::store::variant_path(&public, &body, "json"), b"{}")
			.expect("write");

		let state = crate::paths::draft_root(&root).join("state");
		std::fs::create_dir_all(&state).expect("dir");
		std::fs::write(state.join("index.json"), format!("{{\"content\":\"{body}\"}}"))
			.expect("draft root");

		let sweep = swept(&root, &public, &root.join("metadata"), &root.join("contents"));
		let names: Vec<String> = sweep.orphans.iter().map(|path| stem_of(path)).collect();
		assert!(!names.contains(&body), "swept a draft body the draft root names");
		std::fs::remove_dir_all(&root).ok();
	}

	#[test]
	fn sweeps_a_card_no_page_asks_for_any_more() {
		// A card is content-addressed like everything else, so what keeps it alive is `cms og`'s
		// record -- and only for a key the live set still wants. A card for a draft, or one whose
		// page is gone, is bytes nothing reaches.
		let temporary = temp();
		let root = temporary.path().to_path_buf();
		std::fs::create_dir_all(root.join("contents")).expect("dir");
		std::fs::write(root.join("contents/kept.md"), "---\ntitle: Kept\n---\n\nbody\n")
			.expect("write");
		std::fs::write(root.join("contents/hidden.md"), "---\ntitle: Hidden\ndraft: true\n---\n")
			.expect("write");

		let public = root.join("public");
		let mut drawn = crate::opengraph::manifest::Manifest::default();
		let cids = ["aa".repeat(16), "bb".repeat(16), "cc".repeat(16)];
		for (slug, cid) in ["kept", "hidden", "gone"].iter().zip(&cids) {
			crate::image::store::write(&crate::image::store::variant_path(&public, cid, "png"), b"png")
				.expect("write");
			drawn.cards.insert(
				crate::opengraph::card_key("mw", slug),
				crate::opengraph::manifest::Card { hash: "x".into(), cid: cid.clone() },
			);
		}
		crate::opengraph::manifest::save(&crate::opengraph::manifest::path_for(&root), &drawn)
			.expect("record");

		let sweep = swept(&root, &public, &root.join("metadata"), &root.join("contents"));
		let names: Vec<String> = sweep.orphans.iter().map(|path| stem_of(path)).collect();
		assert_eq!(names, vec![cids[1].clone(), cids[2].clone()]);
		std::fs::remove_dir_all(&root).ok();
	}

	#[test]
	fn the_first_run_collects_nothing_and_writes_down_what_it_found() {
		// Deleting on sight would hand a reader whose root is five minutes old a 404 on a
		// content-addressed key, which is the one answer this design cannot afford cached.
		let (_temporary, root, _, dropped_variant) = scenario();
		let sweep = plan(&root, &root.join("public"), &root.join("metadata"), &root.join("contents"))
			.expect("plan");
		assert!(sweep.orphans.is_empty(), "{:?}", sweep.orphans);
		assert!(sweep.entries.is_empty(), "{:?}", sweep.entries);

		let record = load_record(&record_path(&root));
		assert!(record.unnamed.contains_key(&dropped_variant), "{:?}", record.unnamed);
		assert!(record.unnamed.contains_key("12faaa76365814de1195d6bdf1e5ba05"));
		std::fs::remove_dir_all(&root).ok();
	}

	#[test]
	fn a_run_after_the_delay_collects_what_the_first_one_recorded() {
		let (_temporary, root, _, dropped_variant) = scenario();
		let sweep = swept(&root, &root.join("public"), &root.join("metadata"), &root.join("contents"));

		let names: Vec<String> = sweep.orphans.iter().map(|path| stem_of(path)).collect();
		assert!(names.contains(&dropped_variant), "{names:?}");
		assert_eq!(sweep.entries, vec!["12faaa76365814de1195d6bdf1e5ba05"]);
		assert!(sweep.bytes > 0);
		std::fs::remove_dir_all(&root).ok();
	}

	#[test]
	fn an_object_named_again_leaves_the_record_and_is_never_collected() {
		// Being named again has to clear the timer rather than be checked beside it: a stale
		// entry from the run before would let the next one delete a file an article had started
		// naming again, on the strength of an hour that ended when it came back.
		let (_temporary, root, _, dropped_variant) = scenario();
		let public = root.join("public");
		let metadata = root.join("metadata");
		let contents = root.join("contents");
		let dropped = "12faaa76365814de1195d6bdf1e5ba05";

		plan(&root, &public, &metadata, &contents).expect("plan");
		assert!(load_record(&record_path(&root)).unnamed.contains_key(&dropped_variant));

		std::fs::write(contents.join("a.md"), format!("![]({dropped}.avif)")).expect("write");
		let sweep = plan(&root, &public, &metadata, &contents).expect("plan");
		assert!(!load_record(&record_path(&root)).unnamed.contains_key(&dropped_variant));
		assert!(sweep.orphans.is_empty(), "{:?}", sweep.orphans);

		let later = swept(&root, &public, &metadata, &contents);
		let names: Vec<String> = later.orphans.iter().map(|path| stem_of(path)).collect();
		assert!(!names.contains(&dropped_variant), "collected a variant an article names again");
		std::fs::remove_dir_all(&root).ok();
	}

	#[test]
	fn sweeps_an_icon_directory_no_article_links_to() {
		// One run, deliberately: an icon directory is an input under `data/source/` and never a
		// published key, so no reader's cached root can be naming it. The hour protects what the
		// CDN may still be asked for, which this is not.
		let temporary = temp();
		let root = temporary.path();
		std::fs::create_dir_all(root.join("contents")).expect("dir");
		std::fs::write(root.join("contents/a.md"), r#"::linkcard{url="https://kept.example"}"#)
			.expect("write");

		let public = root.join("public");
		for domain in ["kept.example", "gone.example"] {
			let directory = crate::paths::favicon_root(&root).join(domain);
			std::fs::create_dir_all(&directory).expect("dir");
			std::fs::write(directory.join("light.png"), b"icon").expect("write");
		}

		let sweep = plan(&root, &public, &root.join("metadata"), &root.join("contents")).expect("plan");
		assert_eq!(sweep.orphans.len(), 1);
		assert!(sweep.orphans[0].ends_with("gone.example"));
		std::fs::remove_dir_all(&root).ok();
	}
}
