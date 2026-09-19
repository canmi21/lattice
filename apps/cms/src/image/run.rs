//! The `cms image` command: what the articles ask for, derived and published.
//!
//! Articles drive this, not the contents of a directory. A reference is either finished --
//! `{cid}.{ext}`, a content id and the format it resolved to -- or it still names a file, in
//! which case that file is looked for under `data/source/image`, derived, published, and the
//! reference rewritten to what it became. Rewriting is what records that the work is done, so
//! the state lives in the article rather than in a log beside it.

use super::manifest::{self, Media, Merged, layer};
use super::{mime_of, store};
use crate::refs::{self, Scan};
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

/// Where the merged manifest is committed, relative to the repository root.
///
/// Inside `data/` because it describes what is there, and tracked anyway because a build
/// resolves every image from it without a byte of `data/` being present. It is the one file
/// under that directory git keeps -- see .gitignore, which says why.
pub const MERGED: &str = "data/record/metadata.json";

#[derive(Debug, Default)]
pub struct Outcome {
	pub processed: usize,
	pub skipped: usize,
	pub rewritten: usize,
	/// Records rewritten because the manifest moved to a newer shape.
	pub migrated: usize,
	pub failed: Vec<(PathBuf, String)>,
	/// References naming a file that is not under `data/source/image`.
	///
	/// Not an error: an article may be written before its picture is dropped in, and stopping
	/// the run would leave every other image unprocessed for the sake of one that is late.
	pub missing: Vec<String>,
}

pub struct Options<'a> {
	pub force: bool,
	pub keep_original: bool,
	/// Files named on the command line. Empty means "whatever the articles ask for".
	pub only: &'a [PathBuf],
}

/// Derive and publish everything the articles reference, then rewrite the references.
pub fn run(
	repo: &Path,
	originals: &Path,
	public: &Path,
	articles: &Path,
	options: &Options<'_>,
) -> std::io::Result<Outcome> {
	let metadata = &crate::paths::metadata_root(repo);
	let merged_path = repo.join(MERGED);
	let mut merged = load(&merged_path)?;
	let mut outcome = Outcome::default();
	let scan = refs::scan(articles)?;
	// Opened once for the whole run, and absent when the data has not been fetched -- which
	// reads the same as a photograph carrying no position.
	let gazetteer = super::geo::Gazetteer::open(repo);

	// Records published under an older shape are rewritten from the merged manifest, which
	// already holds everything they contain. Re-deriving to fix a version number would spend
	// minutes of CPU to produce identical pixels.
	for cid in manifest::migrate(&mut merged, metadata) {
		if let Some(media) = merged.media.get(&cid) {
			republish(metadata, &cid, media)?;
			outcome.migrated += 1;
		}
	}

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

		let id = super::cid(&bytes);
		let previous = merged.media.get(&id);
		let picture = previous.and_then(Media::image);
		let keep = options.keep_original || picture.is_some_and(keeps_full_frame);

		if !options.force && previous.is_some() && published(public, picture) {
			outcome.skipped += 1;
			if let Some(target) = reference.as_deref() {
				note(&mut rewrites, target, &id, previous);
			}
			continue;
		}

		match super::publish(
			&bytes,
			mime_of(&path),
			public,
			metadata,
			previous,
			keep,
			gazetteer.as_ref(),
		) {
			Ok(media) => {
				if let Some(target) = reference.as_deref() {
					note(&mut rewrites, target, &id, Some(&media));
				}
				merged.media.insert(id, media);
				outcome.processed += 1;
			}
			Err(error) => outcome.failed.push((path, error.to_string())),
		}
	}

	// A finished reference can still name the wrong format: an article written when the
	// pipeline stored PNG, or an asset re-derived into something else since. The extension is
	// a claim about what the CDN will serve, so it is corrected from the manifest without
	// deriving anything.
	for image in &scan.images {
		let Some((cid, _)) = image.resolved() else {
			continue;
		};
		if let Some(name) =
			merged.media.get(cid).and_then(Media::image).and_then(|picture| resolved_name(cid, picture))
			&& name != image.value
		{
			rewrites.insert(image.value.clone(), name);
		}
	}

	merged.updated = manifest::now();
	let json = serde_json::to_string_pretty(&merged)
		.map_err(|error| std::io::Error::other(error.to_string()))?;
	store::write(&merged_path, format!("{json}\n").as_bytes())?;

	// Bytes and manifest land first because a crash after publishing can only leave a derived
	// image no article references yet; that is harmless and a rerun repairs it. Rewriting first
	// could crash before the bytes land, leaving an article pointing at something nonexistent,
	// and the lost original filename would leave a later run no way to repair it. See spec/tasks.md.
	outcome.rewritten = rewrite_references(articles, &rewrites)?;
	Ok(outcome)
}

