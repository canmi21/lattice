//! Turning the icons collected for one domain into the resource they are.
//!
//! The fetch writes files under `data/source/favicon/<domain>/`; this reads them back and says
//! what they are -- one resource per domain, with the tones as files inside it. Splitting the two
//! is what lets a domain whose icons were collected before rids existed gain one without being
//! re-fetched from a site that may have redrawn its mark since.
//!
//! **The record is the only thing that can name these bytes now.** They used to reach a reader
//! through an entry in the published root, which is why the address carried the domain; a link
//! card compiles to a rid instead, and what a rid means is this. See
//! spec/architecture/resource.md, "A rid is resolved three times, and each stage bakes only what
//! it can know".

use crate::extension;
use crate::image::manifest::{
	self, Dimension, ImageVariant, Media, Merged, Origin, Resolution, Tones, layer,
};
use crate::image::store;
use crate::resource::{Namespace, ResourceId};
use std::path::{Path, PathBuf};
use std::sync::LazyLock;

/// `viewBox="0 0 512 512"`: the four numbers an SVG states its own box in.
///
/// **The `viewBox` and never the `width` attribute.** One icon in this corpus declares
/// `width="100%"`, which is a statement about the box it is drawn into rather than about the
/// drawing, and reading it would give the layer a dimension of one pixel. See
/// spec/architecture/resource.md, "The image layer answers in four steps".
static VIEW_BOX: LazyLock<regex::Regex> = LazyLock::new(|| {
	regex::Regex::new(r#"(?is)<svg\b[^>]*?\bviewBox\s*=\s*["']([^"']*)["']"#).expect("static pattern")
});

#[derive(Debug, thiserror::Error)]
pub enum Error {
	#[error("could not read {0}: {1}")]
	Read(PathBuf, #[source] std::io::Error),
	#[error("could not write: {0}")]
	Write(#[source] std::io::Error),
	/// A file that is on disk and cannot be measured, which leaves the image layer with nothing
	/// to say about the box. A refusal rather than a guessed dimension: layout is computed from
	/// that number, and one this repository invented would be wrong on every page silently.
	#[error("{0} is not an icon this repository can measure")]
	Unmeasurable(PathBuf),
}

/// One icon resource, decided and not yet written.
#[derive(Debug)]
pub struct Prepared {
	pub media: Media,
	/// Every file to hash into the objects tree: its content id, its extension, and its bytes.
	///
	/// Carried rather than written here so the caller can put the disk writes behind the writer
	/// that owns the published trees, the way every other task does. Deduplicated, because a site
	/// that publishes one icon publishes it under both tones and that is one object.
	pub objects: Vec<(String, &'static str, Vec<u8>)>,
}

/// One tone's file as it sits under a domain's directory.
struct Stored {
	tone: &'static str,
	path: PathBuf,
	extension: &'static str,
	mime: &'static str,
	bytes: Vec<u8>,
}

/// Which tone files this domain has, in the order a canonical is chosen from.
///
/// Light first, because an untinted mark is what a site without theming publishes and what a
/// reader following a bare id should be shown. A domain with a directory and no readable file in
/// it answers with nothing, which is a domain collected before this or one whose fetch failed.
fn stored(icon_root: &Path, domain: &str) -> Result<Vec<Stored>, Error> {
	let directory = icon_root.join(domain);
	let mut found = Vec::new();
	for tone in ["light", "dark"] {
		for extension in extension::ICON_EXTENSIONS {
			let path = directory.join(format!("{tone}.{extension}"));
			if !path.is_file() {
				continue;
			}
			let bytes = std::fs::read(&path).map_err(|error| Error::Read(path.clone(), error))?;
			let mime =
				extension::icon_mime(extension).ok_or_else(|| Error::Unmeasurable(path.clone()))?;
			found.push(Stored { tone, path, extension, mime, bytes });
			break;
		}
	}
	Ok(found)
}

/// The intrinsic box, whichever kind of file this is.
///
/// A vector states its own and a bitmap is its own; a multi-resolution `.ico` is measured at the
/// frame the decoder picks, which is the largest one. Nothing is decoded twice: the resolution
/// below is this same answer, withheld for a vector because there are no pixels to report.
fn box_of(file: &Stored) -> Option<(u32, u32)> {
	if file.mime == "image/svg+xml" {
		let text = std::str::from_utf8(&file.bytes).ok()?;
		let captured = VIEW_BOX.captures(text)?;
		let numbers: Vec<f64> = captured[1]
			.split([' ', ','])
			.filter(|part| !part.is_empty())
			.filter_map(|part| part.parse().ok())
			.collect();
		let (width, height) = (*numbers.get(2)?, *numbers.get(3)?);
		if width <= 0.0 || height <= 0.0 {
			return None;
		}
		return Some((width.round() as u32, height.round() as u32));
	}
	let decoded = image::load_from_memory(&file.bytes).ok()?;
	Some((decoded.width(), decoded.height()))
}

/// Everything this domain's icons are, or nothing when none have been collected.
///
/// `previous` is the record this domain already answers to, and it keeps its id and its
/// `created`: re-fetching an icon gives one thing new bytes, not a second thing. The caller
/// grants an id for a domain with no record, because the register is the manifest it holds.
pub fn prepare(
	icon_root: &Path,
	domain: &str,
	previous: Option<&Media>,
	resource: ResourceId,
) -> Result<Option<Prepared>, Error> {
	let files = stored(icon_root, domain)?;
	if files.is_empty() {
		return Ok(None);
	}

	let mut tones = Tones::default();
	let mut origin: Vec<Origin> = Vec::new();
	let mut objects: Vec<(String, &'static str, Vec<u8>)> = Vec::new();
	let mut dimension: Option<Dimension> = None;
	let mut resolution: Option<Resolution> = None;

	for file in &files {
		let (width, height) = box_of(file).ok_or_else(|| Error::Unmeasurable(file.path.clone()))?;
		let content = crate::image::cid(&file.bytes);
		// Pixels for a bitmap and nothing for a vector, the same rule the image layer states:
		// a caller that asks and receives nothing has learned the thing is scalable.
		let pixels = (!manifest::scalable(file.mime)).then(|| Resolution { width, height });
		let variant = ImageVariant {
			content: content.clone(),
			mime: file.mime.to_owned(),
			bytes: file.bytes.len() as u64,
			resolution: pixels.clone(),
			// No quality: these were encoded by somebody else and nothing here re-derives them,
			// so there is no setting a rebuild would have to reproduce.
			quality: None,
		};
		// The first tone present settles the box. The two are the same drawing at the same size
		// in every icon this corpus holds, and where they were not, light is the one a reader
		// following a bare id is sent to -- so the record's box is the box of that file.
		if dimension.is_none() {
			dimension = Some(Dimension { width, height, aspect: manifest::ratio_of(width, height) });
			resolution = pixels;
		}
		if !origin.iter().any(|held| held.blake3 == content) {
			origin.push(Origin {
				blake3: content.clone(),
				mime: file.mime.to_owned(),
				bytes: file.bytes.len() as u64,
			});
			objects.push((content, file.extension, file.bytes.clone()));
		}
		match file.tone {
			"dark" => tones.dark = Some(variant),
			_ => tones.light = Some(variant),
		}
	}

	let mut layers = manifest::Layers::of(layer::Media { version: layer::Media::VERSION, origin });
	layers.image = Some(layer::Image {
		version: layer::Image::VERSION,
		// No placeholder: two tones are two pictures, and one thumbhash painted under both would
		// be the wrong colour under one of them. See the layer.
		thumbhash: None,
		placeholder: None,
		dimension: dimension.expect("a file was measured, so there is a box"),
		resolution,
		// Empty on purpose. The files bind at `icon`, because what selects between them is tone
		// and that is this leaf's axis -- see spec/architecture/resource.md, "Content binds at
		// the layer that has it".
		variants: Vec::new(),
	});
	layers.icon =
		Some(layer::Icon { version: layer::Icon::VERSION, domain: domain.to_owned(), tones });

	let timestamp = manifest::now();
	let media = Media {
		canonical: manifest::canonical_of(&layers),
		version: manifest::VERSION,
		resource: previous.map_or(resource, |media| media.resource),
		namespace: Namespace::of(&["media", "image", "icon"]),
		created: previous.map_or_else(|| timestamp.clone(), |media| media.created.clone()),
		updated: timestamp,
		layers,
	};
	Ok(Some(Prepared { media, objects }))
}

/// Write the files into the objects tree and the record beside them.
///
/// The merged manifest is the caller's to write, once, because it is the register every
/// allocation reads. Keyed by the rid rather than by a content id: an icon has no one original --
/// it has one per tone, and both move the day that site redraws its mark, so a key taken from
/// either would name a different entry after every re-fetch. See `Merged`.
pub fn publish(repo: &Path, prepared: &Prepared, merged: &mut Merged) -> Result<(), Error> {
	let objects = crate::paths::objects_root(repo);
	for (content, extension, bytes) in &prepared.objects {
		let path = store::variant_path(&objects, content, extension);
		if path.is_file() {
			continue;
		}
		store::write(&path, bytes).map_err(Error::Write)?;
	}
	let metadata = crate::paths::metadata_root(repo);
	let json = serde_json::to_string(&prepared.media)
		.map_err(|error| Error::Write(std::io::Error::other(error.to_string())))?;
	store::write(&store::meta_path(&metadata, prepared.media.resource.as_str()), json.as_bytes())
		.map_err(Error::Write)?;
	merged.media.insert(prepared.media.resource.to_string(), prepared.media.clone());
	merged.updated = manifest::now();
	Ok(())
}

#[cfg(test)]
mod tests {
	use super::*;

	fn temp() -> tempfile::TempDir {
		tempfile::tempdir().expect("temp")
	}

	fn write(root: &Path, domain: &str, name: &str, bytes: &[u8]) {
		let directory = crate::paths::favicon_root(root).join(domain);
		std::fs::create_dir_all(&directory).expect("dir");
		std::fs::write(directory.join(name), bytes).expect("write");
	}

	const SVG: &[u8] =
		br#"<svg width="100%" height="100%" viewBox="0 0 512 256" xmlns="http://www.w3.org/2000/svg"></svg>"#;

	fn rid(text: &str) -> ResourceId {
		ResourceId::parse(text).expect("a rid")
	}

	/// The box is the `viewBox`, not the width attribute, which is what one icon here declares as
	/// a percentage. Reading that would give the layer a dimension of one pixel.
	#[test]
	fn measures_a_vector_by_its_view_box() {
		let temporary = temp();
		let root = temporary.path();
		write(root, "a.example", "light.svg", SVG);

		let prepared = prepare(&crate::paths::favicon_root(root), "a.example", None, rid("k7m2x"))
			.expect("prepare")
			.expect("a domain with files");
		let image = prepared.media.image().expect("an image layer");
		assert_eq!((image.dimension.width, image.dimension.height), (512, 256));
		// A vector has no pixels to report, and absent is the answer rather than a second field.
		assert!(image.resolution.is_none());
		assert!(image.thumbhash.is_none());
		assert!(image.variants.is_empty());
		std::fs::remove_dir_all(root).ok();
	}

	/// A site with one icon carries one key. Absence is what says the other tone was not
	/// collected, so nothing has to write a null and no reader has to read one.
	#[test]
	fn a_single_tone_site_names_one_file_and_no_null() {
		let temporary = temp();
		let root = temporary.path();
		write(root, "b.example", "dark.svg", SVG);

		let prepared = prepare(&crate::paths::favicon_root(root), "b.example", None, rid("k7m2x"))
			.expect("prepare")
			.expect("a domain with files");
		let icon = prepared.media.icon().expect("an icon layer");
		assert!(icon.tones.light.is_none());
		assert!(icon.tones.dark.is_some());
		let json = serde_json::to_string(&prepared.media).expect("json");
		assert!(!json.contains("null"), "{json}");
		assert!(!json.contains("\"light\""), "{json}");
		// A named tone is that tone or nothing; with none named, the one file answers.
		assert!(icon.tones.of(Some("light")).is_none());
		assert_eq!(icon.tones.of(None), icon.tones.dark.as_ref());
		std::fs::remove_dir_all(root).ok();
	}

	/// A site publishing one icon under both tones publishes one object, named twice.
	#[test]
	fn two_tones_of_one_drawing_are_one_object() {
		let temporary = temp();
		let root = temporary.path();
		write(root, "c.example", "light.svg", SVG);
		write(root, "c.example", "dark.svg", SVG);

		let prepared = prepare(&crate::paths::favicon_root(root), "c.example", None, rid("k7m2x"))
			.expect("prepare")
			.expect("a domain with files");
		assert_eq!(prepared.objects.len(), 1);
		assert_eq!(prepared.media.layers.media.origin.len(), 1);
		let icon = prepared.media.icon().expect("an icon layer");
		assert_eq!(
			icon.tones.light.as_ref().map(|file| &file.content),
			icon.tones.dark.as_ref().map(|file| &file.content)
		);
		std::fs::remove_dir_all(root).ok();
	}

	/// Re-collecting a domain gives one thing new bytes rather than making a second thing.
	#[test]
	fn a_domain_already_holding_a_record_keeps_its_id() {
		let temporary = temp();
		let root = temporary.path();
		write(root, "d.example", "light.svg", SVG);
		let first = prepare(&crate::paths::favicon_root(root), "d.example", None, rid("k7m2x"))
			.expect("prepare")
			.expect("a domain with files");

		write(root, "d.example", "light.svg", b"<svg viewBox=\"0 0 8 8\"></svg>");
		let second =
			prepare(&crate::paths::favicon_root(root), "d.example", Some(&first.media), rid("00000"))
				.expect("prepare")
				.expect("a domain with files");

		assert_eq!(second.media.resource, first.media.resource);
		assert_eq!(second.media.created, first.media.created);
		std::fs::remove_dir_all(root).ok();
	}

	/// A bare rid is answered with the light file, spelled the way it is stored.
	///
	/// `for_variant` would name every one of these `.avif`, which is an address to a file nobody
	/// wrote -- so the icon path reads its own table.
	#[test]
	fn declares_the_light_file_under_the_extension_it_was_stored_as() {
		let temporary = temp();
		let root = temporary.path();
		write(root, "e.example", "light.svg", SVG);
		let prepared = prepare(&crate::paths::favicon_root(root), "e.example", None, rid("k7m2x"))
			.expect("prepare")
			.expect("a domain with files");
		let declared = prepared.media.canonical.as_ref().expect("a canonical").to_string();
		assert!(declared.ends_with(".svg"), "{declared}");
		std::fs::remove_dir_all(root).ok();
	}

	/// A domain nothing has collected is not an icon with no files -- it is no resource at all.
	#[test]
	fn a_domain_with_nothing_collected_prepares_nothing() {
		let temporary = temp();
		let root = temporary.path();
		std::fs::create_dir_all(crate::paths::favicon_root(root).join("f.example")).expect("dir");
		assert!(
			prepare(&crate::paths::favicon_root(root), "f.example", None, rid("k7m2x"))
				.expect("prepare")
				.is_none()
		);
		std::fs::remove_dir_all(root).ok();
	}

	/// A file that cannot be measured refuses rather than inventing a box layout is computed from.
	#[test]
	fn refuses_a_file_it_cannot_measure() {
		let temporary = temp();
		let root = temporary.path();
		write(root, "g.example", "light.svg", b"<svg>no box at all</svg>");
		let failed = prepare(&crate::paths::favicon_root(root), "g.example", None, rid("k7m2x"));
		assert!(matches!(failed, Err(Error::Unmeasurable(_))), "{failed:?}");
		std::fs::remove_dir_all(root).ok();
	}
}
