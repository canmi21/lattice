use super::*;
use crate::image::manifest::{Media, Merged, fixture};
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

fn media(resource: &str, variant: &str) -> Media {
	fixture::picture(resource, "", (640, 360), &[(variant, 640, 360)])
}

/// A repository with one referenced asset and one abandoned one.
///
/// The article names the kept asset by its rid, which is what an article says since the
/// migration. The guard comes back with the paths: it owns the directory, so dropping it here
/// would delete everything the caller is about to look at.
fn scenario() -> (tempfile::TempDir, PathBuf, String, String) {
	let temporary = temp();
	let root = temporary.path().to_path_buf();
	let kept = "44b6081deaf0242ca3bf83d62a3b6c95".to_owned();
	let dropped = "12faaa76365814de1195d6bdf1e5ba05".to_owned();
	let kept_variant = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa".to_owned();
	let dropped_variant = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb".to_owned();

	std::fs::create_dir_all(root.join("contents")).expect("dir");
	std::fs::write(root.join("contents/a.md"), "![](k0001)").expect("write");

	let mut assets = BTreeMap::new();
	assets.insert(kept.clone(), media("k0001", &kept_variant));
	assets.insert(dropped.clone(), media("k0002", &dropped_variant));
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

	// Bytes in the objects tree, records in the other one and keyed by the rid the manifest
	// entry carries. See spec/architecture/data.md, "One bucket holds records and the other
	// holds bytes".
	let public = root.join("public");
	let metadata = root.join("metadata");
	for (variant, resource) in [(&kept_variant, "k0001"), (&dropped_variant, "k0002")] {
		let object = crate::image::store::variant_path(&public, variant, "avif");
		crate::image::store::write(&object, b"bytes").expect("write");
		let record = crate::image::store::meta_path(&metadata, resource);
		crate::image::store::write(&record, b"{}").expect("write");
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
fn a_clip_keeps_its_rungs_its_tracks_and_the_cover_nothing_else_names() {
	// The cover is the whole fallback for a device that cannot decode AV1, and no article ever
	// names it -- only the clip's record does. Sweeping by references alone takes it on the
	// first run, and takes its own variants and record with it.
	//
	// It is reached by following `cover`, a rid. The hop used to go through `video.poster`, a
	// cid, and the moment that field was replaced the hop resolved nothing and this sweep
	// would have offered three published pictures for deletion an hour later.

	let temporary = temp();
	let root = temporary.path().to_path_buf();
	let clip = "44b6081deaf0242ca3bf83d62a3b6c95".to_owned();
	let poster = "12faaa76365814de1195d6bdf1e5ba05".to_owned();
	let rung = "cccccccccccccccccccccccccccccccc".to_owned();
	let track = "dddddddddddddddddddddddddddddddd".to_owned();
	let poster_variant = "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee".to_owned();

	std::fs::create_dir_all(root.join("contents")).expect("dir");
	std::fs::write(root.join("contents/a.md"), "::video{src=\"c0001\"}").expect("write");

	let mut assets = BTreeMap::new();
	assets.insert(poster.clone(), media("f0001", &poster_variant));
	assets.insert(clip.clone(), fixture::clip("c0001", &clip, "f0001", &[&rung], &[&track]));
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
	let metadata = root.join("metadata");
	store::write(&store::video_path(&public, &rung), b"bytes").expect("rung");
	store::write(&store::caption_path(&public, &track), b"WEBVTT").expect("track");
	store::write(&store::variant_path(&public, &poster_variant, "avif"), b"bytes")
		.expect("poster variant");
	let orphan = "ffffffffffffffffffffffffffffffff";
	store::write(&store::variant_path(&public, orphan, "avif"), b"x").expect("orphan");
	// The clip's record and its cover's, in the metadata tree and keyed by rid. Neither is in
	// the space this sweep walks, which is what keeps a record from being read as an orphan.
	for resource in ["c0001", "f0001"] {
		store::write(&store::meta_path(&metadata, resource), b"{}").expect("record");
	}

	let sweep = swept(&root, &public, &metadata, &root.join("contents"));
	let names: Vec<String> = sweep.orphans.iter().map(|path| stem_of(path)).collect();
	assert!(!names.contains(&rung), "swept a live rung");
	assert!(!names.contains(&track), "swept a live caption");
	assert!(!names.contains(&poster), "swept the cover's id");
	assert!(!names.contains(&poster_variant), "swept the cover's own variant");
	assert_eq!(names, vec!["ffffffffffffffffffffffffffffffff"]);
	// The cover is reachable only through the clip, so its manifest entry has to survive
	// the same hop its bytes did.
	assert!(sweep.entries.is_empty(), "{:?}", sweep.entries);
	std::fs::remove_dir_all(&root).ok();
}

#[test]
fn keeps_a_font_chunk_the_published_record_names() {
	// A chunk is reached from no article, no manifest and no root, so the font pipeline's
	// record is the whole of what keeps it. Without that keep-set every published chunk is
	// offered for deletion an hour later -- and the faces with no retained input cannot be
	// sliced again, so those bytes would be gone for good.
	let temporary = temp();
	let root = temporary.path().to_path_buf();
	std::fs::create_dir_all(root.join("contents")).expect("dir");

	let public = root.join("public");
	let named = "ab".repeat(16);
	let superseded = "cd".repeat(16);
	for cid in [&named, &superseded] {
		let path = crate::image::store::variant_path(&public, cid, "woff2");
		crate::image::store::write(&path, b"woff2").expect("write");
	}
	let record = Fonts {
		version: FONTS_VERSION,
		families: BTreeMap::from([("mono".to_owned(), vec![named.clone()])]),
	};
	crate::image::store::write(
		&fonts_path(&root),
		serde_json::to_string(&record).expect("json").as_bytes(),
	)
	.expect("record");

	let sweep = swept(&root, &public, &root.join("metadata"), &root.join("contents"));
	let names: Vec<String> = sweep.orphans.iter().map(|path| stem_of(path)).collect();
	assert!(!names.contains(&named), "swept a chunk the record names");
	// The other one is what a re-slice leaves behind, and it is garbage for exactly the
	// reason the first is not: the record stopped naming it.
	assert_eq!(names, vec![superseded]);
	std::fs::remove_dir_all(&root).ok();
}

#[test]
fn refuses_to_sweep_published_chunks_with_no_record_of_them() {
	// `data/build/` is not in git, so a checkout that has never run the font pipeline has no
	// record -- and reading that as "nothing is named" is how every chunk in the bucket ends
	// up in one report as garbage. Absent with nothing published is still an empty set.
	let temporary = temp();
	let root = temporary.path().to_path_buf();
	std::fs::create_dir_all(root.join("contents")).expect("dir");
	let public = root.join("public");

	let metadata = root.join("metadata");
	let contents = root.join("contents");
	assert!(plan(&root, &public, &metadata, &contents).is_ok());

	let path = crate::image::store::variant_path(&public, &"ab".repeat(16), "woff2");
	crate::image::store::write(&path, b"woff2").expect("write");
	let refused = plan(&root, &public, &metadata, &contents);
	assert!(refused.is_err(), "swept font chunks with no record of them");
	std::fs::remove_dir_all(&root).ok();
}

#[test]
fn refuses_a_directory_at_the_objects_root_that_is_not_a_fan_out_segment() {
	// Everything in the objects tree is content-addressed, so a named prefix beside the
	// segments is the tree in a shape this does not understand. Stepping over it would mean
	// nothing ever sweeps what is inside, for ever -- and a collector that cannot account for
	// the whole tree must not go on to delete part of it.
	let temporary = temp();
	let root = temporary.path().to_path_buf();
	std::fs::create_dir_all(root.join("contents")).expect("dir");

	let public = root.join("public");
	let metadata = root.join("metadata");
	let contents = root.join("contents");
	let body = "ab".repeat(16);
	crate::image::store::write(&crate::image::store::variant_path(&public, &body, "json"), b"{}")
		.expect("write");
	assert!(
		plan(&root, &public, &metadata, &contents).is_ok(),
		"a tree of nothing but fan-out was refused"
	);

	// Files beside the segments are not directories and never reach the name test, which is
	// what keeps a `.DS_Store` in a mirrored bucket from failing every run.
	std::fs::write(public.join(".DS_Store"), b"finder").expect("write");
	std::fs::write(public.join(".gitkeep"), b"").expect("write");
	assert!(plan(&root, &public, &metadata, &contents).is_ok(), "a stray file refused a run");

	std::fs::create_dir_all(public.join("license")).expect("dir");
	std::fs::write(public.join("license/full.txt"), b"notice").expect("write");
	let refused = plan(&root, &public, &metadata, &contents).expect_err("swept past `license`");
	let said = refused.to_string();
	assert!(said.contains("license"), "the error does not name the directory: {said}");
	assert!(said.contains("fan-out segment"), "the error does not say what is wrong: {said}");
	std::fs::remove_dir_all(&root).ok();
}

#[test]
fn sweeps_a_body_the_published_root_does_not_name() {
	// There was a second root naming the drafts, and this asserted the opposite: that a body
	// only it named survived. Nothing compiles a draft into this tree now, so a body the one
	// root does not name is an orphan -- which is what the sweep is for. See spec/drafts.md.
	let temporary = temp();
	let root = temporary.path().to_path_buf();
	std::fs::create_dir_all(root.join("contents")).expect("dir");

	let public = root.join("public");
	let body = "ab".repeat(16);
	crate::image::store::write(&crate::image::store::variant_path(&public, &body, "json"), b"{}")
		.expect("write");

	let sweep = swept(&root, &public, &root.join("metadata"), &root.join("contents"));
	let names: Vec<String> = sweep.orphans.iter().map(|path| stem_of(path)).collect();
	assert!(names.contains(&body), "kept a body no root names");
	std::fs::remove_dir_all(&root).ok();
}

#[test]
fn sweeps_a_card_no_page_asks_for_any_more() {
	// A card is content-addressed like everything else, so what keeps it alive is `local og`'s
	// record -- and only for a key the live set still wants. A card for a draft, or one whose
	// page is gone, is bytes nothing reaches.
	let temporary = temp();
	let root = temporary.path().to_path_buf();
	std::fs::create_dir_all(root.join("contents")).expect("dir");
	std::fs::write(root.join("contents/kept.md"), "---\ntitle: Kept\n---\n\nbody\n").expect("write");
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

/// The icon's own bytes, kept because a link card links to that site and for no other reason.
///
/// **No article names an icon's rid**: the compiler turns a link card's hostname into one, so
/// the only path from the corpus to these objects is the domain. They were kept alive by the
/// published root's asset map until they became resources, and an hour after that stopped
/// being true this would have offered every icon in the corpus for deletion.
#[test]
fn keeps_the_files_of_an_icon_a_link_card_links_to() {
	let temporary = temp();
	let root = temporary.path();
	std::fs::create_dir_all(root.join("contents")).expect("dir");
	std::fs::write(root.join("contents/a.md"), r#"::linkcard{url="https://kept.example/x"}"#)
		.expect("write");

	let kept_light = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
	let kept_dark = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
	let unlinked = "cccccccccccccccccccccccccccccccc";
	let merged = Merged {
		version: 1,
		created: "2026-07-31T00:00:00Z".into(),
		updated: "2026-07-31T00:00:00Z".into(),
		media: BTreeMap::from([
			(
				"k0001".to_owned(),
				crate::image::manifest::fixture::icon(
					"k0001",
					"kept.example",
					Some(kept_light),
					Some(kept_dark),
				),
			),
			(
				"k0002".to_owned(),
				crate::image::manifest::fixture::icon("k0002", "gone.example", Some(unlinked), None),
			),
		]),
	};
	crate::image::store::write(
		&root.join(MERGED),
		serde_json::to_string(&merged).expect("json").as_bytes(),
	)
	.expect("write");

	let public = root.join("public");
	for content in [kept_light, kept_dark, unlinked] {
		crate::image::store::write(
			&crate::image::store::variant_path(&public, content, "png"),
			b"bytes",
		)
		.expect("write");
	}

	let sweep = swept(&root, &public, &root.join("metadata"), &root.join("contents"));
	let names: Vec<String> = sweep.orphans.iter().map(|path| stem_of(path)).collect();
	assert!(!names.contains(&kept_light.to_owned()), "collected a linked icon: {names:?}");
	assert!(!names.contains(&kept_dark.to_owned()), "collected a linked icon: {names:?}");
	// The site nothing links to any more is still collected, which is what says the reach
	// above is the domain rather than a blanket exemption for icons.
	assert!(names.contains(&unlinked.to_owned()), "kept an icon nothing links to: {names:?}");
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