/// Every original to look at this run, paired with the reference that asked for it.
///
/// Files named on the command line have no reference to rewrite -- they are being imported
/// ahead of the article that will use them, and `--original` is how that is declared.
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

	for image in scan.unresolved() {
		let candidate = originals.join(&image.value);
		if candidate.is_file() {
			found.push((Some(image.value.clone()), candidate));
		} else {
			outcome.missing.push(image.value.clone());
		}
	}

	// A finished reference whose variants are gone -- swept, or never published on this
	// machine. The original is found by hashing, because the id is the hash.
	//
	// A cid the manifest already knows to be a clip is left out rather than reported missing.
	// Its rungs are under `video/` and its original is not in `data/source/image`, so asking this
	// command about it would answer "not derived yet" on every run, for ever.
	let unpublished: Vec<String> = scan
		.cids()
		.into_iter()
		.filter(|cid| !merged.media.get(cid).is_some_and(|media| media.video().is_some()))
		.filter(|cid| !published(public, merged.media.get(cid).and_then(Media::image)))
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

/// Content id of every original on hand, so a swept asset can be rebuilt from its id alone.
fn originals_by_id(originals: &Path) -> BTreeMap<String, PathBuf> {
	sources(originals)
		.unwrap_or_default()
		.into_iter()
		.filter_map(|path| {
			let bytes = std::fs::read(&path).ok()?;
			Some((super::cid(&bytes), path))
		})
		.collect()
}

/// Whether a published record was derived with the full frame kept, inferred from the rungs
/// rather than read off the record: a rung at exactly the source's long edge can only exist if
/// the full frame was kept, and below the cap the top rung is the source either way. Measured
/// on the long edge, per `Size::long_edge`, or a tall image loses an already-published rung.
///
/// FIXME: spec/architecture/media.md says this belongs on the record, not inferred -- deferred
/// until the desktop app derives on insert, leaving no original -- then a metadata migration.
fn keeps_full_frame(image: &layer::Image) -> bool {
	let source = super::ladder::Size::new(image.dimension.width, image.dimension.height);
	// A vector reports no pixels, so no variant of one can match a long edge. That is the right
	// answer rather than a gap: there is no full frame to keep when every size is the same file.
	image.variants.iter().filter_map(|variant| variant.resolution.as_ref()).any(|pixels| {
		super::ladder::Size::new(pixels.width, pixels.height).long_edge() == source.long_edge()
	}) && source.long_edge() > super::ladder::CAP
}

/// Whether every variant a picture claims is actually on disk.
///
/// The manifest alone is not evidence: after a sweep it still lists assets whose bytes are
/// gone, and trusting it would leave articles pointing at nothing.
///
/// A picture rather than a record, because this decides whether to re-derive and this command
/// only derives pictures. A clip's rungs are asked about by `cms video`, against `video/`.
fn published(public: &Path, image: Option<&layer::Image>) -> bool {
	let Some(image) = image else {
		return false;
	};
	image.variants.iter().all(|variant| {
		let extension = crate::extension::for_variant(&variant.mime);
		store::variant_path(public, &variant.content, extension).is_file()
	})
}

/// What an article should call this asset: its content id and the format it resolved to.
///
/// The largest variant decides the extension. It is the one an article without a srcset falls
/// back to, and every rung of a ladder shares its format.
/// A picture rather than a record: `extension::for_variant` answers AVIF for anything it does
/// not know, so handing it a clip's `video/mp4` would rewrite an article to name a file that
/// was never written. Rewriting a video reference belongs to the command that publishes one.
fn resolved_name(cid: &str, image: &layer::Image) -> Option<String> {
	let extension = image
		.variants
		.iter()
		.max_by_key(|variant| variant.resolution.as_ref().map_or(0, |pixels| pixels.width))
		.map(|variant| crate::extension::for_variant(&variant.mime))?;
	Some(format!("{cid}.{extension}"))
}

fn note(
	rewrites: &mut BTreeMap<String, String>,
	reference: &str,
	cid: &str,
	media: Option<&Media>,
) {
	if let Some(name) = media.and_then(Media::image).and_then(|image| resolved_name(cid, image)) {
		rewrites.insert(reference.to_owned(), name);
	}
}

