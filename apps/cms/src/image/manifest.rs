//! The record written for every media resource.
//!
//! Two shapes come out of the same data and must never be produced separately. One file per
//! resource, `{rid}.json`, published so the metadata API can answer a single lookup without
//! reading anything else. One merged file, committed, so the site build can inline placeholders
//! into articles without the images being present at all.
//!
//! The layer shapes here are the twin of the schemas in `libs/artifacts`, which is what reads
//! them on the other side. Two readings of one format is a defect waiting for the first record
//! that separates them, so a change here is a change there. See spec/architecture/resource.md.

use super::{Derived, Variant, exif};
use crate::resource::{self, Layered, Namespace, ResourceId};
use base64::Engine as _;
use base64::engine::general_purpose::STANDARD;
use serde::{Deserialize, Deserializer, Serialize};
use std::collections::BTreeMap;
use std::path::Path;

/// Bumped when the shape changes, so a reader can tell rather than guess. The first change
/// without one is the one that corrupts silently: 1 the original shape; 2 assets gain a
/// `description`; 3 `description` moves to `data/record/media.yaml`, `preview` and `original`
/// are dropped, and camera data arrives as `metadata`; 4 `type` becomes a discriminant, so each
/// kind gets its own body; 5 the record becomes a resource -- an allocated rid names it, `type`
/// is a namespace and the body becomes `layers`. See spec/architecture/resource.md.
pub const VERSION: u32 = 5;

// FIXME: everything written here before the migration round lacks `resource`, and a clip lacks
// `cover`, both of which `libs/artifacts` requires -- no rid exists until the command that grants
// them has run and written them back, and inventing one on the way past would settle an identity
// by coin toss. The legacy cid beside each field is what holds the link until then.

/// One media resource's record: the envelope every resource has, with this crate's layers typed.
pub type Media = resource::Record<Layers>;

/// The layers this crate knows, one field per segment it can parse.
///
/// Unknown ones are kept rather than dropped. A record written by something that knows a segment
/// this build does not has to survive being read and written back, and losing it here would
/// delete it from the committed manifest with nothing to report.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Layers {
	pub media: layer::Media,
	#[serde(default, skip_serializing_if = "Option::is_none")]
	pub image: Option<layer::Image>,
	#[serde(default, skip_serializing_if = "Option::is_none")]
	pub photo: Option<layer::Photo>,
	#[serde(default, skip_serializing_if = "Option::is_none")]
	pub screenshot: Option<layer::Screenshot>,
	#[serde(default, skip_serializing_if = "Option::is_none")]
	pub frame: Option<layer::Frame>,
	#[serde(default, skip_serializing_if = "Option::is_none")]
	pub video: Option<layer::Video>,
	#[serde(default, skip_serializing_if = "Option::is_none")]
	pub clip: Option<layer::Clip>,
	#[serde(flatten)]
	pub unknown: BTreeMap<String, resource::Layer>,
}

impl Layered for Layers {
	fn layers(&self) -> Vec<(&str, u32)> {
		let mut present = vec![("media", self.media.version)];
		if let Some(image) = &self.image {
			present.push(("image", image.version));
		}
		if let Some(photo) = &self.photo {
			present.push(("photo", photo.version));
		}
		if let Some(screenshot) = &self.screenshot {
			present.push(("screenshot", screenshot.version));
		}
		if let Some(frame) = &self.frame {
			present.push(("frame", frame.version));
		}
		if let Some(video) = &self.video {
			present.push(("video", video.version));
		}
		if let Some(clip) = &self.clip {
			present.push(("clip", clip.version));
		}
		present.extend(self.unknown.iter().map(|(name, layer)| (name.as_str(), layer.version)));
		present
	}
}

impl Layers {
	/// The layers of a resource that is only `media` so far, for a caller about to add its own.
	///
	/// Every kind here starts with the same layer and differs from there, so the alternative is
	/// six `None`s written out at every place a record is built.
	pub fn of(media: layer::Media) -> Self {
		Self {
			media,
			image: None,
			photo: None,
			screenshot: None,
			frame: None,
			video: None,
			clip: None,
			unknown: BTreeMap::new(),
		}
	}
}

/// One layer per segment of `type`, each carrying its own version.
///
/// A layer raises its number when its own shape moves, and the envelope does not notice. The
/// module exists so `layer::Media` -- what any media is -- stays distinct from `Media`, which is
/// the whole record.
pub mod layer {
	use super::exif;
	use super::{Dimension, Excerpt, ImageVariant, Origin, Resolution, Track};
	use super::{VideoSource, VideoVariant};
	use crate::resource::ResourceId;
	use serde::{Deserialize, Serialize};

	/// What every media resource is: bytes that came from somewhere.
	#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
	pub struct Media {
		pub version: u32,
		/// Every original this resource has been made from, oldest first.
		///
		/// A list, because re-scanning a subject adds an original to the thing rather than
		/// making a second thing. None of these bytes is published; the cids are kept so the
		/// next import of the same file is recognised and skipped.
		pub origin: Vec<Origin>,
	}

	/// A picture, whatever it is a picture of.
	#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
	pub struct Image {
		pub version: u32,
		/// Base64 thumbhash: the compact canonical placeholder, and the only form kept. The
		/// build decodes it once and inlines the result.
		pub thumbhash: String,
		/// The intrinsic box -- an SVG's `viewBox`, a bitmap's pixels -- and what layout and
		/// aspect ratio are computed from.
		pub dimension: Dimension,
		/// Actual pixels, bitmaps only. **Absent is the answer**: a caller that asks and
		/// receives nothing has learned the thing is scalable, with no second field to consult.
		#[serde(default, skip_serializing_if = "Option::is_none")]
		pub resolution: Option<Resolution>,
		/// Every published encoding. They bind here because this is the first layer at which a
		/// concrete mime is a fact.
		pub variants: Vec<ImageVariant>,
	}

