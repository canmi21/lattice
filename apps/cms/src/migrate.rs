//! The `cms migrate` command: granting every record in the corpus a resource id, once.
//!
//! One pass and one direction. It reads the manifest as it sits on disk, grants an id to every
//! record, rewrites every article reference to name that id instead of an original's content id
//! and a format, resolves each clip's poster into a `cover`, reclassifies those pictures as the
//! frames they are, and moves each published record onto its new key. Dry by default, the way
//! `cms gc` is: the listing is the review and `--live` is the answer to it. See
//! spec/architecture/resource.md.

use crate::image::manifest::{self, Media, Merged, Unnamed};
use crate::image::run::MERGED;
use crate::image::store;
use crate::refs;
use crate::resource::{self, ResourceId};
use std::collections::{BTreeMap, BTreeSet};
use std::path::{Path, PathBuf};

#[derive(Debug, thiserror::Error)]
pub enum Error {
	#[error("could not read: {0}")]
	Read(#[source] std::io::Error),
	#[error("could not write: {0}")]
	Write(#[source] std::io::Error),
	#[error("`{0}`: {1}")]
	Record(String, String),
	/// An article names something the manifest does not hold.
	///
	/// A refusal rather than a skip, and the whole reason is that the two disagree: continuing
	/// would rewrite the references that resolve and silently strand the ones that do not, in a
	/// corpus where a reference nothing resolves renders as a missing image nobody reports.
	#[error(
		"{} in {} name{} nothing the manifest holds -- the articles and the manifest disagree, and \
		 rewriting the rest would strand {}",
		.0.len(),
		.1.display(),
		if .0.len() == 1 { "s" } else { "" },
		if .0.len() == 1 { "it" } else { "them" }
	)]
	Stranded(Vec<String>, PathBuf),
}

/// One record gaining an id, for a listing somebody reads before saying `--live`.
///
/// Only the records that gain one. A record that already answers to an id is not re-granted, and
/// a second id for a thing that has one is the damage this command must never do.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Grant {
	/// The manifest key, which is the original's content id.
	pub key: String,
	pub resource: ResourceId,
	/// What this record is after the pass, which is only different for a clip's poster.
	pub kind: String,
}

/// Everything the pass would do, decided before any of it is written.
#[derive(Debug)]
pub struct Plan {
	pub grants: Vec<Grant>,
	/// What each article reference becomes: `{cid}.{ext}` to a bare rid.
	pub rewrites: BTreeMap<String, String>,
	/// Published records to move, from `meta/{cid}.json` to `meta/{rid}.json`.
	pub sidecars: Vec<(PathBuf, PathBuf)>,
	/// The whole manifest as it will be written.
	pub merged: Merged,
	/// Pictures reclassified as frames, each with the clip it was cut from.
	pub frames: Vec<(ResourceId, ResourceId)>,
}

impl Plan {
	/// Nothing left to do, which is what a corpus already through the pass answers.
	///
	/// All three, not just the grants: a run interrupted partway leaves ids granted and articles
	/// or records still to move, and a gate that asked only about ids would call that finished.
	pub fn is_empty(&self) -> bool {
		self.grants.is_empty() && self.rewrites.is_empty() && self.sidecars.is_empty()
	}
}

