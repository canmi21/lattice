//! Deriving what a browser can play from one original clip.
//!
//! The same arrangement `image` uses, and for the same reason: the original never leaves this
//! machine, what gets published is addressed by the hash of its own bytes, and a key can never
//! denote different content than it did before. What differs is that a clip publishes two
//! assets rather than one -- the rungs, and a poster frame that is an ordinary image asset with
//! its own id, its own AVIF rungs and its own description. The poster is the whole of what a
//! device that cannot decode AV1 is left with, so it is stored rather than extracted on demand:
//! demand is exactly the moment there is no decoder. See spec/architecture/video/pipeline.md.

pub mod encode;
pub mod ladder;
pub mod loudness;
pub mod probe;
pub mod run;

use crate::image::ladder::Size;
use crate::image::{self, manifest, store};
use manifest::{Body, Media, Video, VideoSource, VideoVariant};
use probe::Probe;
use std::collections::BTreeMap;
use std::ffi::OsStr;
use std::path::{Path, PathBuf};
use std::process::Command;

/// One rung, encoded and addressed by its own bytes.
#[derive(Debug, Clone)]
pub struct Rung {
	pub cid: String,
	pub bytes: Vec<u8>,
	pub width: u32,
	pub height: u32,
	/// The whole string a `<source>` needs, `av01.0.08M.08` rather than `av01`.
	pub codec: String,
}

/// One clip after every decision has been made and before anything is written.
#[derive(Debug)]
pub struct Prepared {
	/// The original's content id, and the identity of the clip.
	pub cid: String,
	pub probe: Probe,
	pub rungs: Vec<Rung>,
	/// The clip's record.
	pub media: Media,
	/// The first frame, prepared exactly as any other picture and written through the image
	/// pipeline. Its record is a second entry in the manifest, not a field of the clip's.
	pub poster: image::Prepared,
}

