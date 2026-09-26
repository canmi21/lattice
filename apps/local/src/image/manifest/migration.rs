//! Bringing a record of any shape this tool has written up to the current one: the manifest as
//! `local migrate` reads it, before any record in it has an id, and each record adopted under the id
//! granted it.

use super::*;

/// The manifest as it sits on disk with its records unread.
///
/// What `local migrate` reads and what nothing else does. A record that predates the migration has
/// no id, `Merged` will not hold one, and inventing one on the way past would settle an identity
/// by coin toss -- so the shape without an id stops here, where a command that grants ids is the
/// only reader.
#[derive(Debug, Deserialize)]
pub struct Unnamed {
	#[serde(default)]
	pub created: String,
	#[serde(default)]
	pub updated: String,
	#[serde(default, alias = "assets")]
	pub media: serde_json::Map<String, serde_json::Value>,
}

impl Unnamed {
	/// Whether this record already carries the id the migration grants.
	pub fn is_named(record: &serde_json::Value) -> bool {
		record.get("resource").is_some_and(serde_json::Value::is_string)
	}

	/// Whether it already says what a bare id of it means.
	///
	/// Asked of the unparsed record for the reason the one above is: what the migration fills in
	/// is exactly what the typed record cannot tell it was missing.
	pub fn declares(record: &serde_json::Value) -> bool {
		record.get("canonical").is_some_and(serde_json::Value::is_string)
	}

	/// The content id a clip names its poster by, before that link is a rid.
	///
	/// Read off the unparsed record because the typed one no longer has anywhere to put it: the
	/// field exists to be resolved away, and this is the last reader of it.
	pub fn poster(record: &serde_json::Value) -> Option<&str> {
		let legacy = record.get("poster");
		let layered = record.pointer("/layers/video/poster");
		legacy.or(layered).and_then(serde_json::Value::as_str)
	}
}

/// Read a manifest of any shape this tool has written, records left unparsed.
pub fn read_unnamed(path: &Path) -> std::io::Result<Unnamed> {
	let text = match std::fs::read_to_string(path) {
		Ok(text) => text,
		Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
			return Ok(Unnamed { created: now(), updated: now(), media: serde_json::Map::new() });
		}
		Err(error) => return Err(error),
	};
	serde_json::from_str(&text)
		.map_err(|error| std::io::Error::new(std::io::ErrorKind::InvalidData, error.to_string()))
}

/// Bring one record of any shape this tool has written up to the current one, under a granted id.
///
/// `named` answers what another record in the same manifest is called, which is the one thing a
/// conversion cannot work out alone: a clip's cover is a resource and the file names it by the
/// poster's content id, so resolving it needs the whole grant rather than this record.
pub fn adopt(
	record: serde_json::Value,
	resource: ResourceId,
	named: &dyn Fn(&str) -> Option<ResourceId>,
) -> Result<Media, String> {
	if record.get("layers").is_none() {
		let legacy: legacy::Media = serde_json::from_value(record).map_err(|e| e.to_string())?;
		return from_legacy(legacy, resource, named);
	}
	// Already layered but not yet named: written by a build that had this shape and no command to
	// grant ids. The two fields the migration adds are put in before it parses, because the typed
	// record has no room for their absence.
	let mut value = record;
	value["resource"] = serde_json::Value::String(resource.to_string());
	if let Some(video) = value.pointer_mut("/layers/video")
		&& video.get("cover").is_none()
	{
		let poster = video.get("poster").and_then(serde_json::Value::as_str).unwrap_or_default();
		let cover = named(poster).ok_or_else(|| format!("nothing in the manifest holds {poster}"))?;
		video["cover"] = serde_json::Value::String(cover.to_string());
	}
	if let Some(video) = value.pointer_mut("/layers/video").and_then(serde_json::Value::as_object_mut)
	{
		video.remove("poster");
	}
	let parsed: Media = serde_json::from_value(value).map_err(|error| error.to_string())?;
	parsed.validate().map_err(|error| error.to_string())?;
	Ok(parsed)
}

/// Bring one record written before resources up to the shape they have.
///
/// Every field it held has a home and none is dropped: `blake3` and the two facts about the
/// original become the one entry in `origin`, and what `type` discriminated on becomes the chain
/// that says the same thing in more detail. A clip's poster cid becomes its `cover` here, which
/// is the one field that needs to know what the rest of the manifest is called.
pub(super) fn from_legacy(
	record: legacy::Media,
	resource: ResourceId,
	named: &dyn Fn(&str) -> Option<ResourceId>,
) -> Result<Media, String> {
	let cid = record.blake3;
	let (namespace, layers) = match record.body {
		legacy::Body::Image(image) => {
			let origin =
				Origin { blake3: cid.clone(), mime: image.source.mime, bytes: image.source.bytes };
			let pixels = !scalable(&origin.mime);
			let picture = layer::Image {
				version: layer::Image::VERSION,
				placeholder: painted_from(Some(&image.thumbhash)),
				thumbhash: Some(image.thumbhash),
				dimension: Dimension {
					width: image.source.width,
					height: image.source.height,
					aspect: image.source.ratio,
				},
				resolution: pixels
					.then(|| Resolution { width: image.source.width, height: image.source.height }),
				variants: image
					.variants
					.into_iter()
					.map(|(content, variant)| ImageVariant {
						content,
						mime: variant.mime,
						bytes: variant.bytes,
						resolution: Some(Resolution { width: variant.width, height: variant.height }),
						quality: Some(variant.quality),
					})
					.collect(),
			};
			let layers = image_layers(origin, picture, image.metadata);
			(leaf_of(&layers), layers)
		}
		legacy::Body::Video(video) => {
			let cover = named(&video.poster)
				.ok_or_else(|| format!("nothing in the manifest holds {}", video.poster))?;
			let layers = Layers {
				media: layer::Media {
					version: layer::Media::VERSION,
					origin: vec![Origin {
						blake3: cid.clone(),
						mime: video.source.mime.clone(),
						bytes: video.source.bytes,
					}],
				},
				image: None,
				photo: None,
				screenshot: None,
				frame: None,
				icon: None,
				video: Some(layer::Video {
					version: layer::Video::VERSION,
					source: VideoSource {
						mime: video.source.mime,
						width: video.source.width,
						height: video.source.height,
						aspect: video.source.ratio,
						bytes: video.source.bytes,
						duration: video.source.duration,
						frame_rate: video.source.frame_rate,
						frames: video.source.frames,
						audio: video.source.audio,
						loudness: video.source.loudness,
						peak: video.source.peak,
					},
					cover,
					variants: video
						.variants
						.into_iter()
						.map(|(content, rung)| VideoVariant {
							content,
							mime: rung.mime,
							bytes: rung.bytes,
							resolution: Resolution { width: rung.width, height: rung.height },
							codec: rung.codec,
						})
						.collect(),
					tracks: video
						.captions
						.into_iter()
						.map(|(content, track)| Track {
							content,
							mime: track.mime,
							language: track.language,
							kind: track.kind,
							bytes: track.bytes,
						})
						.collect(),
				}),
				clip: Some(layer::Clip { version: layer::Clip::VERSION, excerpt: None }),
				unknown: BTreeMap::new(),
			};
			(Namespace::of(&["media", "video", "clip"]), layers)
		}
	};
	Ok(Media {
		canonical: canonical_of(&layers),
		version: VERSION,
		resource,
		namespace,
		created: record.created,
		updated: record.updated,
		layers,
	})
}
