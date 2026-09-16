//! How loud a clip is, measured once so every clip can be played at the same level.
//!
//! Integrated loudness (LUFS) and true peak (dBTP), both from EBU R128 via ffmpeg's `loudnorm`.
//! Stored, never baked in by re-encoding -- the bytes are the content id. See
//! spec/architecture/video.md, "Every clip plays at one level, and the peak is what caps it",
//! for why loudness rather than peak sets the target, why this is normalisation and not
//! compression, and how the gain is applied at playback.

use super::{Error, tool};
use serde::Deserialize;
use std::ffi::OsStr;
use std::path::Path;

/// One clip's level, as EBU R128 measures it.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Loudness {
	/// Integrated loudness in LUFS. Negative: full scale is 0 and speech lands near -20.
	pub integrated: f64,
	/// True peak in dBTP, also negative below full scale.
	pub peak: f64,
}

/// What `loudnorm` prints when asked for JSON. Every value arrives as a string.
#[derive(Debug, Deserialize)]
struct Measured {
	input_i: String,
	input_tp: String,
}

/// Measure one file, or `None` when it carries no audio to measure.
///
/// A whole pass over the file, which is why it runs once at import and never at playback. It
/// decodes audio only -- `-vn` -- so a 4K clip costs its soundtrack rather than its pictures.
///
/// `loudnorm` rather than `ebur128`: both measure the same thing, and only this one prints a
/// machine-readable summary. Nothing is filtered by it here, because the output is discarded --
/// the filter is being used as the meter it contains.
pub fn loudness(path: &Path, audio: bool) -> Result<Option<Loudness>, Error> {
	if !audio {
		return Ok(None);
	}
	let arguments: Vec<&OsStr> = ["-v", "info", "-nostats", "-hide_banner", "-vn", "-i"]
		.map(OsStr::new)
		.into_iter()
		.chain(std::iter::once(path.as_os_str()))
		.chain(["-af", "loudnorm=print_format=json", "-f", "null", "-"].map(OsStr::new))
		.collect();

	// `loudnorm` prints its summary to stderr, which `tool` only returns on failure, so this one
	// reads the pair itself rather than going through it.
	let output = std::process::Command::new("ffmpeg")
		.args(&arguments)
		.output()
		.map_err(|source| Error::Spawn { tool: "ffmpeg", source })?;
	let text = String::from_utf8_lossy(&output.stderr);
	let Some(measured) = last_object(&text) else {
		return Ok(None);
	};
	let parsed: Measured = serde_json::from_str(&measured).map_err(Error::Unreadable)?;
	let (Ok(integrated), Ok(peak)) = (parsed.input_i.parse(), parsed.input_tp.parse()) else {
		return Ok(None);
	};
	Ok(Some(Loudness { integrated, peak }))
}

/// The last `{ ... }` block in the output.
///
/// ffmpeg writes its own progress and warnings around the summary, and a clip whose filename
/// contains a brace would defeat a first-match search. Scanned rather than regexed because the
/// object is flat -- `loudnorm` prints no nesting -- so a brace counter is the whole parser.
fn last_object(text: &str) -> Option<String> {
	let start = text.rfind('{')?;
	let end = text[start..].find('}')? + start;
	Some(text[start..=end].to_owned())
}

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn reads_the_summary_out_of_a_noisy_log() {
		// ffmpeg writes the measurement among its own chatter, and the numbers arrive as strings.
		let log = "[info] Stream #0:0\n[Parsed_loudnorm_0 @ 0x1] \n{\n\t\"input_i\" : \"-23.73\",\n\t\"input_tp\" : \"-6.16\",\n\t\"input_lra\" : \"9.10\"\n}\nframe= 625\n";
		let object = last_object(log).expect("an object");
		let parsed: Measured = serde_json::from_str(&object).expect("json");
		assert_eq!(parsed.input_i, "-23.73");
		assert_eq!(parsed.input_tp, "-6.16");
	}

	#[test]
	fn a_clip_with_no_audio_is_not_measured() {
		// Silence has no loudness to align, and asking would spend a pass over the file to learn
		// nothing. The record says so with an absent value rather than with a zero, which would
		// read as full scale.
		assert_eq!(loudness(Path::new("/nonexistent.mp4"), false).expect("no run"), None);
	}
}