	/// A camera pointed at the world.
	///
	/// The account is flattened rather than nested under a name: what a sensor recorded is what
	/// this layer is, and a wrapper would be a second word for the layer itself.
	#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
	pub struct Photo {
		pub version: u32,
		#[serde(flatten)]
		pub metadata: exif::Metadata,
	}

	/// Extraction ran and found no camera.
	///
	/// The layer's presence is what says extraction ran at all -- the distinction the `metadata`
	/// container used to carry, now carried by the chain. The scale is what a capture at a device
	/// pixel ratio needs and a photograph does not.
	#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
	pub struct Screenshot {
		pub version: u32,
		#[serde(default, skip_serializing_if = "Option::is_none")]
		pub scale: Option<f64>,
		#[serde(flatten)]
		pub metadata: exif::Metadata,
	}

	/// A still cut from a clip.
	#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
	pub struct Frame {
		pub version: u32,
		/// The clip this was cut from, whose `cover` points back here. Not a cycle to remove:
		/// one says what the cover is, the other what this is a frame of, and replacing the
		/// cover leaves this a frame of that clip.
		pub source: ResourceId,
		/// Seconds into the clip, which is the one thing the picture itself cannot say.
		#[serde(default, skip_serializing_if = "Option::is_none")]
		pub at: Option<f64>,
	}

	/// A moving picture: what the source was, what was published of it, and what is read over it.
	///
	/// The source numbers are kept because a rung is a re-encode and none of them can be read
	/// back off one. A track binds here rather than earning a rid: it is a file belonging to one
	/// clip and is reached from nowhere else.
	#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
	pub struct Video {
		pub version: u32,
		pub source: VideoSource,
		/// The poster frame, a resource of its own because it is referred to from two places --
		/// and an ordinary picture with its own ladder and its own description.
		///
		/// Absent until rids are granted, which is the place `poster` holds meanwhile.
		#[serde(default, skip_serializing_if = "Option::is_none")]
		pub cover: Option<ResourceId>,
		/// The poster's own content id, which is all there is to point with before rids exist.
		/// The migration resolves it into `cover` and drops it.
		#[serde(default, skip_serializing_if = "Option::is_none")]
		pub poster: Option<String>,
		pub variants: Vec<VideoVariant>,
		pub tracks: Vec<Track>,
	}

	/// A video cut from a longer one.
	///
	/// The excerpt is the whole of what the layer brings: seconds into the original, which no
	/// derived file records and which is the difference between a clip and what it came out of.
	#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
	pub struct Clip {
		pub version: u32,
		#[serde(default, skip_serializing_if = "Option::is_none")]
		pub excerpt: Option<Excerpt>,
	}

	impl Media {
		pub const VERSION: u32 = 1;
	}
	impl Image {
		pub const VERSION: u32 = 1;
	}
	impl Photo {
		pub const VERSION: u32 = 1;
	}
	impl Screenshot {
		pub const VERSION: u32 = 1;
	}
	impl Frame {
		pub const VERSION: u32 = 1;
	}
	impl Video {
		pub const VERSION: u32 = 1;
	}
	impl Clip {
		pub const VERSION: u32 = 1;
	}
}

/// One original a resource was made from.
///
/// `origin` and `source` answer different questions: this points at bytes, which may no longer
/// exist anywhere, while a `source` points at another resource we also hold.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Origin {
	pub blake3: String,
	pub mime: String,
	pub bytes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Dimension {
	pub width: u32,
	pub height: u32,
	/// Reduced by the greatest common divisor, so it is exact rather than snapped to a familiar
	/// name. Screenshots rarely land on a recognisable ratio.
	pub aspect: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Resolution {
	pub width: u32,
	pub height: u32,
}

/// One published encoding of a picture.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ImageVariant {
	/// The content id of these bytes, which is how the object is addressed.
	pub content: String,
	pub mime: String,
	pub bytes: u64,
	/// Absent on a vector, for the layer's reason: there are no pixels to report.
	#[serde(default, skip_serializing_if = "Option::is_none")]
	pub resolution: Option<Resolution>,
	/// Normalised 0..1, as a number so it can be compared without parsing. Kept because
	/// re-deriving has to reproduce what was published.
	#[serde(default, skip_serializing_if = "Option::is_none")]
	pub quality: Option<f32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct VideoSource {
	pub mime: String,
	pub width: u32,
	pub height: u32,
	pub aspect: String,
	pub bytes: u64,
	/// Seconds.
	pub duration: f64,
	pub frame_rate: f64,
	/// The denominator of the progress bar the software-decode path shows. Without it that bar
	/// cannot be honest, which is the whole reason a frame count is stored at all.
	pub frames: u64,
	pub audio: bool,
	/// Integrated loudness (LUFS) and true peak (dBTP), from EBU R128. See
	/// spec/architecture/video/pipeline.md, "Loudness, not peak, sets the target".
	///
	/// Absent for a clip with no audio, or one imported before this was measured -- optional
	/// rather than zero, since zero would read as the loudest possible clip.
	#[serde(default, skip_serializing_if = "Option::is_none")]
	pub loudness: Option<f64>,
	#[serde(default, skip_serializing_if = "Option::is_none")]
	pub peak: Option<f64>,
}

/// One rung of the ladder.
///
/// `quality` does not carry over from a picture: it is a 0..1 the image encoder was handed, and
/// a video's CRF is not the same quantity under another name. What a `<source>` element has to
/// be told is the full codec string, so that is what is kept instead.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct VideoVariant {
	pub content: String,
	pub mime: String,
	pub bytes: u64,
	pub resolution: Resolution,
	/// The whole string, `av01.0.05M.08` rather than `av01`. A partial one tells a browser
	/// nothing it can decide on.
	pub codec: String,
}

