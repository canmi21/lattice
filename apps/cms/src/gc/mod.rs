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
use crate::refs;
use std::collections::BTreeSet;
use std::path::{Path, PathBuf};

#[derive(Debug, Default)]
pub struct Sweep {
	/// Files no reachable asset claims.
	pub orphans: Vec<PathBuf>,
	/// Manifest entries for assets no article references any more.
	pub entries: Vec<String>,
	pub bytes: u64,
}

/// Everything in `data/public` that nothing reachable from an article accounts for.
pub fn plan(repo: &Path, public: &Path, articles: &Path) -> std::io::Result<Sweep> {
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

	// A poster's entry stays in the manifest for the same reason its bytes stay on disk: the
	// clip's record points at it, and a record naming an entry that is gone is the one failure
	// this sweep must not create.
	let mut sweep = Sweep {
		entries: merged
			.media
			.keys()
			.filter(|cid| !wanted.contains(*cid) && !keep.contains(*cid))
			.cloned()
			.collect(),
		..Sweep::default()
	};

	// Every tree that holds content-addressed bytes, and the list has to stay complete. `video/`
	// and `captions/` were not walked before this, which is the quietest way for a store to leak:
	// a tree nothing sweeps has no orphans by definition, so it reports clean while it grows, and
	// nobody looks until it is large. A fourth prefix in `store` is a fifth line here.
	for path in files_under(&public.join("image"))?
		.into_iter()
		.chain(files_under(&public.join("video"))?)
		.chain(files_under(&public.join("captions"))?)
		.chain(files_under(&public.join("meta"))?)
	{
		if !keep.contains(&stem_of(&path)) {
			sweep.bytes += path.metadata().map(|meta| meta.len()).unwrap_or_default();
			sweep.orphans.push(path);
		}
	}

	// Icons are swept by domain rather than by content: the directory existing is the record
	// that the domain was checked, so removing one file inside it would claim the site was
	// asked and had no icon.
	let wanted_domains: BTreeSet<String> =
		scan.wanted().into_iter().map(|icon| icon.domain).collect();
	for directory in directories_under(&public.join("favicon"))? {
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

	// Licence texts are reachable from the dependency record rather than from an article, so
	// they are swept against that instead. Without this the whole directory reads as garbage,
	// because no article will ever name a licence.
	//
	// `full.txt` is named rather than content addressed and is rewritten on every run, so it
	// is kept unconditionally -- there is no id for it to fall out of.
	let record: licenses::Record = std::fs::read(licenses::record_path(repo))
		.ok()
		.and_then(|bytes| serde_json::from_slice(&bytes).ok())
		.unwrap_or_default();
	let live = licenses::referenced(&record);
	for path in files_under(&public.join("license"))? {
		if path.file_name().is_some_and(|name| name == "full.txt") {
			continue;
		}
		if !live.contains(&stem_of(&path)) {
			sweep.bytes += path.metadata().map(|meta| meta.len()).unwrap_or_default();
			sweep.orphans.push(path);
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
		// at `data/metadata.json` now, so a bare write lands in a directory that is not there.
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
		let sweep = plan(&root, &root.join("public"), &root.join("contents")).expect("plan");

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
		let sweep = plan(&root, &root.join("public"), &root.join("contents")).expect("plan");
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
		let sweep = plan(&root, &root.join("public"), &root.join("contents")).expect("plan");
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

		let sweep = plan(&root, &public, &root.join("contents")).expect("plan");
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
	fn sweeps_an_icon_directory_no_article_links_to() {
		let temporary = temp();
		let root = temporary.path();
		std::fs::create_dir_all(root.join("contents")).expect("dir");
		std::fs::write(root.join("contents/a.md"), r#"::linkcard{url="https://kept.example"}"#)
			.expect("write");

		let public = root.join("public");
		for domain in ["kept.example", "gone.example"] {
			let directory = public.join("favicon").join(domain);
			std::fs::create_dir_all(&directory).expect("dir");
			std::fs::write(directory.join("light.png"), b"icon").expect("write");
		}

		let sweep = plan(&root, &public, &root.join("contents")).expect("plan");
		assert_eq!(sweep.orphans.len(), 1);
		assert!(sweep.orphans[0].ends_with("gone.example"));
		std::fs::remove_dir_all(&root).ok();
	}
}