/// Write one asset's record again from what the merged manifest already says.
///
/// Used by the migration and by `cms alt`, both of which change a record without touching a
/// single pixel. Re-deriving to publish a changed field would spend minutes producing bytes
/// that are already correct.
pub fn republish(metadata: &Path, cid: &str, media: &Media) -> std::io::Result<()> {
	// Minified, for the reason `image::write_derived` gives. The record is the document now --
	// its envelope carries the version an outer wrapper used to hold twice.
	let json =
		serde_json::to_string(media).map_err(|error| std::io::Error::other(error.to_string()))?;
	store::write(&store::meta_path(metadata, cid), json.as_bytes())
}

/// The merged manifest, fresh and empty when the repository has none yet.
///
/// `data/record/metadata.json` is committed and a whole site build resolves its images out of it.
/// A parse failure is an error rather than an empty manifest. See spec/architecture/data.md,
/// "A broken sidecar is an error, never an empty one".
pub fn load(path: &Path) -> std::io::Result<Merged> {
	let text = match std::fs::read_to_string(path) {
		Ok(text) => text,
		Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
			return Ok(Merged {
				version: manifest::VERSION,
				created: manifest::now(),
				updated: manifest::now(),
				media: BTreeMap::new(),
			});
		}
		Err(error) => return Err(error),
	};
	serde_json::from_str(&text)
		.map_err(|error| std::io::Error::new(std::io::ErrorKind::InvalidData, error.to_string()))
}

fn sources(directory: &Path) -> std::io::Result<Vec<PathBuf>> {
	if !directory.is_dir() {
		return Ok(Vec::new());
	}
	let mut found: Vec<PathBuf> = std::fs::read_dir(directory)?
		.filter_map(Result::ok)
		.map(|entry| entry.path())
		.filter(|path| path.is_file() && !is_hidden(path))
		.collect();
	// Sorted so a run over the same directory reports in the same order twice, which is what
	// makes a failure reproducible.
	found.sort();
	Ok(found)
}

fn is_hidden(path: &Path) -> bool {
	path.file_name().and_then(|name| name.to_str()).is_some_and(|name| name.starts_with('.'))
}

/// Point every rewritten reference at what it became.
///
/// Returns how many references changed. Whole-value matching, not substring: a filename like
/// `a.png` occurs inside plenty of prose, and replacing it there would corrupt the text.
pub fn rewrite_references(
	articles: &Path,
	rewrites: &BTreeMap<String, String>,
) -> std::io::Result<usize> {
	if rewrites.is_empty() {
		return Ok(0);
	}
	let mut changed = 0;
	for path in refs::markdown_under(articles)? {
		let original = std::fs::read_to_string(&path)?;
		let mut text = original.clone();
		for (old, new) in rewrites {
			if old == new {
				continue;
			}
			for (from, to) in [
				(format!("]({old})"), format!("]({new})")),
				(format!("src=\"{old}\""), format!("src=\"{new}\"")),
			] {
				changed += text.matches(&from).count();
				text = text.replace(&from, &to);
			}
		}
		if text != original {
			std::fs::write(&path, text)?;
		}
	}
	Ok(changed)
}

#[cfg(test)]
mod tests {
	use super::*;

	/// A directory that removes itself, however the test ends.
	///
	/// `TempDir` deletes on drop, which the hand-rolled predecessor could not: a panicking test
	/// left its directory behind, and the name carried the process id because two tests choosing
	/// the same one would otherwise share a directory. Both problems belonged to the workaround.
	fn temp() -> tempfile::TempDir {
		tempfile::tempdir().expect("temp")
	}

	#[test]
	fn a_broken_manifest_is_an_error_rather_than_an_empty_one() {
		// Every writer loads the whole document, edits a few entries and saves it back. Read as
		// empty, the next save replaces a committed manifest -- and the paid descriptions in it
		// -- with four fields. See spec/architecture/data.md.
		let temporary = temp();
		let root = temporary.path();
		let path = root.join("metadata.json");
		std::fs::write(&path, "{ not json").expect("write");
		let error = load(&path).expect_err("a broken manifest must not read as empty");
		assert_eq!(error.kind(), std::io::ErrorKind::InvalidData);
	}

	#[test]
	fn a_missing_manifest_is_a_fresh_repository() {
		let temporary = temp();
		let root = temporary.path();
		let merged = load(&root.join("metadata.json")).expect("missing is not an error");
		assert!(merged.media.is_empty());
	}

	#[test]
	fn reads_mime_from_the_extension() {
		assert_eq!(mime_of(Path::new("a.PNG")), "image/png");
		assert_eq!(mime_of(Path::new("a.jpeg")), "image/jpeg");
		assert_eq!(mime_of(Path::new("a.unknown")), "application/octet-stream");
	}