#[derive(Debug, thiserror::Error)]
pub enum Error {
	#[error("could not read: {0}")]
	Read(#[source] std::io::Error),
	#[error("could not run {tool} -- is it installed?")]
	Spawn {
		tool: &'static str,
		#[source]
		source: std::io::Error,
	},
	#[error("{tool} failed: {message}")]
	Tool { tool: &'static str, message: String },
	#[error("could not read what ffprobe said: {0}")]
	Unreadable(#[source] serde_json::Error),
	#[error("{} holds no video stream", .0.display())]
	NoVideoStream(PathBuf),
	#[error("could not count the frames of {}", .0.display())]
	NoFrameCount(PathBuf),
	#[error("the poster frame: {0}")]
	Poster(#[source] image::Error),
	#[error("could not encode record: {0}")]
	Serialize(#[source] serde_json::Error),
	#[error("could not write: {0}")]
	Write(#[source] std::io::Error),
}

/// Run one of the two external tools and hand back its stdout.
///
/// `ffprobe` and `ffmpeg`, and nothing else. Shelling out rather than linking libav follows
/// `licenses::cargo`, which reads `cargo metadata` the same way: a local tool can afford the
/// process, and bindings to a system library are a thing to install on every machine that
/// imports. Both are given a path and answer once, so nothing here streams.
fn tool<I, S>(name: &'static str, arguments: I) -> Result<Vec<u8>, Error>
where
	I: IntoIterator<Item = S>,
	S: AsRef<OsStr>,
{
	let output = Command::new(name)
		.args(arguments)
		.output()
		.map_err(|source| Error::Spawn { tool: name, source })?;
	if !output.status.success() {
		return Err(Error::Tool {
			tool: name,
			message: String::from_utf8_lossy(&output.stderr).trim().to_owned(),
		});
	}
	Ok(output.stdout)
}

/// A file ffmpeg writes and this module reads back, removed however the call ends.
///
/// MP4 with `faststart` cannot be written to a pipe: the index goes at the front, so the muxer
/// has to seek. `tempfile` is a dev-dependency here and is not worth promoting for one path --
/// the name carries the source's content id and the rung's height, which makes it unique by
/// construction rather than by a process id, and the drop is what the hand-rolled temporary
/// directories this repository replaced did not have.
struct Scratch(PathBuf);

impl Drop for Scratch {
	fn drop(&mut self) {
		std::fs::remove_file(&self.0).ok();
	}
}

/// Derive one clip into a value ready to write, without touching the published tree.
///
/// `known` is the merged manifest's records rather than the one previous record `image` takes,
/// because a clip carries two ids and only one of them is known before the work is done: the
/// poster's is the hash of a frame that has not been extracted yet.
pub fn derive_for(
	source: &Path,
	original: &[u8],
	known: &BTreeMap<String, Media>,
) -> Result<Prepared, Error> {
	let id = image::cid(original);
	let probe = probe::probe(source)?;
	let size = Size::new(probe.width, probe.height);

	let mut rungs = Vec::new();
	for target in ladder::ladder(size) {
		let scratch = Scratch(std::env::temp_dir().join(format!("cms-{id}-{}p.mp4", target.height)));
		encode::rung(source, size, target, probe.frame_rate, probe.audio, &scratch.0)?;
		let bytes = std::fs::read(&scratch.0).map_err(Error::Read)?;
		rungs.push(Rung {
			cid: image::cid(&bytes),
			width: target.width,
			height: target.height,
			codec: probe::codec_string(&scratch.0)?,
			bytes,
		});
	}

	let poster = poster(source, known)?;
	// Measured off the original rather than off a rung: the ladder re-encodes the same soundtrack
	// into every one of them, so they all answer the same, and the original is the one file that
	// is certainly there.
	let level = loudness::loudness(source, probe.audio)?;
	let timestamp = manifest::now();
	let previous = known.get(&id).and_then(Media::video);
	let media = Media {
		// Carried over, so re-running does not rewrite the day the clip first appeared.
		created: known.get(&id).map_or_else(|| timestamp.clone(), |media| media.created.clone()),
		updated: timestamp,
		blake3: id.clone(),
		body: Body::Video(Video {
			source: VideoSource {
				mime: mime_of(source).to_owned(),
				width: probe.width,
				height: probe.height,
				ratio: manifest::ratio_of(probe.width, probe.height),
				bytes: original.len() as u64,
				duration: probe.duration,
				frame_rate: probe.frame_rate,
				frames: probe.frames,
				audio: probe.audio,
				loudness: level.map(|level| level.integrated),
				peak: level.map(|level| level.peak),
			},
			poster: poster.media.blake3.clone(),
			variants: rungs
				.iter()
				.map(|rung| {
					(
						rung.cid.clone(),
						VideoVariant {
							mime: encode::MIME.to_owned(),
							width: rung.width,
							height: rung.height,
							bytes: rung.bytes.len() as u64,
							codec: rung.codec.clone(),
						},
					)
				})
				.collect(),
			// Carried over for the same reason the timestamp is, and it matters more: a track was
			// cut to this excerpt by hand or bought from a model, and nothing here can rebuild it.
			// Re-encoding the pixels must not take the words with it.
			captions: previous.map(|video| video.captions.clone()).unwrap_or_default(),
		}),
	};

	Ok(Prepared { cid: id, probe, rungs, media, poster })
}

/// The first frame, derived as an ordinary picture.
///
/// Taken from the source rather than from a rung: the poster's own ladder is the image one and
/// it should start from the most detail there is, not from a re-encode of it. No EXIF is read
/// -- a frame ffmpeg wrote has no camera account of itself -- and no gazetteer, for the same
/// reason.
fn poster(source: &Path, known: &BTreeMap<String, Media>) -> Result<image::Prepared, Error> {
	let frame = encode::first_frame(source)?;
	let derived = image::derive(&frame, false).map_err(Error::Poster)?;
	let media = manifest::media_for(
		&derived,
		"image/png",
		frame.len() as u64,
		known.get(&derived.cid).map(|media| media.created.as_str()),
		None,
	);
	Ok(image::Prepared { derived, media })
}

/// Write a completed derivation. No probing or record decisions happen here.
///
/// The poster goes through `image::write_derived` rather than a second image path: it is a
/// picture, and a second way to publish one would be a second place to get alt text wrong.
pub fn write_derived(public: &Path, prepared: &Prepared) -> Result<(), Error> {
	for rung in &prepared.rungs {
		let target = store::video_path(public, &rung.cid);
		store::write(&target, &rung.bytes).map_err(Error::Write)?;
	}
	image::write_derived(public, &prepared.poster).map_err(Error::Poster)?;

	// Minified, for the reason `image::write_derived` gives.
	let document = manifest::Document { version: manifest::VERSION, media: prepared.media.clone() };
	let json = serde_json::to_string(&document).map_err(Error::Serialize)?;
	store::write(&store::meta_path(public, &prepared.cid), json.as_bytes()).map_err(Error::Write)
}

/// Derive and publish one clip, preserving its first-seen timestamp when it already exists.
pub fn publish(
	source: &Path,
	original: &[u8],
	public: &Path,
	known: &BTreeMap<String, Media>,
) -> Result<Prepared, Error> {
	let prepared = derive_for(source, original, known)?;
	write_derived(public, &prepared)?;
	Ok(prepared)
}

/// Whether a reference names something this module imports.
///
/// By extension, because a reference in an article is a filename and there is nothing to read.
/// A resolved one is `{cid}.mp4`, which answers the same way.
pub fn is_video(value: &str) -> bool {
	Path::new(value)
		.extension()
		.and_then(OsStr::to_str)
		.is_some_and(|extension| EXTENSIONS.contains(&extension.to_ascii_lowercase().as_str()))
}

/// What a clip may arrive as. Only MP4 is ever written; this is the reading side, which stays
/// wide for the same reason `image::mime_of` accepts formats the ladder never stores.
const EXTENSIONS: [&str; 5] = ["mp4", "mov", "m4v", "webm", "mkv"];

pub fn mime_of(path: &Path) -> &'static str {
	match path.extension().and_then(OsStr::to_str).unwrap_or_default().to_ascii_lowercase().as_str() {
		"mp4" | "m4v" => "video/mp4",
		"mov" => "video/quicktime",
		"webm" => "video/webm",
		"mkv" => "video/x-matroska",
		_ => "application/octet-stream",
	}
}

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn recognises_a_clip_by_its_extension_however_it_is_written() {
		assert!(is_video("clip.mp4"));
		assert!(is_video("CLIP.MOV"));
		// A resolved reference is a content id and the format it became, and it has to answer the
		// same way or a second run would treat it as unresolved and look for a file by that name.
		assert!(is_video("44b6081deaf0242ca3bf83d62a3b6c95.mp4"));
		assert!(!is_video("shot.png"));
		assert!(!is_video("clip"));
	}

	#[test]
	fn reads_mime_from_the_extension() {
		assert_eq!(mime_of(Path::new("a.MP4")), "video/mp4");
		assert_eq!(mime_of(Path::new("a.mov")), "video/quicktime");
		assert_eq!(mime_of(Path::new("a.unknown")), "application/octet-stream");
	}
}