/// One text track read over a clip.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Track {
	pub content: String,
	pub mime: String,
	/// BCP 47, `en`.
	pub language: String,
	/// `captions`, `subtitles` or `descriptions`: what the `<track>` element is told.
	pub kind: String,
	pub bytes: u64,
}

/// The range of the original a clip was cut from, in seconds.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Excerpt {
	pub from: f64,
	pub to: f64,
}

impl Media {
	/// The picture this record is, or nothing when it is not one.
	///
	/// Every caller that only makes sense for a picture goes through here, so the place a video
	/// is turned away is a visible line rather than an empty string further down.
	pub fn image(&self) -> Option<&layer::Image> {
		self.layers.image.as_ref()
	}

	pub fn video(&self) -> Option<&layer::Video> {
		self.layers.video.as_ref()
	}

	/// The same, to be written to. `cms captions` attaches a track to a clip already published,
	/// which is the one operation that changes a record without deriving anything.
	pub fn video_mut(&mut self) -> Option<&mut layer::Video> {
		self.layers.video.as_mut()
	}

	pub fn clip(&self) -> Option<&layer::Clip> {
		self.layers.clip.as_ref()
	}

	/// The original this record was last made from, for the paths still addressed by one.
	pub fn origin(&self) -> Option<&Origin> {
		self.layers.media.origin.last()
	}

	/// The cid of that original, which is still what the files and the authored records beside
	/// them are keyed by. `meta/{cid}.json` and `data/record/media.yaml` both spell a resource
	/// this way, so every caller that has to reach one asks here.
	pub fn origin_cid(&self) -> Option<&str> {
		self.origin().map(|origin| origin.blake3.as_str())
	}

	/// What the record is, for a report that has to name the kind without matching on it.
	pub fn kind(&self) -> &str {
		self.namespace.leaf()
	}

	/// Record that this picture is a still cut from a clip, whose `cover` points back at it.
	///
	/// A picture that already answers to a deeper segment keeps it and this answers false: a
	/// frame ffmpeg wrote carries no camera account of itself, so nothing in the pipeline
	/// produces both, and quietly replacing one would lose what extraction found.
	pub fn cut_from(&mut self, clip: ResourceId, at: Option<f64>) -> bool {
		if self.layers.photo.is_some() || self.layers.screenshot.is_some() {
			return false;
		}
		self.layers.frame = Some(layer::Frame { version: layer::Frame::VERSION, source: clip, at });
		self.namespace = Namespace::of(&["media", "image", "frame"]);
		true
	}
}

/// Which mimes answer any target size, and the only place on this side that knows.
///
/// A caller asking whether a picture is big enough gets its answer without learning what an SVG
/// is. See spec/architecture/resource.md, "The image layer answers in four steps".
pub fn scalable(mime: &str) -> bool {
	matches!(mime, "image/svg+xml")
}

/// Every resource, merged. This is the file that gets committed.
///
/// One entry per resource, each the same shape as the document published beside the bytes, so a
/// reader that can parse one can parse the other. `created` is the day the file itself first
/// appeared and `updated` moves whenever anything in it does.
#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct Merged {
	pub version: u32,
	pub created: String,
	pub updated: String,
	/// Keyed by the original's content id, which is the conflation
	/// spec/architecture/resource.md exists to end -- and which stands until the migration grants
	/// rids and re-keys this. Re-keying it here would mean minting an id on every read.
	pub media: BTreeMap<String, Media>,
}

impl Merged {
	/// The record these bytes were imported as, under whatever key it is filed by.
	///
	/// The one question a cid still answers about a resource, and the reason it is a search
	/// rather than a lookup: an original re-scanned since is an older entry in the same list,
	/// and the key is only ever the newest one. Works before the migration and after it.
	pub fn by_origin(&self, cid: &str) -> Option<(&str, &Media)> {
		self
			.media
			.iter()
			.find(|(_, media)| media.layers.media.origin.iter().any(|origin| origin.blake3 == cid))
			.map(|(key, media)| (key.as_str(), media))
	}
}

impl<'de> Deserialize<'de> for Merged {
	fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
		Wire::deserialize(deserializer)?.into_merged().map_err(serde::de::Error::custom)
	}
}

/// The manifest as it is written, before any record has been read as one shape or the other.
#[derive(Deserialize)]
struct Wire {
	#[serde(default)]
	created: String,
	#[serde(default)]
	updated: String,
	/// Accepts the old key so a manifest written before the rename still loads.
	#[serde(default, alias = "assets")]
	media: serde_json::Map<String, serde_json::Value>,
}

