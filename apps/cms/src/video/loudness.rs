//! How loud a clip is, measured once so every clip can be played at the same level.
//!
//! ## Loudness sets the target and the true peak caps it
//!
//! Two numbers, because one of them cannot do the job alone.
//!
//! **Integrated loudness** is EBU R128's, in LUFS: K-weighted and gated, built to agree with what
//! an ear calls equally loud. It is not an arithmetic average -- the weighting follows the ear's
//! frequency response and the gate drops silence, which is what stops a clip with long pauses
//! from reading as quiet. It answers "how loud is this", and the difference between it and a
//! chosen target is the gain that makes two clips match.
//!
//! **True peak** is the highest sample the signal actually reaches, in dBTP, and it is the ceiling
//! that gain has to respect. Raising a quiet clip to the target can push its loudest instant past
//! full scale, which clips -- audibly, and unfixably. So the applied gain is the smaller of what
//! the loudness asks for and what the peak allows, and a clip that cannot reach the target lands
//! under it instead of distorting.
//!
//! ## What this is not
//!
//! **Not compression.** One constant multiplies the whole clip, so every peak and every valley
//! moves by the same decibel and the dynamic range is exactly what it was. Pushing the loud parts
//! down to a ceiling and leaving the quiet parts alone is a limiter, and a limiter is the thing
//! that changes how a recording sounds. This does not do it.
//!
//! **Not a re-encode.** The numbers are stored and the gain is applied at playback. Re-encoding
//! would change the bytes, and the bytes are the content id: every rung, every article reference
//! and every object in the bucket is addressed by it. A number in a record can also be re-tuned
//! later, which a baked-in gain cannot.

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