/// Work out everything the pass would do, without touching a file.
///
/// Every decision is made here and the whole manifest is built in memory, because the alternative
/// -- rewriting records as they are read -- can leave the manifest migrated and the articles not.
pub fn plan(repo: &Path, articles: &Path) -> Result<Plan, Error> {
	let metadata = crate::paths::metadata_root(repo);
	let unnamed = manifest::read_unnamed(&repo.join(MERGED)).map_err(Error::Read)?;
	// Granted in one sweep before a single record is converted, because a clip's cover is another
	// record's id and a conversion that allocated as it went could not name one it had not reached.
	let mut register: BTreeSet<ResourceId> = unnamed
		.media
		.values()
		.filter_map(|record| record.get("resource").and_then(serde_json::Value::as_str))
		.filter_map(|text| ResourceId::parse(text).ok())
		.collect();
	let mut granted: BTreeMap<String, ResourceId> = BTreeMap::new();
	for (key, record) in &unnamed.media {
		let held = record.get("resource").and_then(serde_json::Value::as_str);
		let id = match held.and_then(|text| ResourceId::parse(text).ok()) {
			Some(id) => id,
			None => {
				let id = resource::allocate(&register);
				register.insert(id);
				id
			}
		};
		granted.insert(key.clone(), id);
	}

	let named = |cid: &str| granted.get(cid).copied();
	let held: BTreeSet<String> = unnamed
		.media
		.iter()
		.filter(|(_, record)| Unnamed::is_named(record))
		.map(|(key, _)| key.clone())
		.collect();
	let mut media: BTreeMap<String, Media> = BTreeMap::new();
	for (key, record) in unnamed.media.clone() {
		let resource = granted[&key];
		let adopted = manifest::adopt(record, resource, &named)
			.map_err(|error| Error::Record(key.clone(), error))?;
		media.insert(key, adopted);
	}

	// A poster is a frame and could not say so before: a frame is a frame because its `source`
	// names the clip it was cut from, and that is a rid. The same pass that grants the ids is the
	// only one that can classify them. See spec/architecture/resource.md, "The catalogue".
	let mut frames = Vec::new();
	let covers: Vec<(String, ResourceId)> = unnamed
		.media
		.iter()
		.filter_map(|(key, record)| Some((key.clone(), named(Unnamed::poster(record)?)?)))
		.collect();
	for (clip, cover) in covers {
		let clip = granted[&clip];
		let Some((_, poster)) = media.iter_mut().find(|(_, media)| media.resource == cover) else {
			continue;
		};
		let already = poster.layers.frame.is_some();
		if poster.cut_from(clip, None) && !already {
			frames.push((cover, clip));
		}
	}

	let grants = granted
		.iter()
		.filter(|(key, _)| !held.contains(*key))
		.map(|(key, resource)| Grant {
			key: key.clone(),
			resource: *resource,
			kind: media[key].kind().to_owned(),
		})
		.collect();
	let mut plan = Plan {
		grants,
		frames,
		rewrites: BTreeMap::new(),
		sidecars: Vec::new(),
		merged: Merged {
			version: manifest::VERSION,
			created: unnamed.created,
			updated: manifest::now(),
			media,
		},
	};

	plan.rewrites = rewrites(articles, &plan.merged, &granted)?;
	plan.sidecars = granted
		.iter()
		.filter(|(key, resource)| key.as_str() != resource.as_str())
		.map(|(key, resource)| {
			(store::meta_path(&metadata, key), store::meta_path(&metadata, resource.as_str()))
		})
		.filter(|(from, _)| from.is_file())
		.collect();
	Ok(plan)
}

/// What every article reference becomes, refusing the moment one resolves to nothing.
fn rewrites(
	articles: &Path,
	merged: &Merged,
	granted: &BTreeMap<String, ResourceId>,
) -> Result<BTreeMap<String, String>, Error> {
	let scan = refs::scan(articles).map_err(Error::Read)?;
	let mut found = BTreeMap::new();
	let mut stranded: BTreeMap<PathBuf, Vec<String>> = BTreeMap::new();
	for image in &scan.images {
		// Already a rid, or a filename nobody has imported yet. Neither is this pass's to touch:
		// the first is done and the second is what `cms image` is for.
		if image.resource().is_some() {
			continue;
		}
		let Some((cid, _)) = image.resolved() else { continue };
		match granted.get(cid).filter(|resource| merged.by_resource(**resource).is_some()) {
			Some(resource) => {
				found.insert(image.value.clone(), resource.to_string());
			}
			None => stranded.entry(image.file.clone()).or_default().push(image.value.clone()),
		}
	}
	match stranded.into_iter().next() {
		Some((file, values)) => Err(Error::Stranded(values, file)),
		None => Ok(found),
	}
}

