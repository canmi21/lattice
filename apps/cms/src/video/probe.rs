//! What a clip is, read out of the file rather than assumed.
//!
//! `ffprobe` answers in JSON and is parsed with serde, the same shape `licenses::cargo` uses
//! for `cargo metadata`. CSV is deliberately not used: ffprobe prints `-show_entries` fields in
//! the stream's own order rather than the order they were asked for, so a positional reader
//! silently swaps `level` and `pix_fmt` the day a stream carries a different field set.

use super::{Error, tool};
use serde::Deserialize;
use std::ffi::OsStr;
use std::path::Path;

/// Everything the record needs about the original, and nothing derived from it.
#[derive(Debug, Clone, PartialEq)]
pub struct Probe {
	/// As displayed: a rotated phone video reports its stored dimensions and a display matrix,
	/// and the ladder has to see the picture a reader sees.
	pub width: u32,
	pub height: u32,
	pub duration: f64,
	pub frame_rate: f64,
	/// Counted, never `duration * rate`. See `frames`.
	pub frames: u64,
	pub audio: bool,
}

#[derive(Debug, Deserialize)]
struct Output {
	#[serde(default)]
	streams: Vec<Stream>,
	#[serde(default)]
	format: Format,
}

#[derive(Debug, Default, Deserialize)]
struct Stream {
	#[serde(default)]
	codec_type: String,
	width: Option<u32>,
	height: Option<u32>,
	/// Frames over the whole file rather than the container's nominal base rate. Variable frame
	/// rate makes the two differ, and the average is the one that describes what was recorded.
	avg_frame_rate: Option<String>,
	r_frame_rate: Option<String>,
	/// A string in ffprobe's JSON, and absent for a container that does not index its frames.
	nb_frames: Option<String>,
	nb_read_packets: Option<String>,
	nb_read_frames: Option<String>,
	duration: Option<String>,
	profile: Option<String>,
	level: Option<i64>,
	pix_fmt: Option<String>,
	#[serde(default)]
	side_data_list: Vec<SideData>,
}

#[derive(Debug, Default, Deserialize)]
struct Format {
	duration: Option<String>,
}

#[derive(Debug, Deserialize)]
struct SideData {
	rotation: Option<f64>,
}

/// Read one clip.
pub fn probe(path: &Path) -> Result<Probe, Error> {
	let output = read(&["-show_streams", "-show_format"], path)?;
	let video = output
		.streams
		.iter()
		.find(|stream| stream.codec_type == "video")
		.ok_or_else(|| Error::NoVideoStream(path.to_path_buf()))?;

	let stored = (video.width.unwrap_or_default(), video.height.unwrap_or_default());
	// A quarter turn in the display matrix means the file stores the picture on its side. The
	// ladder picks a tier by height, so reading the stored height there would hand a portrait
	// clip the tier meant for a landscape one.
	let (width, height) = if quarter_turned(video) { (stored.1, stored.0) } else { stored };

	let duration = video
		.duration
		.as_deref()
		.or(output.format.duration.as_deref())
		.and_then(|value| value.parse::<f64>().ok())
		.unwrap_or_default();

	let frame_rate = video
		.avg_frame_rate
		.as_deref()
		.and_then(rational)
		.filter(|rate| *rate > 0.0)
		.or_else(|| video.r_frame_rate.as_deref().and_then(rational))
		.unwrap_or_default();

	let audio = output.streams.iter().any(|stream| stream.codec_type == "audio");
	Ok(Probe { width, height, duration, frame_rate, frames: frames(path, video)?, audio })
}

/// The full codec string a `<source>` element has to be told, read back off the encoded rung.
///
/// Read rather than predicted. The level is chosen by the encoder from the resolution and the
/// frame rate against a table of limits, and a hand-written copy of that table is a second
/// implementation of the one thing here a browser acts on -- it either decodes the file or it
/// shows nothing. The tier is the one part not read: `tier=0` is passed to the encoder, so Main
/// is what was asked for rather than what was guessed.
pub fn codec_string(path: &Path) -> Result<String, Error> {
	let output = read(&["-select_streams", "v:0", "-show_streams"], path)?;
	let video = output
		.streams
		.first()
		.ok_or_else(|| Error::NoVideoStream(path.to_path_buf()))?;
	let profile = match video.profile.as_deref() {
		Some("High") => 1,
		Some("Professional") => 2,
		_ => 0,
	};
	let level = video.level.unwrap_or_default().max(0);
	let depth = if video.pix_fmt.as_deref().is_some_and(|format| format.contains("10")) { 10 } else { 8 };
	Ok(format!("av01.{profile}.{level:02}M.{depth:02}"))
}

