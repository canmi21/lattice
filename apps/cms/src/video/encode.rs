//! Turning one original into the rungs that get served.
//!
//! AV1 in MP4 with `faststart`, and no second encoding of the same picture. A browser that
//! cannot decode the format shows nothing, which is why the format is chosen against measured
//! support rather than convenience, and why an H.264 rendition beside this one was declined --
//! it is a storage decision and the argument is written out in spec/architecture/video.md.

use super::{Error, tool};
use crate::image::ladder::Size;
use std::ffi::OsString;
use std::path::Path;

/// The one extension a rung is ever written under, and the type a `<source>` is told.
pub const EXTENSION: &str = "mp4";
pub const MIME: &str = "video/mp4";

/// `libsvtav1`, and on this machine it is also the only choice.
///
/// The two AV1 encoders differ by an order of magnitude in speed for the same picture, and the
/// ffmpeg here is built with `--enable-libsvtav1` and no libaom, so `libaom-av1` would fail at
/// the spawn rather than run slowly. It would still be the wrong pick if it were present:
/// measured on the 24-second 4K clip this was written against, SVT-AV1 at preset 6 produced
/// both rungs in twenty seconds, and libaom at a comparable quality is minutes per rung. This
/// runs over a whole library on one laptop.
const ENCODER: &str = "libsvtav1";

/// Measured on the 25-second 360p clip, against the source with libvmaf:
///
/// | crf | bytes | vmaf  |
/// | --: | ----: | ----: |
/// |  26 | 1.52M | 97.30 |
/// |  30 | 1.22M | 96.86 |
/// |  32 | 1.06M | 96.50 |
/// |  34 | 0.95M | 96.16 |
/// |  38 | 0.75M | 95.22 |
///
/// The curve is flat because the sources are already H.264 excerpts rather than masters, so
/// what is being encoded has been through a codec once. 26 buys 0.8 VMAF for 43% more bytes
/// and every reader pays those bytes; below 32 the loss starts showing on the title cards two
/// of these clips end on, which is the same failure mode the AVIF quality was chosen against.
const CRF: u8 = 32;

/// SVT-AV1's speed dial, 0 slowest to 13. 6 is the middle and the encoder's own default for
/// non-realtime work; this runs once per clip locally, and the rung above pays for it in
/// seconds rather than minutes.
const PRESET: u8 = 6;

/// Seconds between keyframes. A reader scrubbing a twenty-second excerpt lands between them,
/// and the decoder starts from the one before -- two seconds is the worst wait that can cost.
/// SVT-AV1's own default is about five.
const KEYFRAME_SECONDS: f64 = 2.0;

/// Encode one rung to `destination`.
///
/// Aspect is preserved by the ladder rather than by the filter, so the scale is given both
/// numbers and the encoder is never asked to guess one. A rung the size of the source skips
/// the filter entirely: resampling a picture to its own dimensions is a full pass that cannot
/// improve it.
pub fn rung(
	original: &Path,
	source: Size,
	target: Size,
	frame_rate: f64,
	audio: bool,
	destination: &Path,
) -> Result<(), Error> {
	let mut arguments: Vec<OsString> =
		["-nostdin", "-v", "error", "-y", "-i"].iter().map(OsString::from).collect();
	arguments.push(original.into());

	if target != source {
		// Lanczos rather than the default bicubic: these are downscales of two to four times,
		// where the default softens exactly the burnt-in text a reader is meant to read.
		arguments.push("-vf".into());
		arguments.push(format!("scale={}:{}:flags=lanczos", target.width, target.height).into());
	}

	let crf = CRF.to_string();
	let preset = PRESET.to_string();
	let keyframes = ((KEYFRAME_SECONDS * frame_rate).round().max(1.0) as u64).to_string();
	for argument in [
		"-c:v",
		ENCODER,
		"-crf",
		crf.as_str(),
		"-preset",
		preset.as_str(),
		"-pix_fmt",
		"yuv420p",
		// Pinned so the codec string's tier is known by construction rather than read back from
		// a field ffprobe does not report. Main tier is what every level below 4.0 allows anyway.
		"-svtav1-params",
		"tier=0",
		"-g",
		keyframes.as_str(),
	] {
		arguments.push(argument.into());
	}

	if audio {
		// AAC rather than Opus, which MP4 also carries. The whole reason the container is MP4 is
		// Apple's hardware AV1 path, and Safari does not play Opus in MP4 -- a silent clip on the
		// devices the container was chosen for. Re-encoded rather than copied because a source
		// may arrive in a codec MP4 cannot hold, and one pass at import is cheap.
		for argument in ["-c:a", "aac", "-b:a", "128k"] {
			arguments.push(argument.into());
		}
	} else {
		arguments.push("-an".into());
	}

	// The index at the front rather than the back, so playback can begin before the file has
	// arrived. A bigger difference to a reader than any codec choice, and not a quality one.
	arguments.push("-movflags".into());
	arguments.push("+faststart".into());
	arguments.push(destination.into());

	tool("ffmpeg", arguments).map(|_| ())
}

/// The first frame, as PNG.
///
/// PNG because it goes straight to the image pipeline, which re-encodes it to AVIF: anything
/// lossy here would be a generation of loss nobody asked for. Written to a pipe rather than a
/// file -- a single image needs no seeking, unlike the MP4 above.
pub fn first_frame(original: &Path) -> Result<Vec<u8>, Error> {
	let mut arguments: Vec<OsString> =
		["-nostdin", "-v", "error", "-i"].iter().map(OsString::from).collect();
	arguments.push(original.into());
	for argument in ["-frames:v", "1", "-c:v", "png", "-f", "image2pipe", "-"] {
		arguments.push(argument.into());
	}
	tool("ffmpeg", arguments)
}
