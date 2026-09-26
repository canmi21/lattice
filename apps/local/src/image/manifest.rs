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
use crate::resource::{self, Canonical, Layered, Namespace, ResourceId};
use base64::Engine as _;
use base64::engine::general_purpose::STANDARD;
use serde::{Deserialize, Deserializer, Serialize};
use std::collections::BTreeMap;
use std::path::Path;

/// Bumped when the shape changes, so a reader can tell rather than guess; the first change
/// without one is the one that corrupts silently. 1 the original shape; 2 assets gain a
/// `description`; 3 it moves to `data/record/media.yaml`, `preview` and `original` go, and
/// camera data arrives as `metadata`; 4 `type` becomes a discriminant, each kind getting its own
/// body; 5 the record becomes a resource -- a rid names it, `type` is a namespace and the body
/// becomes `layers`. `canonical` joined 5 rather than making a 6: 5 has never been deployed.
pub const VERSION: u32 = 5;

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
	pub icon: Option<layer::Icon>,
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
		if let Some(icon) = &self.icon {
			present.push(("icon", icon.version));
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
			icon: None,
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
pub mod layer;

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

impl Resolution {
	/// Widened before multiplying: two `u32` sides overflow one, and a canonical chosen off a
	/// wrapped product would name the smallest file of the set.
	pub fn pixels(&self) -> u64 {
		u64::from(self.width) * u64::from(self.height)
	}
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

/// An icon's files, one per tone.
///
/// **A site with one icon carries one key**, and absence is the answer -- the same idiom
/// `resolution` uses above. Nothing writes a null to say "this site has no dark mark", so no
/// reader has to tell that null apart from a tone nobody looked for.
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
pub struct Tones {
	#[serde(default, skip_serializing_if = "Option::is_none")]
	pub light: Option<ImageVariant>,
	#[serde(default, skip_serializing_if = "Option::is_none")]
	pub dark: Option<ImageVariant>,
}

impl Tones {
	/// Which file answers for a tone, and nothing when none does.
	///
	/// **A named tone is that tone or nothing.** A caller that asked for dark and received light
	/// cannot tell it happened, and would draw a light mark on a dark surface believing it had
	/// the right one. With no tone named either will do, and light goes first because an
	/// untinted mark is drawn for light backgrounds. The twin of `toned` in libs/artifacts.
	pub fn of(&self, tone: Option<&str>) -> Option<&ImageVariant> {
		match tone {
			Some("light") => self.light.as_ref(),
			Some("dark") => self.dark.as_ref(),
			Some(_) => None,
			None => self.light.as_ref().or(self.dark.as_ref()),
		}
	}

	/// Every file this icon publishes, in the order a canonical is chosen from.
	pub fn files(&self) -> impl Iterator<Item = &ImageVariant> {
		self.light.iter().chain(self.dark.iter())
	}
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

	/// The icon this record is, or nothing when it is not one.
	pub fn icon(&self) -> Option<&layer::Icon> {
		self.layers.icon.as_ref()
	}

	pub fn video(&self) -> Option<&layer::Video> {
		self.layers.video.as_ref()
	}

	/// The same, to be written to. `local captions` attaches a track to a clip already published,
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

/// One published file, seen as the facts that order it against its siblings.
///
/// `rank` is the whole of the rule, and the order of the tuple it returns is the order the
/// tie-breaks apply in.
struct Rendition<'a> {
	pixels: u64,
	bytes: u64,
	content: &'a str,
	extension: &'a str,
}

impl<'a> Rendition<'a> {
	fn rank(&self) -> (u64, u64, &'a str) {
		(self.pixels, self.bytes, self.content)
	}
}

/// What a bare resource id means: the largest rendition this resource publishes.
///
/// Quality and not compatibility, deliberately -- `<picture>` answers compatibility on the site,
/// and a short link should hand over the best thing there is. Ties break on bytes and then on
/// the cid, so two runs over one record answer the same rather than whichever a map yielded
/// first. A resource with nothing to point at declares nothing, and `/{rid}` refuses it.
pub fn canonical_of(layers: &Layers) -> Option<Canonical> {
	let pictures =
		layers.image.iter().flat_map(|image| image.variants.iter()).filter_map(|variant| {
			// A variant reporting no pixels is a vector, which this ladder does not publish --
			// and which `for_variant` would name `.avif`. An address to a file nobody wrote is
			// worse than the refusal a resource with nothing to point at already gets.
			Some(Rendition {
				pixels: variant.resolution.as_ref()?.pixels(),
				bytes: variant.bytes,
				content: &variant.content,
				extension: crate::extension::for_variant(&variant.mime),
			})
		});
	let rungs = layers.video.iter().flat_map(|video| video.variants.iter()).map(|rung| Rendition {
		pixels: rung.resolution.pixels(),
		bytes: rung.bytes,
		content: &rung.content,
		extension: crate::extension::VIDEO,
	});
	if let Some(icon) = &layers.icon {
		return icon_canonical(icon);
	}
	let best = pictures.chain(rungs).max_by(|left, right| left.rank().cmp(&right.rank()))?;
	Some(Canonical::Object { cid: best.content.to_owned(), extension: best.extension.to_owned() })
}

/// What a bare rid means for an icon, which the ladder rule above cannot answer.
///
/// Largest is the wrong question here: the two files are two pictures, and an SVG has no pixels
/// to be largest by, so ranking them would hand out whichever happened to be a bitmap. The light
/// one is what an untinted mark is, and it is what a reader following a bare id should be shown;
/// a site that publishes only a dark mark is answered with the one file it has.
fn icon_canonical(icon: &layer::Icon) -> Option<Canonical> {
	let file = icon.tones.of(None)?;
	// `for_icon`, not `for_variant`: the ladder's table answers AVIF for anything it does not
	// recognise, and these files are whatever somebody else's server served -- an SVG named
	// `.avif` is an address to a file nobody wrote.
	let extension = crate::extension::for_icon(&file.mime)?;
	Some(Canonical::Object { cid: file.content.clone(), extension: extension.to_owned() })
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
	/// Keyed by the original's content id.
	///
	/// The key outlived the conflation spec/architecture/resource.md exists to end, and it is the
	/// last place a cid names a thing rather than bytes. It stays for now because re-keying is a
	/// change to every command that imports, describes or classifies one, and `resource` on each
	/// record is already the identity -- `by_resource` is how anything reached by a rid finds one.
	pub media: BTreeMap<String, Media>,
}

impl Merged {
	/// The record known by this id, under the key it is filed by.
	///
	/// A scan rather than a lookup, for as long as the key above is a cid. Forty-five records and
	/// a handful of callers, so the alternative -- a second index to keep in step with the first
	/// -- would cost more than it saves.
	pub fn by_resource(&self, resource: ResourceId) -> Option<(&str, &Media)> {
		self
			.media
			.iter()
			.find(|(_, media)| media.resource == resource)
			.map(|(key, media)| (key.as_str(), media))
	}

	/// The icon collected for one site, which is how a link card reaches its mark.
	///
	/// A domain rather than a reference, because an article never names an icon: it names a URL,
	/// and the hostname of that URL is the identity. A scan for the same reason `by_resource` is
	/// one. See spec/architecture/resource.md, "The catalogue".
	pub fn by_icon_domain(&self, domain: &str) -> Option<(&str, &Media)> {
		self
			.media
			.iter()
			.find(|(_, media)| media.icon().is_some_and(|icon| icon.domain == domain))
			.map(|(key, media)| (key.as_str(), media))
	}

	/// The record an article reference names, whichever of the two ids it names it by.
	///
	/// Both forms are answered because both exist in the corpus during a migration round, and a
	/// sweep that could only read one of them would offer everything the other names for deletion.
	pub fn resolve(&self, target: &crate::refs::Target) -> Option<(&str, &Media)> {
		match target {
			crate::refs::Target::Resource(resource) => self.by_resource(*resource),
			crate::refs::Target::Content(cid) => {
				self.media.get_key_value(*cid).map(|(key, media)| (key.as_str(), media))
			}
		}
	}
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
	/// Read a manifest every record of which has been granted an id, and refuse one that has not.
	///
	/// Deterministic, and it allocates nothing. An id minted while loading differs between two
	/// runs, and an identity that changes every time the file is read is not one -- so the shape
	/// without one is read by `local migrate` and by nothing else, and every command here loads a
	/// corpus that has been through it.
	fn into_merged(self) -> Result<Merged, String> {
		let mut media = BTreeMap::new();
		for (key, value) in self.media {
			// Each record is asked what shape it is, rather than the file being trusted to say:
			// the committed manifest reads `"version": 3` while its records are already the
			// version 4 shape, because that number is only rewritten when a run finishes.
			// Correcting it there would not change a record, and would break this loader.
			if value.get("layers").is_none() || value.get("resource").is_none() {
				return Err(format!("`{key}` has no resource id -- run `local migrate` first"));
			}
			let record: Media =
				serde_json::from_value(value).map_err(|error| format!("`{key}`: {error}"))?;
			record.validate().map_err(|error| format!("`{key}`: {error}"))?;
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
mod legacy;
mod migration;
pub use migration::{Unnamed, adopt, read_unnamed};

/// Every id this manifest has handed out, which is the register an allocation is checked against.
pub fn register(known: &BTreeMap<String, Media>) -> std::collections::BTreeSet<ResourceId> {
	known.values().map(|media| media.resource).collect()
}

/// The id a record already answers to, or a new one the register does not hold.
///
/// Re-deriving a picture must not rename it: every article naming the old id would be pointing at
/// nothing, and an identity that changes when the pixels are re-encoded is not an identity.
pub fn resource_for(
	previous: Option<&Media>,
	register: &std::collections::BTreeSet<ResourceId>,
) -> ResourceId {
	previous.map_or_else(|| resource::allocate(register), |media| media.resource)
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
		icon: None,
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
/// a guarded write finishes and hide staleness forever. One that does not parse is stale, and so
/// is one whose canonical disagrees -- that field joined 5 without moving it, so no number says.
///
/// Looked for under the record's rid: the manifest's key would find nothing, and write the whole
/// metadata tree back under the cids `local migrate` just moved it off.
pub fn migrate(merged: &Merged, metadata: &Path) -> Vec<String> {
	merged
		.media
		.iter()
		.filter(|(_, media)| {
			let path = super::store::meta_path(metadata, media.resource.as_str());
			std::fs::read_to_string(path)
				.ok()
				.and_then(|text| serde_json::from_str::<Media>(&text).ok())
				// The whole record rather than the envelope's version and its canonical form.
				// Those two were the only fields that had ever moved without a pixel moving with
				// them, and the day a third did -- a layer gaining a field, which by design
				// raises no number above it -- the published copy stayed behind with nothing to
				// say so. The manifest is what a record is written from, so any difference is a
				// record that has not been written yet.
				.is_none_or(|document| document != **media)
		})
		.map(|(key, _)| key.clone())
		.collect()
}

/// The decoded placeholder for a base64 thumbhash, or none where there is nothing to decode.
fn painted_from(thumbhash: Option<&str>) -> Option<String> {
	super::painted(&STANDARD.decode(thumbhash?).ok()?)
}

/// Decode the placeholder for every picture written before the record carried one.
///
/// A record holds the hash already, so this touches no original and no pixel -- the same reason
/// `run::republish` exists rather than a re-derivation. Returns how many were filled in.
pub fn repaint(merged: &mut Merged) -> usize {
	let mut filled = 0;
	for media in merged.media.values_mut() {
		let Some(image) = media.layers.image.as_mut() else { continue };
		if image.placeholder.is_some() {
			continue;
		}
		image.placeholder = painted_from(image.thumbhash.as_deref());
		if image.placeholder.is_some() {
			filled += 1;
		}
	}
	filled
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
/// not a second thing. The caller grants the id, because the register is the manifest it holds.
pub fn media_for(
	derived: &Derived,
	source_mime: &str,
	source_bytes: u64,
	previous: Option<&Media>,
	metadata: Option<exif::Metadata>,
	resource: ResourceId,
) -> Media {
	let timestamp = now();
	let origin =
		Origin { blake3: derived.cid.clone(), mime: source_mime.to_owned(), bytes: source_bytes };
	let image = layer::Image {
		version: layer::Image::VERSION,
		thumbhash: Some(STANDARD.encode(&derived.thumb)),
		placeholder: super::painted(&derived.thumb),
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
		canonical: canonical_of(&layers),
		version: VERSION,
		resource: previous.map_or(resource, |media| media.resource),
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
pub mod fixture;

#[cfg(test)]
mod tests;
