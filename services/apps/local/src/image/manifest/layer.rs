use super::exif;
use super::{Dimension, Excerpt, ImageVariant, Origin, Resolution, Tones, Track};
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
	/// Base64 thumbhash: the compact canonical placeholder, and what `placeholder` below is
	/// decoded from.
	///
	/// Optional, because a picture is not the only thing this layer describes. An icon binds
	/// two files under `icon` and has no single picture to stand in for -- absent is the
	/// answer there, and a placeholder invented for one tone would be painted under the other.
	#[serde(default, skip_serializing_if = "Option::is_none")]
	pub thumbhash: Option<String>,
	/// The same placeholder decoded, as a `data:image/webp` URI a page paints directly.
	///
	/// Stored rather than derived where it is wanted: see `super::painted`. Additive, so the
	/// layer keeps its version -- an unknown field is the row the parsing table opens with,
	/// in spec/architecture/resource.md.
	#[serde(default, skip_serializing_if = "Option::is_none")]
	pub placeholder: Option<String>,
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

/// Another site's mark: one resource per domain, one file per tone.
///
/// **Light and dark are two pictures, not two encodings of one**, so they bind here rather
/// than in `image.variants`, which means "the same picture, smaller" -- a list that would
/// make every consumer of it wrong about one of the two. Each file is described exactly as an
/// image variant is, because a file is a file; what differs is the axis it is keyed on.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Icon {
	pub version: u32,
	/// The site this is the mark of, lowercased, exactly as the collector stored it.
	pub domain: String,
	pub tones: Tones,
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
	/// A rid and never a cid, which is what makes the frame's `source` and this point at each
	/// other. Anything walking the two carries a visited set; the cycle is by design.
	pub cover: ResourceId,
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
impl Icon {
	pub const VERSION: u32 = 1;
}
impl Video {
	pub const VERSION: u32 = 1;
}
impl Clip {
	pub const VERSION: u32 = 1;
}