	#[test]
	fn ignores_hidden_files() {
		let temporary = temp();
		let root = temporary.path();
		std::fs::write(root.join(".DS_Store"), b"x").expect("write");
		std::fs::write(root.join("real.png"), b"x").expect("write");
		let found = sources(&root).expect("sources");
		assert_eq!(found.len(), 1);
		std::fs::remove_dir_all(&root).ok();
	}

	#[test]
	fn a_missing_directory_is_empty_rather_than_an_error() {
		assert!(sources(Path::new("/nowhere-at-all")).expect("sources").is_empty());
	}

	#[test]
	fn rewrites_references_across_nested_articles() {
		let temporary = temp();
		let root = temporary.path();
		std::fs::create_dir_all(root.join("deep")).expect("dir");
		std::fs::write(root.join("a.md"), "![](shot.png) and ![](shot.png)").expect("write");
		std::fs::write(root.join("deep/b.md"), r#"::linkcard{src="shot.png" url="https://a.example"}"#)
			.expect("write");

		let mut rewrites = BTreeMap::new();
		rewrites.insert("shot.png".to_owned(), "newcid.avif".to_owned());
		let changed = rewrite_references(&root, &rewrites).expect("rewrite");

		assert_eq!(changed, 3);
		assert!(std::fs::read_to_string(root.join("a.md")).unwrap().contains("](newcid.avif)"));
		assert!(
			std::fs::read_to_string(root.join("deep/b.md")).unwrap().contains(r#"src="newcid.avif""#)
		);
		std::fs::remove_dir_all(&root).ok();
	}

	#[test]
	fn leaves_prose_alone_that_merely_mentions_a_filename() {
		// "shot.png" is a perfectly ordinary thing to write in a sentence. A substring replace
		// would silently edit the text of the article.
		let temporary = temp();
		let root = temporary.path();
		std::fs::write(root.join("a.md"), "I saved it as shot.png last week.").expect("write");
		let mut rewrites = BTreeMap::new();
		rewrites.insert("shot.png".to_owned(), "newcid.avif".to_owned());

		assert_eq!(rewrite_references(&root, &rewrites).expect("rewrite"), 0);
		assert!(std::fs::read_to_string(root.join("a.md")).unwrap().contains("shot.png"));
		std::fs::remove_dir_all(&root).ok();
	}

	#[test]
	fn leaves_an_article_alone_when_nothing_matches() {
		let temporary = temp();
		let root = temporary.path();
		std::fs::write(root.join("a.md"), "no images here").expect("write");
		let mut rewrites = BTreeMap::new();
		rewrites.insert("shot.png".to_owned(), "newcid.avif".to_owned());
		assert_eq!(rewrite_references(&root, &rewrites).expect("rewrite"), 0);
		std::fs::remove_dir_all(&root).ok();
	}

	/// A picture whose published rungs are `sizes`, derived from a `width` x `height` source.
	fn derived(width: u32, height: u32, sizes: &[(u32, u32)]) -> layer::Image {
		let rungs: Vec<(String, u32, u32)> = sizes
			.iter()
			.enumerate()
			.map(|(index, (w, h))| (format!("r{index}"), *w, *h))
			.collect();
		let variants: Vec<(&str, u32, u32)> =
			rungs.iter().map(|(cid, w, h)| (cid.as_str(), *w, *h)).collect();
		let media = manifest::fixture::picture("source", (width, height), &variants);
		media.image().expect("a picture").clone()
	}

	#[test]
	fn a_tall_image_keeps_the_full_frame_it_published() {
		// 1000x2400 with --original: the ladder caps at 1920 on the long edge, so the full frame
		// is a rung of its own. Re-deriving used to ask whether the *width* cleared the cap --
		// 1000 does not -- and dropped a variant that was already published. See ladder::Size.
		let tall = derived(1000, 2400, &[(267, 640), (533, 1280), (800, 1920), (1000, 2400)]);
		assert!(keeps_full_frame(&tall));
	}

	#[test]
	fn a_wide_image_keeps_the_full_frame_it_published() {
		let wide = derived(2400, 1000, &[(640, 267), (1280, 533), (1920, 800), (2400, 1000)]);
		assert!(keeps_full_frame(&wide));
	}

	#[test]
	fn a_tall_image_derived_without_the_full_frame_does_not_gain_one() {
		let tall = derived(1000, 2400, &[(267, 640), (533, 1280), (800, 1920)]);
		assert!(!keeps_full_frame(&tall));
	}

	#[test]
	fn an_image_under_the_cap_has_no_separate_full_frame_to_keep() {
		// The top rung is the source, so there is nothing --original could have added and
		// nothing to infer from the top rung matching it.
		let small = derived(800, 1200, &[(427, 640), (800, 1200)]);
		assert!(!keeps_full_frame(&small));
	}

	#[test]
	fn the_largest_variant_decides_the_extension() {
		// The format of the biggest rung, not of the first one read: an article without a srcset
		// falls back to that file, so naming it by any other rung's extension names a 404.
		let mut picture = derived(1920, 1080, &[(640, 360), (1920, 1080)]);
		picture.variants[1].mime = "image/png".into();

		assert_eq!(
			resolved_name("44b6081deaf0242ca3bf83d62a3b6c95", &picture).as_deref(),
			Some("44b6081deaf0242ca3bf83d62a3b6c95.png")
		)
	}

	#[test]
	fn a_clip_is_not_a_reference_this_command_can_answer_for() {
		// `extension::for_variant` answers AVIF for anything it does not recognise, so a clip
		// reaching `resolved_name` would rewrite an article to name a `.avif` nobody wrote. The
		// accessor is where it stops, and the record's kind is the only thing that knows.
		let clip = manifest::fixture::clip("aa11", "bb22", &[], &[]);
		assert!(clip.image().is_none());
		let mut rewrites = BTreeMap::new();
		note(&mut rewrites, "clip.mp4", "aa11", Some(&clip));
		assert!(rewrites.is_empty());
	}

	#[test]
	fn a_stale_sidecar_is_republished_when_the_aggregate_is_current() {
		let temporary = temp();
		let root = temporary.path();
		let public = root.join("public");
		let metadata = crate::paths::metadata_root(root);
		let articles = root.join("contents");
		std::fs::create_dir_all(root.join(MERGED).parent().expect("record dir"))
			.expect("record directory");
		std::fs::create_dir_all(&articles).expect("articles");

		let cid = "44b6081deaf0242ca3bf83d62a3b6c95";
		let media = manifest::fixture::picture(cid, (1, 1), &[]);
		let merged = Merged {
			version: manifest::VERSION,
			created: "2026-07-31T00:00:00Z".into(),
			updated: "2026-07-31T00:00:00Z".into(),
			media: BTreeMap::from([(cid.to_owned(), media.clone())]),
		};
		store::write(
			&root.join(MERGED),
			serde_json::to_string_pretty(&merged).expect("merged").as_bytes(),
		)
		.expect("write merged");
		// A record in the shape version 2 published, which is what makes the sidecar stale. The
		// published document is the record itself now, so the version it carries is the envelope's.
		let mut stale = serde_json::to_value(media.clone()).expect("stale document");
		stale["version"] = 2.into();
		stale["preview"] = "obsolete".into();
		store::write(
			&store::meta_path(&metadata, cid),
			serde_json::to_string_pretty(&stale).expect("stale json").as_bytes(),
		)
		.expect("write stale sidecar");

		let outcome = run(
			&root,
			&root.join("data/source/image"),
			&public,
			&articles,
			&Options { force: false, keep_original: false, only: &[] },
		)
		.expect("run");

		// The old aggregate gate returned before seeing this v2 file because the aggregate was
		// already v3. The repair comes entirely from merged metadata: no original or variant
		// directory exists for a pixel pipeline to read or write.
		assert_eq!(outcome.migrated, 1);
		assert_eq!(outcome.processed, 0);
		let rewritten = std::fs::read_to_string(store::meta_path(&metadata, cid)).expect("sidecar");
		let document: manifest::Media = serde_json::from_str(&rewritten).expect("document");
		assert_eq!(document.version, manifest::VERSION);
		assert_eq!(document, media);
		assert!(!rewritten.contains("preview"));
		// The fixture above was written pretty on purpose: a published record is minified whatever
		// the one it replaced looked like, because `GET /media` serves these bytes verbatim.
		assert!(!rewritten.contains('\n'));
		assert!(!public.join("image").exists());
		std::fs::remove_dir_all(&root).ok();
	}

	#[test]
	fn the_committed_manifest_still_loads_whatever_shape_it_is_written_in() {
		// The real file, not a fixture. It is version 3 on disk and cannot be regenerated -- the
		// originals live outside git and some are gone -- so converting rather than refusing is
		// the whole reason the legacy shape is kept, and a fixture cannot make that claim.
		let path = Path::new(env!("CARGO_MANIFEST_DIR")).join("../..").join(MERGED);
		let merged = load(&path).expect("the committed manifest");
		assert!(!merged.media.is_empty());
		assert!(merged.media.values().any(|media| media.video().is_some()));
		assert!(merged.media.values().all(|media| media.validate().is_ok()));
	}
}