impl Wire {
	/// Read a manifest of any shape this tool has written, and hand back the current one.
	///
	/// Deterministic, and it allocates nothing: a record with no rid keeps none. An id minted
	/// while loading differs between two runs, and an identity that changes every time the file
	/// is read is not one. `cms migrate` grants them once and writes them back.
	fn into_merged(self) -> Result<Merged, String> {
		let mut media = BTreeMap::new();
		for (key, value) in self.media {
			// Each record is asked what shape it is, rather than the file being trusted to say:
			// the committed manifest reads `"version": 3` while its records are already the
			// version 4 shape, because that number is only rewritten when a run finishes.
			// Correcting it there would not change a record, and would break this loader.
			let record = if value.get("layers").is_some() {
				let record: Media =
					serde_json::from_value(value).map_err(|error| format!("`{key}`: {error}"))?;
				record.validate().map_err(|error| format!("`{key}`: {error}"))?;
				record
			} else {
				let record: legacy::Media =
					serde_json::from_value(value).map_err(|error| format!("`{key}`: {error}"))?;
				from_legacy(record)
			};
			media.insert(key, record);
		}

		// What is in memory is this shape whatever the file said, so the number says so too. It
		// reaches disk the next time anything writes the manifest.
		Ok(Merged { version: VERSION, created: self.created, updated: self.updated, media })
	}
}

/// The shape versions 1 through 4 were written in, kept so that what is on disk can be read.
///
/// `data/record/metadata.json` is committed and cannot be regenerated -- the originals live
/// outside git and some of them are gone -- so a reader converts rather than refusing. Nothing
/// here is ever written, which is why none of it derives `Serialize`.
mod legacy {
	use serde::Deserialize;
	use std::collections::BTreeMap;

	#[derive(Debug, Clone, Deserialize)]
	pub struct Media {
		pub created: String,
		pub updated: String,
		pub blake3: String,
		#[serde(flatten)]
		pub body: Body,
	}

	#[derive(Debug, Clone, Deserialize)]
	#[serde(tag = "type", rename_all = "lowercase")]
	pub enum Body {
		Image(Image),
		Video(Video),
	}

	#[derive(Debug, Clone, Deserialize)]
	pub struct Image {
		pub thumbhash: String,
		pub source: Source,
		#[serde(default)]
		pub metadata: Option<crate::image::exif::Metadata>,
		pub variants: BTreeMap<String, Variant>,
	}

	#[derive(Debug, Clone, Deserialize)]
	pub struct Video {
		pub source: VideoSource,
		pub poster: String,
		pub variants: BTreeMap<String, VideoVariant>,
		#[serde(default)]
		pub captions: BTreeMap<String, Caption>,
	}

	#[derive(Debug, Clone, Deserialize)]
	pub struct Source {
		pub mime: String,
		pub width: u32,
		pub height: u32,
		pub ratio: String,
		pub bytes: u64,
	}

	#[derive(Debug, Clone, Deserialize)]
	pub struct Variant {
		pub mime: String,
		pub width: u32,
		pub height: u32,
		pub quality: f32,
		pub bytes: u64,
	}

	#[derive(Debug, Clone, Deserialize)]
	pub struct VideoSource {
		pub mime: String,
		pub width: u32,
		pub height: u32,
		pub ratio: String,
		pub bytes: u64,
		pub duration: f64,
		pub frame_rate: f64,
		pub frames: u64,
		pub audio: bool,
		#[serde(default)]
		pub loudness: Option<f64>,
		#[serde(default)]
		pub peak: Option<f64>,
	}

	#[derive(Debug, Clone, Deserialize)]
	pub struct VideoVariant {
		pub mime: String,
		pub width: u32,
		pub height: u32,
		pub bytes: u64,
		pub codec: String,
	}

	#[derive(Debug, Clone, Deserialize)]
	pub struct Caption {
		pub mime: String,
		pub language: String,
		pub kind: String,
		pub bytes: u64,
	}
}