/// The exact number of frames, in three readings from cheapest to dearest.
///
/// **Never `duration * rate` rounded.** This is the denominator of the progress bar the
/// software-decode path shows, and a bar that finishes at 98% or runs past its end is worse
/// than no bar: the reader is told the wait is over when it is not. Variable frame rate,
/// a duration rounded to the container's timebase and a trailing partial second each break
/// the multiplication, and none of them announce it.
///
/// `nb_frames` is what an MP4 already indexed and costs nothing. `-count_packets` demuxes but
/// does not decode, which is what a container with no index needs. `-count_frames` decodes
/// every frame and is the last resort, for a stream whose packets and frames differ.
fn frames(path: &Path, video: &Stream) -> Result<u64, Error> {
	if let Some(count) = count(video.nb_frames.as_deref()) {
		return Ok(count);
	}
	let packets = read(&["-select_streams", "v:0", "-count_packets", "-show_streams"], path)?;
	if let Some(count) = packets.streams.first().and_then(|s| count(s.nb_read_packets.as_deref())) {
		return Ok(count);
	}
	let decoded = read(&["-select_streams", "v:0", "-count_frames", "-show_streams"], path)?;
	decoded
		.streams
		.first()
		.and_then(|s| count(s.nb_read_frames.as_deref()))
		.ok_or_else(|| Error::NoFrameCount(path.to_path_buf()))
}

fn count(value: Option<&str>) -> Option<u64> {
	value.and_then(|text| text.parse::<u64>().ok()).filter(|count| *count > 0)
}

fn read(arguments: &[&str], path: &Path) -> Result<Output, Error> {
	let mut all: Vec<&OsStr> = ["-v", "error", "-of", "json"].map(OsStr::new).to_vec();
	all.extend(arguments.iter().copied().map(OsStr::new));
	all.push(path.as_os_str());
	serde_json::from_slice(&tool("ffprobe", all)?).map_err(Error::Unreadable)
}

/// Whether the display matrix turns the picture onto its other axis.
///
/// Any odd multiple of ninety degrees, and the sign is not read: a clip rotated -90 and one
/// rotated 270 are the same picture and both swap the axes.
fn quarter_turned(video: &Stream) -> bool {
	video.side_data_list.iter().filter_map(|side| side.rotation).any(|degrees| {
		let turns = (degrees / 90.0).round();
		(degrees - turns * 90.0).abs() < 1.0 && (turns as i64).rem_euclid(2) == 1
	})
}

/// `30000/1001` as a number. ffprobe writes every rate as a rational, and `0/0` is how it says
/// it does not know.
fn rational(text: &str) -> Option<f64> {
	let (numerator, denominator) = text.split_once('/')?;
	let denominator: f64 = denominator.trim().parse().ok()?;
	if denominator == 0.0 {
		return None;
	}
	Some(numerator.trim().parse::<f64>().ok()? / denominator)
}

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn reads_a_rate_as_the_rational_ffprobe_writes() {
		assert!((rational("30000/1001").expect("rate") - 29.970_029_97).abs() < 1e-6);
		assert_eq!(rational("25/1"), Some(25.0));
		// `0/0` is ffprobe saying it does not know, not a rate of zero.
		assert_eq!(rational("0/0"), None);
		assert_eq!(rational("25"), None);
	}

	#[test]
	fn a_quarter_turn_swaps_the_axes_whichever_way_it_turns() {
		let turned = |degrees: f64| {
			quarter_turned(&Stream { side_data_list: vec![SideData { rotation: Some(degrees) }], ..Stream::default() })
		};
		assert!(turned(90.0));
		assert!(turned(-90.0));
		assert!(turned(270.0));
		assert!(!turned(180.0));
		assert!(!turned(0.0));
		assert!(!quarter_turned(&Stream::default()));
	}

	#[test]
	fn a_frame_count_of_zero_is_not_a_count() {
		// An MP4 that carries the field but never filled it reads as `0`, and taking that would
		// leave the progress bar dividing by nothing.
		assert_eq!(count(Some("0")), None);
		assert_eq!(count(Some("541")), Some(541));
		assert_eq!(count(Some("N/A")), None);
		assert_eq!(count(None), None);
	}
}
