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
	codec_name: Option<String>,
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
/// Every track in the container, comma separated, per RFC 6381's `codecs` parameter --
/// `av01.0.08M.08,mp4a.40.2`, not the picture alone. Why naming every track is safe today is
/// spec/architecture/video.md, "One codec, chosen against measured support". Read rather than
/// predicted: the level comes from the encoder's own table of resolution/frame-rate limits, and
/// `tier=0` is passed in rather than guessed, so Main is what was asked for.
pub fn codec_string(path: &Path) -> Result<String, Error> {
	let output = read(&["-show_streams"], path)?;
	let video = output
		.streams
		.iter()
		.find(|stream| stream.codec_type == "video")
		.ok_or_else(|| Error::NoVideoStream(path.to_path_buf()))?;
	let profile = match video.profile.as_deref() {
		Some("High") => 1,
		Some("Professional") => 2,
		_ => 0,
	};
	let level = video.level.unwrap_or_default().max(0);
	let depth =
		if video.pix_fmt.as_deref().is_some_and(|format| format.contains("10")) { 10 } else { 8 };
	let mut codecs = vec![format!("av01.{profile}.{level:02}M.{depth:02}")];
	codecs.extend(output.streams.iter().find(|stream| stream.codec_type == "audio").and_then(audio));
	Ok(codecs.join(","))
}

/// The MPEG-4 audio object type as RFC 6381 spells it, read rather than assumed for the same
/// reason the video level is. `-c:a aac` gets AAC-LC out of ffmpeg's own encoder, which is
/// `mp4a.40.2`; the high-efficiency profiles carry different numbers, and a browser handed the
/// wrong one refuses a file it can in fact play.
fn audio(stream: &Stream) -> Option<String> {
	if stream.codec_name.as_deref() != Some("aac") {
		return None;
	}
	let object_type = match stream.profile.as_deref() {
		Some("HE-AAC") => 5,
		Some("HE-AACv2") => 29,
		_ => 2,
	};
	Some(format!("mp4a.40.{object_type}"))
}

/// The exact number of frames, in three readings from cheapest to dearest.
///
/// Never `duration * rate` rounded: it is the progress bar's denominator, and variable frame
/// rate, a timebase-rounded duration or a trailing partial second each break the multiplication
/// without announcing it. `nb_frames` is what an MP4 already indexed, free; `-count_packets`
/// demuxes without decoding, for a container with no index; `-count_frames` decodes every frame
/// and is the last resort, for a stream whose packets and frames differ.
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
			quarter_turned(&Stream {
				side_data_list: vec![SideData { rotation: Some(degrees) }],
				..Stream::default()
			})
		};
		assert!(turned(90.0));
		assert!(turned(-90.0));
		assert!(turned(270.0));
		assert!(!turned(180.0));
		assert!(!turned(0.0));
		assert!(!quarter_turned(&Stream::default()));
	}

	#[test]
	fn a_source_is_told_about_every_track_in_the_container() {
		// RFC 6381's codecs parameter lists them all. Naming only the video is a claim about half
		// the file, and the half left out is the one that would make a browser refuse.
		let aac = |profile: Option<&str>| {
			audio(&Stream {
				codec_name: Some("aac".to_owned()),
				profile: profile.map(str::to_owned),
				..Stream::default()
			})
		};
		assert_eq!(aac(Some("LC")).as_deref(), Some("mp4a.40.2"));
		assert_eq!(aac(Some("HE-AAC")).as_deref(), Some("mp4a.40.5"));
		assert_eq!(aac(Some("HE-AACv2")).as_deref(), Some("mp4a.40.29"));
		// A track that is not AAC is left out rather than guessed at.
		assert_eq!(audio(&Stream::default()), None);
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