/// Carry the plan out.
///
/// **The manifest is written first, because it is the register.** Ids on disk means a second run
/// grants the same ones and finishes what this one did not, so dying partway costs a re-run.
/// Written last, a run that had already rewritten the articles would draw different ids next
/// time and leave every one of them naming something nothing resolves. Nor is anything
/// unreadable meanwhile: the manifest is keyed by the cid an unrewritten article still names.
pub fn apply(repo: &Path, articles: &Path, plan: &Plan) -> Result<usize, Error> {
	let json = serde_json::to_string_pretty(&plan.merged)
		.map_err(|error| Error::Write(std::io::Error::other(error.to_string())))?;
	store::write(&repo.join(MERGED), format!("{json}\n").as_bytes()).map_err(Error::Write)?;

	let rewritten =
		crate::image::run::rewrite_references(articles, &plan.rewrites).map_err(Error::Write)?;

	for (from, to) in &plan.sidecars {
		if let Some(parent) = to.parent() {
			std::fs::create_dir_all(parent).map_err(Error::Write)?;
		}
		std::fs::rename(from, to).map_err(Error::Write)?;
	}
	Ok(rewritten)
}

#[cfg(test)]
mod tests {
	use super::*;

	/// A directory that removes itself, however the test ends.
	fn temp() -> tempfile::TempDir {
		tempfile::tempdir().expect("temp")
	}

	const PICTURE: &str = "0e0624f079e617e53ed474ccd98a947b";
	const POSTER: &str = "12faaa76365814de1195d6bdf1e5ba05";
	const CLIP: &str = "44b6081deaf0242ca3bf83d62a3b6c95";