/// Bring one record written before resources up to the shape they have.
///
/// Every field it held has a home and none is dropped: `blake3` and the two facts about the
/// original become the one entry in `origin`, and what `type` discriminated on becomes the chain
/// that says the same thing in more detail. What it cannot do is name another resource, which is
/// why no poster becomes a frame here: that needs rids, and the migration has them.
fn from_legacy(record: legacy::Media) -> Media {
	let cid = record.blake3;
	let (namespace, layers) = match record.body {
		legacy::Body::Image(image) => {
			let origin =
				Origin { blake3: cid.clone(), mime: image.source.mime, bytes: image.source.bytes };
			let pixels = !scalable(&origin.mime);
			let picture = layer::Image {
				version: layer::Image::VERSION,
				thumbhash: image.thumbhash,
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
					cover: None,
					poster: Some(video.poster),
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
	Media {
		version: VERSION,
		// Nothing grants one here. A record that has never been migrated holds no rid, and that
		// absence is the honest answer until `cms migrate` writes one.
		resource: None,
		namespace,
		created: record.created,
		updated: record.updated,
		layers,
	}
}

/// Sort one picture's camera account into the layer that answers for it.
///
/// Three states, and the container carried them before the chain did: no `metadata` key meant
/// extraction never ran, an empty one meant it ran and found nothing. That is now the presence
/// of a leaf segment, so a reader learns it from `type` without opening a layer.
fn image_layers(origin: Origin, image: layer::Image, metadata: Option<exif::Metadata>) -> Layers {
	let camera = metadata.as_ref().is_some_and(|found| found.camera.is_some());
	Layers {
		media: layer::Media { version: layer::Media::VERSION, origin: vec![origin] },
		image: Some(image),
		photo: metadata
			.clone()
			.filter(|_| camera)
			.map(|metadata| layer::Photo { version: layer::Photo::VERSION, metadata }),
		screenshot: metadata.filter(|_| !camera).map(|metadata| layer::Screenshot {
			version: layer::Screenshot::VERSION,
			scale: None,
			metadata,
		}),
		frame: None,
		video: None,
		clip: None,
		unknown: BTreeMap::new(),
	}
}

/// The chain a picture's layers add up to.
///
/// Short on purpose where nothing deeper is known: a thing that cannot be classified is not
/// classified, because a wrong leaf is worse than a missing one and the leaf can be added the
/// day extraction runs. See spec/architecture/resource.md.
fn leaf_of(layers: &Layers) -> Namespace {
	if layers.photo.is_some() {
		return Namespace::of(&["media", "image", "photo"]);
	}
	if layers.screenshot.is_some() {
		return Namespace::of(&["media", "image", "screenshot"]);
	}
	Namespace::of(&["media", "image"])
}

/// Find the records whose published document is not the shape this build writes.
///
/// Staleness is per document rather than per manifest: the aggregate version can advance before
/// a guarded write finishes, which would hide staleness forever as a one-shot gate. One that
/// does not parse counts as stale, which is how every record written before this shape is found.
pub fn migrate(merged: &Merged, metadata: &Path) -> Vec<String> {
	merged
		.media
		.keys()
		.filter(|cid| {
			let path = super::store::meta_path(metadata, cid);
			std::fs::read_to_string(path)
				.ok()
				.and_then(|text| serde_json::from_str::<Media>(&text).ok())
				.is_none_or(|document| document.version < VERSION)
		})
		.cloned()
		.collect()
}

pub fn ratio_of(width: u32, height: u32) -> String {
	let divisor = gcd(width, height).max(1);
	format!("{}:{}", width / divisor, height / divisor)
}

fn gcd(a: u32, b: u32) -> u32 {
	if b == 0 { a } else { gcd(b, a % b) }
}

pub fn now() -> String {
	jiff::Timestamp::now().to_string()
}

fn published(variant: &Variant) -> ImageVariant {
	ImageVariant {
		content: variant.cid.clone(),
		mime: variant.format.mime().to_owned(),
		bytes: variant.bytes.len() as u64,
		resolution: Some(Resolution { width: variant.width, height: variant.height }),
		quality: Some(variant.format.quality()),
	}
}

/// Build the record for one picture.
///
/// A record that already exists keeps its rid, its `created` and whatever it was cut from, and
/// its origins are added to rather than replaced -- re-deriving gives one thing another original,
/// not a second thing. A new one carries no rid: only the migration grants those.
pub fn media_for(
	derived: &Derived,
	source_mime: &str,
	source_bytes: u64,
	previous: Option<&Media>,
	metadata: Option<exif::Metadata>,
) -> Media {
	let timestamp = now();
	let origin =
		Origin { blake3: derived.cid.clone(), mime: source_mime.to_owned(), bytes: source_bytes };
	let image = layer::Image {
		version: layer::Image::VERSION,
		thumbhash: STANDARD.encode(&derived.thumb),
		dimension: Dimension {
			width: derived.width,
			height: derived.height,
			aspect: ratio_of(derived.width, derived.height),
		},
		resolution: (!scalable(source_mime))
			.then(|| Resolution { width: derived.width, height: derived.height }),
		variants: derived.variants.iter().map(published).collect(),
	};
	let mut layers = image_layers(origin.clone(), image, metadata);
	let mut origins: Vec<Origin> =
		previous.map(|media| media.layers.media.origin.clone()).unwrap_or_default();
	if !origins.iter().any(|held| held.blake3 == origin.blake3) {
		origins.push(origin);
	}
	layers.media.origin = origins;
	layers.frame = previous.and_then(|media| media.layers.frame.clone());
	let namespace = if layers.frame.is_some() {
		Namespace::of(&["media", "image", "frame"])
	} else {
		leaf_of(&layers)
	};
	Media {
		version: VERSION,
		resource: previous.and_then(|media| media.resource),
		namespace,
		created: previous.map_or_else(|| timestamp.clone(), |media| media.created.clone()),
		updated: timestamp,
		layers,
	}
}

/// Records built by hand, for the tests of every command that reads one.
///
/// A layered record is five fields and a container deep, so a literal per test module would be
/// five places to edit the day a layer moves. Test-only, and nothing here writes to disk: what a
/// command does with a record is the test's business, and this is only the record.
#[cfg(test)]
pub mod fixture {
	use super::*;

	/// A picture made from `cid`, published as one AVIF variant per `(content, width, height)`.
	pub fn picture(cid: &str, dimension: (u32, u32), variants: &[(&str, u32, u32)]) -> Media {
		let (width, height) = dimension;
		let mut layers = Layers::of(layer::Media {
			version: layer::Media::VERSION,
			origin: vec![Origin { blake3: cid.to_owned(), mime: "image/png".into(), bytes: 1 }],
		});
		layers.image = Some(layer::Image {
			version: layer::Image::VERSION,
			thumbhash: String::new(),
			dimension: Dimension { width, height, aspect: ratio_of(width, height) },
			resolution: Some(Resolution { width, height }),
			variants: variants
				.iter()
				.map(|(content, width, height)| ImageVariant {
					content: (*content).to_owned(),
					mime: "image/avif".into(),
					bytes: 1,
					resolution: Some(Resolution { width: *width, height: *height }),
					quality: Some(0.68),
				})
				.collect(),
		});
		record(Namespace::of(&["media", "image"]), layers)
	}

	/// A clip made from `cid`: 1080p, silent, one second, naming the poster cut from it.
	///
	/// The numbers a test cares about are set on the record it gets back, through `video_mut`.
	/// Every clip here would otherwise take eleven source fields to say one thing about one.
	pub fn clip(cid: &str, poster: &str, rungs: &[&str], tracks: &[&str]) -> Media {
		let mut layers = Layers::of(layer::Media {
			version: layer::Media::VERSION,
			origin: vec![Origin { blake3: cid.to_owned(), mime: "video/mp4".into(), bytes: 1 }],
		});
		layers.video = Some(layer::Video {
			version: layer::Video::VERSION,
			source: VideoSource {
				mime: "video/mp4".into(),
				width: 1920,
				height: 1080,
				aspect: "16:9".into(),
				bytes: 1,
				duration: 1.0,
				frame_rate: 30.0,
				frames: 30,
				audio: false,
				loudness: None,
				peak: None,
			},
			cover: None,
			poster: Some(poster.to_owned()),
			variants: rungs
				.iter()
				.map(|content| VideoVariant {
					content: (*content).to_owned(),
					mime: "video/mp4".into(),
					bytes: 1,
					resolution: Resolution { width: 1920, height: 1080 },
					codec: "av01.0.05M.08".into(),
				})
				.collect(),
			tracks: tracks
				.iter()
				.map(|content| Track {
					content: (*content).to_owned(),
					mime: "text/vtt".into(),
					language: "en".into(),
					kind: "captions".into(),
					bytes: 1,
				})
				.collect(),
		});
		layers.clip = Some(layer::Clip { version: layer::Clip::VERSION, excerpt: None });
		record(Namespace::of(&["media", "video", "clip"]), layers)
	}

	/// The envelope around either: no rid, because nothing but the migration grants one.
	fn record(namespace: Namespace, layers: Layers) -> Media {
		Media {
			version: VERSION,
			resource: None,
			namespace,
			created: "2026-09-14T00:00:00Z".into(),
			updated: "2026-09-14T00:00:00Z".into(),
			layers,
		}
	}
}

#[cfg(test)]
mod tests {
	use super::*;

	fn merged_of(records: &str) -> Merged {
		let text = format!(
			r#"{{ "version": 3, "created": "2026-07-30T13:14:52Z",
			   "updated": "2026-07-30T13:14:52Z", "media": {{ {records} }} }}"#
		);
		serde_json::from_str(&text).expect("a manifest")
	}

	fn derived_of(cid: &str) -> Derived {
		Derived {
			cid: cid.to_owned(),
			width: 1960,
			height: 1274,
			thumb: vec![1, 2, 3],
			variants: Vec::new(),
		}
	}

	#[test]
	fn reduces_a_ratio_exactly() {
		assert_eq!(ratio_of(1920, 1080), "16:9");
		assert_eq!(ratio_of(800, 600), "4:3");
		assert_eq!(ratio_of(500, 500), "1:1");
	}

	#[test]
	fn does_not_pretend_an_awkward_ratio_is_a_familiar_one() {
		// A screenshot is whatever the window was. Snapping this to 16:9 would be a lie that
		// an aspect-ratio box would then render wrong.
		assert_eq!(ratio_of(2356, 1204), "589:301");
	}

	#[test]
	fn survives_a_zero_dimension() {
		assert_eq!(ratio_of(0, 0), "0:0");
	}

	#[test]
	fn timestamps_are_iso_8601_in_utc() {
		let value = now();
		assert!(value.ends_with('Z'), "not UTC: {value}");
		assert!(value.contains('T'), "not ISO 8601: {value}");
	}

	const LEGACY_CID: &str = "0e0624f079e617e53ed474ccd98a947b";

	/// One record copied verbatim out of `data/record/metadata.json`, which is still written in
	/// the shape versions 3 and 4 share. The conversion's whole claim is about real records, so
	/// the evidence is one of them rather than one written to fit.
	const LEGACY_IMAGE: &str = r#""0e0624f079e617e53ed474ccd98a947b": {
		"type": "image",
		"created": "2026-09-14T02:55:32.15685Z",
		"updated": "2026-09-14T02:55:32.15685Z",
		"blake3": "0e0624f079e617e53ed474ccd98a947b",
		"thumbhash": "+vcJBYCIh5iIh3ePhkeHcoiIj4f4",
		"source": { "mime": "image/png", "width": 1960, "height": 1274, "ratio": "20:13",
			"bytes": 477086 },
		"metadata": { "color_space": "sRGB" },
		"variants": { "20805a43fdc2119f1aa8fae25c0ff8e1": { "mime": "image/avif", "width": 640,
			"height": 416, "quality": 0.68, "bytes": 2253 } }
	}"#;

	#[test]
	fn a_record_written_before_resources_keeps_every_field_it_had() {
		// The one failure that matters here is a loader that drops something. Each field of the
		// old shape is asserted where it landed, rather than the record merely parsing.
		let merged = merged_of(LEGACY_IMAGE);
		let media = merged.media.get(LEGACY_CID).expect("keyed by the original's cid");
		let image = media.image().expect("a picture");
		assert_eq!(media.version, VERSION);
		assert_eq!(media.created, "2026-09-14T02:55:32.15685Z");
		assert_eq!(media.origin().map(|origin| origin.blake3.as_str()), Some(LEGACY_CID));
		assert_eq!(media.origin().map(|origin| origin.bytes), Some(477_086));
		assert_eq!(image.thumbhash, "+vcJBYCIh5iIh3ePhkeHcoiIj4f4");
		assert_eq!(image.dimension.width, 1960);
		assert_eq!(image.dimension.aspect, "20:13");
		assert_eq!(image.resolution, Some(Resolution { width: 1960, height: 1274 }));
		let variant = image.variants.first().expect("a variant");
		assert_eq!(variant.content, "20805a43fdc2119f1aa8fae25c0ff8e1");
		assert_eq!(variant.resolution, Some(Resolution { width: 640, height: 416 }));
		assert_eq!(variant.quality, Some(0.68));
		assert_eq!(variant.bytes, 2253);
	}

	#[test]
	fn reading_a_pre_resource_file_grants_no_id_and_says_so() {
		// An id minted on the way in is different on every read, and the first thing to write one
		// into an article would write a number the next process cannot resolve.
		let merged = merged_of(LEGACY_IMAGE);
		let media = merged.media.get(LEGACY_CID).expect("one record");
		assert_eq!(media.resource, None);
		// And it is the same manifest twice, which is the property that absence buys.
		assert_eq!(merged_of(LEGACY_IMAGE), merged);
	}

	#[test]
	fn extraction_that_found_no_camera_becomes_a_screenshot() {
		// The three states the `metadata` container used to carry are now the chain: a leaf of
		// `screenshot` says extraction ran, and what it found is still in the layer.
		let merged = merged_of(LEGACY_IMAGE);
		let media = merged.media.values().next().expect("one record");
		assert_eq!(media.namespace.to_string(), "media.image.screenshot");
		let screenshot = media.layers.screenshot.as_ref().expect("a screenshot layer");
		assert_eq!(screenshot.metadata.color_space.as_deref(), Some("sRGB"));
		assert_eq!(media.validate(), Ok(()));
	}

	#[test]
	fn a_picture_nobody_extracted_is_left_unclassified() {
		let without = LEGACY_IMAGE.replace(r#""metadata": { "color_space": "sRGB" },"#, "");
		let merged = merged_of(&without);
		let media = merged.media.values().next().expect("one record");
		assert_eq!(media.namespace.to_string(), "media.image");
		assert!(media.layers.screenshot.is_none());
		assert_eq!(media.validate(), Ok(()));
	}

	#[test]
	fn camera_data_makes_it_a_photograph() {
		let with = LEGACY_IMAGE.replace(
			r#""metadata": { "color_space": "sRGB" },"#,
			r#""metadata": { "camera": { "model": "iPhone" } },"#,
		);
		let merged = merged_of(&with);
		let media = merged.media.values().next().expect("one record");
		assert_eq!(media.namespace.to_string(), "media.image.photo");
		let photo = media.layers.photo.as_ref().expect("a photo layer");
		let model = photo.metadata.camera.as_ref().and_then(|camera| camera.model.as_deref());
		assert_eq!(model, Some("iPhone"));
		// Flattened, so what a sensor recorded sits at the top of the layer rather than under a
		// second name for the layer itself.
		let written = serde_json::to_string(photo).expect("serialise");
		assert!(written.contains(r#""camera":{"model":"iPhone"}"#), "{written}");
	}

	const LEGACY_CLIP: &str = r#""aa11bb22cc33dd44ee55ff6677889900": {
		"type": "video",
		"created": "2026-09-14T00:00:00Z",
		"updated": "2026-09-14T00:00:00Z",
		"blake3": "aa11bb22cc33dd44ee55ff6677889900",
		"source": { "mime": "video/mp4", "width": 1920, "height": 1080, "ratio": "16:9",
			"bytes": 4112384, "duration": 25.5, "frame_rate": 30.0, "frames": 765, "audio": true },
		"poster": "0e0624f079e617e53ed474ccd98a947b",
		"variants": { "cc33dd44ee55ff667788990011223344": { "mime": "video/mp4", "width": 1920,
			"height": 1080, "bytes": 4000000, "codec": "av01.0.05M.08" } },
		"captions": { "dd44ee55": { "mime": "text/vtt", "language": "en", "kind": "captions",
			"bytes": 812 } }
	}"#;

	#[test]
	fn a_clip_keeps_its_rungs_its_tracks_and_what_its_cover_is() {
		// A track was cut to this excerpt by hand or bought from a model, and nothing here can
		// rebuild one. The poster is the same kind of loss in waiting: there is no rid to point
		// with yet, so the cid it pointed with is what survives until the migration resolves it.
		let merged = merged_of(&format!("{LEGACY_CLIP}, {LEGACY_IMAGE}"));
		let media = merged.media.get("aa11bb22cc33dd44ee55ff6677889900").expect("a clip");
		let video = media.video().expect("a video layer");
		assert_eq!(media.namespace.to_string(), "media.video.clip");
		assert_eq!(video.cover, None);
		assert_eq!(video.poster.as_deref(), Some(LEGACY_CID));
		assert_eq!(video.variants.len(), 1);
		assert_eq!(video.variants[0].resolution, Resolution { width: 1920, height: 1080 });
		assert_eq!(video.tracks.len(), 1);
		assert_eq!(video.tracks[0].content, "dd44ee55");
		assert_eq!(video.tracks[0].language, "en");
		assert_eq!(video.source.frames, 765);
		assert_eq!(video.source.aspect, "16:9");
		assert!(media.image().is_none());
		assert_eq!(media.validate(), Ok(()));
	}

	#[test]
	fn a_poster_is_still_an_ordinary_picture_until_the_migration_runs() {
		// Classifying it as a frame means naming the clip, and naming anything means rids. A
		// wrong leaf is worse than a missing one, so it keeps the short chain.
		let merged = merged_of(&format!("{LEGACY_CLIP}, {LEGACY_IMAGE}"));
		let poster = merged.media.get(LEGACY_CID).expect("the poster");
		assert_eq!(poster.namespace.to_string(), "media.image.screenshot");
		assert!(poster.layers.frame.is_none());
	}

	#[test]
	fn a_layer_this_build_has_never_heard_of_survives_being_read_and_written() {
		// Both sides of a change are pushed together, so the window is minutes -- but a record
		// read and written back inside it must not come out shorter than it went in.
		let merged = merged_of(LEGACY_IMAGE);
		let mut media = merged.media.values().next().expect("one record").clone();
		media.namespace = Namespace::of(&["media", "image", "screenshot", "terminal"]);
		media.layers.unknown.insert(
			"terminal".to_owned(),
			resource::Layer {
				version: 1,
				fields: serde_json::from_str(r#"{ "shell": "fish" }"#).expect("fields"),
			},
		);
		let text = serde_json::to_string(&media).expect("serialise");
		let read: Media = serde_json::from_str(&text).expect("deserialise");
		assert_eq!(read, media);
		assert_eq!(read.validate(), Ok(()));
		assert!(text.contains(r#""terminal":{"version":1,"shell":"fish"}"#), "{text}");
	}

	#[test]
	fn a_record_round_trips_through_json_with_type_spelled_as_a_namespace() {
		let merged = merged_of(LEGACY_IMAGE);
		let media = merged.media.values().next().expect("one record");
		let text = serde_json::to_string(media).expect("serialise");
		assert_eq!(&serde_json::from_str::<Media>(&text).expect("deserialise"), media);
		assert!(text.contains(r#""type":"media.image.screenshot""#), "{text}");
		assert!(text.contains(r#""version":5"#), "{text}");
		// Nothing says what a record lacks: no rid it has not been granted, no video layers, and
		// no key holding a null.
		assert!(!text.contains("resource"), "{text}");
		assert!(!text.contains("clip"), "{text}");
		assert!(!text.contains("null"), "{text}");
	}

	#[test]
	fn a_record_that_holds_a_rid_keeps_it_through_a_round_trip() {
		let merged = merged_of(LEGACY_IMAGE);
		let mut media = merged.media.values().next().expect("one record").clone();
		media.resource = Some(ResourceId::parse("k7m2x").expect("a rid"));
		let text = serde_json::to_string(&media).expect("serialise");
		assert!(text.contains(r#""resource":"k7m2x""#), "{text}");
		assert_eq!(serde_json::from_str::<Media>(&text).expect("deserialise"), media);
	}

	#[test]
	fn a_manifest_written_in_the_new_shape_loads_as_it_was_written() {
		let merged = merged_of(LEGACY_IMAGE);
		let text = serde_json::to_string(&merged).expect("serialise");
		let read: Merged = serde_json::from_str(&text).expect("deserialise");
		assert_eq!(read, merged);
		assert_eq!(read.media.keys().collect::<Vec<_>>(), merged.media.keys().collect::<Vec<_>>());
	}

	#[test]
	fn a_picture_re_derived_keeps_its_id_and_gains_an_origin() {
		// Better bytes for the same subject are another original, not another thing. This is the
		// whole reason identity is granted rather than derived from the bytes.
		let merged = merged_of(LEGACY_IMAGE);
		let mut previous = merged.media.values().next().expect("one record").clone();
		previous.resource = Some(ResourceId::parse("k7m2x").expect("a rid"));
		let derived = derived_of("ff00ff00ff00ff00ff00ff00ff00ff00");
		let media = media_for(&derived, "image/png", 5, Some(&previous), None);
		assert_eq!(media.resource, previous.resource);
		assert_eq!(media.created, previous.created);
		let origins: Vec<&str> =
			media.layers.media.origin.iter().map(|origin| origin.blake3.as_str()).collect();
		assert_eq!(origins, [LEGACY_CID, "ff00ff00ff00ff00ff00ff00ff00ff00"]);
	}

	#[test]
	fn a_vector_answers_nothing_when_asked_for_pixels() {
		// Absent is the answer: a caller that asks and receives nothing has learned the thing is
		// scalable, with no second field to consult.
		let derived = derived_of("ab");
		let vector = media_for(&derived, "image/svg+xml", 512, None, None);
		let bitmap = media_for(&derived, "image/png", 512, None, None);
		assert_eq!(vector.image().and_then(|image| image.resolution.clone()), None);
		assert_eq!(
			bitmap.image().and_then(|image| image.resolution.clone()),
			Some(Resolution { width: 1960, height: 1274 })
		);
	}

	#[test]
	fn a_frame_stays_a_frame_when_its_pixels_are_derived_again() {
		let clip = ResourceId::parse("q4w8n").expect("a rid");
		let derived = derived_of("ab");
		let mut frame = media_for(&derived, "image/png", 512, None, None);
		assert!(frame.cut_from(clip, Some(1.5)));
		let again = media_for(&derived, "image/png", 512, Some(&frame), None);
		assert_eq!(again.namespace.to_string(), "media.image.frame");
		assert_eq!(again.layers.frame.map(|frame| frame.source), Some(clip));
	}
}