	/// One picture and one clip, in the shape `data/record/metadata.json` is committed in.
	///
	/// Copied from the real file rather than written to fit: the whole claim this command makes is
	/// about a corpus nobody can regenerate, and a fixture in a shape that corpus is not in would
	/// test the conversion against itself.
	fn legacy() -> String {
		format!(
			r#"{{ "version": 3, "created": "2026-08-01T22:12:59.501555Z",
			"updated": "2026-09-14T22:35:02.251998Z", "media": {{
			"{PICTURE}": {{ "type": "image", "created": "2026-09-14T02:55:32.15685Z",
				"updated": "2026-09-14T02:55:32.15685Z", "blake3": "{PICTURE}",
				"thumbhash": "+vcJBYCIh5iIh3ePhkeHcoiIj4f4",
				"source": {{ "mime": "image/png", "width": 1960, "height": 1274, "ratio": "20:13",
					"bytes": 477086 }},
				"metadata": {{ "color_space": "sRGB" }},
				"variants": {{ "20805a43fdc2119f1aa8fae25c0ff8e1": {{ "mime": "image/avif",
					"width": 640, "height": 416, "quality": 0.68, "bytes": 2253 }} }} }},
			"{POSTER}": {{ "type": "image", "created": "2026-09-14T02:55:32.15685Z",
				"updated": "2026-09-14T02:55:32.15685Z", "blake3": "{POSTER}",
				"thumbhash": "+vcJBYCIh5iIh3ePhkeHcoiIj4f4",
				"source": {{ "mime": "image/png", "width": 1920, "height": 1080, "ratio": "16:9",
					"bytes": 1000 }},
				"variants": {{ "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa": {{ "mime": "image/avif",
					"width": 640, "height": 360, "quality": 0.68, "bytes": 100 }} }} }},
			"{CLIP}": {{ "type": "video", "created": "2026-09-14T02:55:32.15685Z",
				"updated": "2026-09-14T02:55:32.15685Z", "blake3": "{CLIP}",
				"poster": "{POSTER}",
				"source": {{ "mime": "video/mp4", "width": 1920, "height": 1080, "ratio": "16:9",
					"bytes": 5000, "duration": 4.0, "frame_rate": 30.0, "frames": 120,
					"audio": false }},
				"variants": {{ "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb": {{ "mime": "video/mp4",
					"width": 1920, "height": 1080, "bytes": 5000, "codec": "av01.0.05M.08" }} }} }}
			}} }}"#
		)
	}

	/// A repository holding that manifest, one article naming both, and both sidecars.
	fn scenario() -> (tempfile::TempDir, PathBuf) {
		let temporary = temp();
		let root = temporary.path().to_path_buf();
		store::write(&root.join(MERGED), legacy().as_bytes()).expect("manifest");
		std::fs::create_dir_all(root.join("contents")).expect("contents");
		std::fs::write(
			root.join("contents/a.md"),
			format!("![a picture]({PICTURE}.avif)\n\n::video{{src=\"{CLIP}.mp4\"}}\n"),
		)
		.expect("article");
		let metadata = crate::paths::metadata_root(&root);
		for cid in [PICTURE, POSTER, CLIP] {
			store::write(&store::meta_path(&metadata, cid), b"{}").expect("sidecar");
		}
		(temporary, root)
	}

	fn planned(root: &Path) -> Plan {
		plan(root, &root.join("contents")).expect("plan")
	}

	#[test]
	fn grants_every_record_an_id_and_hands_out_none_twice() {
		let (_temporary, root) = scenario();
		let plan = planned(&root);
		assert_eq!(plan.grants.len(), 3);
		let ids: BTreeSet<ResourceId> = plan.grants.iter().map(|grant| grant.resource).collect();
		assert_eq!(ids.len(), 3, "an id was handed out twice");
	}

	#[test]
	fn a_reference_becomes_a_bare_id_with_no_extension() {
		// Which format gets served is the build's decision now. An extension in the source would
		// be an article claiming to know which one, months before the build makes the choice.
		let (_temporary, root) = scenario();
		let plan = planned(&root);
		let picture = plan.grants.iter().find(|grant| grant.key == PICTURE).expect("the picture");
		assert_eq!(plan.rewrites.get(&format!("{PICTURE}.avif")), Some(&picture.resource.to_string()));
		assert!(plan.rewrites.values().all(|value| !value.contains('.')), "{:?}", plan.rewrites);
	}

	#[test]
	fn a_clip_gains_a_cover_and_its_poster_becomes_a_frame() {
		// The two point at each other on purpose: one says what the cover is, the other what this
		// is a frame of, and replacing the cover leaves the old picture a frame of that clip.
		let (_temporary, root) = scenario();
		let plan = planned(&root);
		let clip = &plan.merged.media[CLIP];
		let poster = &plan.merged.media[POSTER];
		assert_eq!(clip.video().expect("a clip").cover, poster.resource);
		assert_eq!(poster.kind(), "frame");
		assert_eq!(poster.layers.frame.as_ref().expect("a frame").source, clip.resource);
		assert_eq!(plan.frames, vec![(poster.resource, clip.resource)]);
	}

	#[test]
	fn the_pictures_that_are_not_posters_are_left_where_they_are() {
		// A wrong leaf is worse than a missing one. Seventeen pictures here have no metadata at
		// all and stay `media.image`; only a picture a clip names becomes a frame.
		let (_temporary, root) = scenario();
		let plan = planned(&root);
		assert_eq!(plan.merged.media[PICTURE].kind(), "screenshot");
		let frames = plan.grants.iter().filter(|grant| grant.kind == "frame").count();
		assert_eq!(frames, 1);
	}

	#[test]
	fn a_sidecar_moves_onto_the_key_the_api_will_ask_for() {
		let (_temporary, root) = scenario();
		let plan = planned(&root);
		assert_eq!(plan.sidecars.len(), 3);
		let metadata = crate::paths::metadata_root(&root);
		apply(&root, &root.join("contents"), &plan).expect("apply");
		for grant in &plan.grants {
			assert!(store::meta_path(&metadata, grant.resource.as_str()).is_file());
			assert!(!store::meta_path(&metadata, &grant.key).exists());
		}
	}

	#[test]
	fn planning_writes_nothing() {
		// The listing is the review and `--live` is the answer to it, exactly as `cms gc` does it.
		let (_temporary, root) = scenario();
		let before = std::fs::read_to_string(root.join(MERGED)).expect("manifest");
		let article = std::fs::read_to_string(root.join("contents/a.md")).expect("article");
		let plan = planned(&root);
		assert!(!plan.is_empty());
		assert_eq!(std::fs::read_to_string(root.join(MERGED)).expect("manifest"), before);
		assert_eq!(std::fs::read_to_string(root.join("contents/a.md")).expect("article"), article);
	}

	#[test]
	fn a_migrated_corpus_is_not_one_to_migrate_again() {
		// Running twice would grant second ids to things that already have one and rewrite every
		// article to name them, which is the same damage as running it once on the wrong corpus.
		let (_temporary, root) = scenario();
		let plan = planned(&root);
		apply(&root, &root.join("contents"), &plan).expect("apply");
		assert!(planned(&root).is_empty());
	}

	#[test]
	fn a_run_that_died_after_the_register_is_finished_by_the_next_one() {
		// The manifest is written first precisely so this works: the ids are on disk, so the
		// second run grants the same ones and does the articles and the records the first never
		// reached. Written last, those ids would have been drawn again and every article the
		// first run touched would name something nothing resolves.
		let (_temporary, root) = scenario();
		let articles = root.join("contents");
		let first = planned(&root);
		let json = serde_json::to_string_pretty(&first.merged).expect("json");
		store::write(&root.join(MERGED), format!("{json}\n").as_bytes()).expect("register only");

		let second = planned(&root);
		assert!(second.grants.is_empty(), "granted an id twice");
		assert!(!second.is_empty(), "nothing left to finish");
		apply(&root, &articles, &second).expect("apply");

		let article = std::fs::read_to_string(articles.join("a.md")).expect("article");
		for grant in &first.grants {
			assert_eq!(second.merged.media[&grant.key].resource, grant.resource);
		}
		assert!(article.contains(first.merged.media[PICTURE].resource.as_str()), "{article}");
		assert!(planned(&root).is_empty());
	}

	#[test]
	fn the_articles_and_the_manifest_are_migrated_together() {
		let (_temporary, root) = scenario();
		let plan = planned(&root);
		let rewritten = apply(&root, &root.join("contents"), &plan).expect("apply");
		assert_eq!(rewritten, 2);

		let article = std::fs::read_to_string(root.join("contents/a.md")).expect("article");
		let merged = crate::image::run::load(&root.join(MERGED)).expect("a migrated manifest");
		for grant in &plan.grants {
			if grant.key == POSTER {
				continue;
			}
			assert!(article.contains(grant.resource.as_str()), "{article}");
		}
		assert!(!article.contains(PICTURE), "{article}");
		assert_eq!(merged.media.len(), 3);
	}

	#[test]
	fn an_article_naming_something_the_manifest_does_not_hold_is_a_refusal() {
		// Skipping it would rewrite the references that resolve and strand the ones that do not,
		// in a corpus where a reference nothing resolves renders as a missing image nobody reports.
		let (_temporary, root) = scenario();
		std::fs::write(root.join("contents/b.md"), "![](ffffffffffffffffffffffffffffffff.avif)\n")
			.expect("article");
		let error = plan(&root, &root.join("contents")).expect_err("a refusal");
		assert!(matches!(error, Error::Stranded(..)), "{error}");
		// And nothing was written on the way to refusing.
		assert!(
			std::fs::read_to_string(root.join(MERGED)).expect("manifest").contains("\"version\": 3")
		);
	}

	#[test]
	fn a_reference_to_something_outside_the_corpus_is_left_alone() {
		// An external picture and a file waiting to be imported are both references this pass has
		// no id for, and neither is a disagreement with the manifest.
		let (_temporary, root) = scenario();
		std::fs::write(
			root.join("contents/b.md"),
			"![](https://example.com/x.png)\n\n![](not-imported-yet.png)\n",
		)
		.expect("article");
		let plan = planned(&root);
		assert!(!plan.rewrites.contains_key("not-imported-yet.png"));
		apply(&root, &root.join("contents"), &plan).expect("apply");
		let article = std::fs::read_to_string(root.join("contents/b.md")).expect("article");
		assert!(article.contains("not-imported-yet.png"), "{article}");
	}

	#[test]
	fn the_committed_manifest_is_one_this_pass_can_read() {
		// The real file, not a fixture. It cannot be regenerated -- the originals live outside git
		// and some are gone -- so the one claim worth making about it is that it reads, whichever
		// side of the migration it is on when this runs.
		let repo = Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
		let unnamed = manifest::read_unnamed(&repo.join(MERGED)).expect("the committed manifest");
		assert!(!unnamed.media.is_empty());
		let migrated = unnamed.media.values().all(Unnamed::is_named);
		let clips = unnamed.media.values().filter(|record| Unnamed::poster(record).is_some()).count();
		assert!(migrated || clips == 3, "{clips} clips name a poster");
	}
}
