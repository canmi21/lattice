//! A caption track cut to an excerpt, and stored like every other object.
//!
//! Cues are shifted onto the clip's own timeline rather than kept on the original's, and a
//! straddling cue clamps rather than drops. See spec/architecture/video/captions.md, "A caption
//! track is cut to the clip and shifted onto its timeline", for why -- the browser's `<track>`
//! element cannot subtract, so shifting once here beats parsing WebVTT in every reader.
//!
//! Everything but the timing line is copied verbatim, cue settings included -- re-deriving
//! `position`, `line` and `align` would invent a layout already stated. `NOTE` comments are
//! dropped, since they describe a track this file is no longer; so is the header's
//! `X-TIMESTAMP-MAP`, which aligns cues to an MPEG-TS clock a standalone file lacks -- Apple's
//! track carries `MPEGTS:900000`, ten seconds, a player that honoured it would run that far out.

pub mod run;

use crate::image::manifest::Track;
use crate::image::{cid, store};
use std::path::Path;

/// What a caption track is, in the one spelling a record carries.
///
/// Only ever WebVTT -- a `<track>` element takes one format, so `store::caption_path` fixes the
/// extension itself rather than taking an argument that could only hold one value. The format is
/// spelled in two places with nothing between them but agreement: `.vtt` in the path the store
/// builds, `text/vtt` in the record written here. The test at the bottom holds the two in step.
const MIME: &str = "text/vtt";

/// The range of the original the clip was cut from, in seconds.
#[derive(Debug, Clone, Copy)]
pub struct Window {
	pub from: f64,
	pub to: f64,
}

impl Window {
	fn length(self) -> f64 {
		self.to - self.from
	}

	/// Whether a cue is on screen at any instant of the window.
	///
	/// Strict at both ends. A cue that ends exactly as the clip begins is already gone, and one
	/// that begins exactly as it ends never appears; keeping either would add a cue that renders
	/// for no time at all.
	fn shows_during(self, start: f64, end: f64) -> bool {
		start < self.to && end > self.from
	}
}

/// What a track is, in the vocabulary WebVTT and `<track kind>` share.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Kind {
	/// Dialogue and the sounds that carry meaning, for a reader who cannot hear them.
	Captions,
	/// Dialogue only, for a reader who cannot follow the language.
	Subtitles,
	/// What is on screen, for a reader who cannot see it.
	Descriptions,
}

impl Kind {
	/// The three words `<track kind>` takes, and nothing else.
	///
	/// Not `#[derive(ValueEnum)]`: this is a domain type and the command line is one of two
	/// adapters over it. See spec/architecture/cms.md.
	pub fn parse(name: &str) -> Option<Self> {
		match name.trim().to_ascii_lowercase().as_str() {
			"captions" => Some(Self::Captions),
			"subtitles" => Some(Self::Subtitles),
			"descriptions" => Some(Self::Descriptions),
			_ => None,
		}
	}

	pub const CHOICES: &'static str = "captions, subtitles or descriptions";

	pub fn as_str(self) -> &'static str {
		match self {
			Self::Captions => "captions",
			Self::Subtitles => "subtitles",
			Self::Descriptions => "descriptions",
		}
	}
}

#[derive(Debug, thiserror::Error)]
pub enum Error {
	#[error("not WebVTT: nothing begins this file with the WEBVTT signature")]
	Signature,
	#[error("could not read a cue's timing: `{0}`")]
	Timing(String),
	#[error("an excerpt from {from}s to {to}s is not a window")]
	Window { from: f64, to: f64 },
	/// No default, and this is the reason rather than strictness for its own sake.
	///
	/// `kind` is what a reader picks a track by, and the reader picking by it is the one a wrong
	/// value costs most: someone deaf takes a track labelled `captions`, gets subtitles, loses every
	/// sound the film makes, and is told nothing -- the track plays, so nothing reports a fault.
	/// `infer_kind` only knows when a track transcribes sound; everything else has to be told, and
	/// meeting that as a compile error asking for a value is the intended experience.
	#[error("nothing in this track says whether it captions, subtitles or describes; pass the kind")]
	UnknownKind,
	#[error("could not write: {0}")]
	Write(#[source] std::io::Error),
}

/// Cut one track to a window, store it, and describe it for the video's record.
///
/// What comes back is the `Track` to add to `Video::tracks`, carrying the cut file's own content
/// id. `None` means no cue is on screen during the window -- a silent excerpt -- and nothing is
/// written, because a track with no cues renders exactly as no track does.
///
/// Reading the file is the caller's: this is handed text so it can be tested without one.
pub fn publish(
	vtt: &str,
	window: Window,
	language: &str,
	kind: Option<Kind>,
	public: &Path,
) -> Result<Option<Track>, Error> {
	// Settled before anything is cut or written, so an untellable kind costs an object nobody
	// can name rather than being discovered after the bytes are on disk.
	let kind = kind.or_else(|| infer_kind(vtt)).ok_or(Error::UnknownKind)?;
	let Some(text) = cut(vtt, window)? else {
		return Ok(None);
	};

	let bytes = text.as_bytes();
	let id = cid(bytes);
	store::write(&store::caption_path(public, &id), bytes).map_err(Error::Write)?;

	Ok(Some(Track {
		content: id,
		mime: MIME.to_string(),
		language: language.to_string(),
		kind: kind.as_str().to_string(),
		bytes: bytes.len() as u64,
	}))
}

/// The cues on screen during the window, on the clip's own timeline.
///
/// `None` when none of them are.
pub fn cut(vtt: &str, window: Window) -> Result<Option<String>, Error> {
	// `is_finite` rather than a bare comparison, because every comparison against a NaN is false
	// and the window would sail through to produce a track whose every cue timed to NaN.
	let length = window.length();
	if !length.is_finite() || length <= 0.0 {
		return Err(Error::Window { from: window.from, to: window.to });
	}
	let text = normalise(vtt);
	let blocks = blocks(&text);
	let signature = *blocks.first().and_then(|block| block.first()).ok_or(Error::Signature)?;
	// A space or a tab may follow the signature, carrying a free-text title of the track.
	if !(signature == "WEBVTT"
		|| signature.starts_with("WEBVTT ")
		|| signature.starts_with("WEBVTT\t"))
	{
		return Err(Error::Signature);
	}

	// The rest of the header block is not carried; see the module note.
	let mut out = String::from(signature);
	out.push('\n');
	let mut cues = 0usize;

	for block in blocks.iter().skip(1) {
		let Some(&first) = block.first() else { continue };
		if first == "NOTE" || first.starts_with("NOTE ") || first.starts_with("NOTE\t") {
			continue;
		}
		if first == "STYLE" || first == "REGION" {
			// A cue's `region:` setting names one of these, so dropping them would leave the
			// settings that survive pointing at nothing.
			out.push('\n');
			for line in block {
				out.push_str(line);
				out.push('\n');
			}
			continue;
		}

		// A block with no arrow is not a cue and not a header block a renderer knows; a
		// conformant parser discards it, and so does this.
		let Some(at) = block.iter().position(|line| line.contains("-->")) else { continue };
		let Some(&timing) = block.get(at) else { continue };
		let (start, end, settings) = parse_timing(timing)?;
		if !window.shows_during(start, end) {
			continue;
		}
		let from = millis((start - window.from).max(0.0));
		let to = millis((end - window.from).min(window.length()));
		// Clamped to nothing: only a rounded millisecond fell inside the window, never on
		// screen long enough to read, and WebVTT requires an end strictly after its start.
		if to <= from {
			continue;
		}

		out.push('\n');
		for line in block.iter().take(at) {
			out.push_str(line);
			out.push('\n');
		}
		out.push_str(&stamp(from));
		out.push_str(" --> ");
		out.push_str(&stamp(to));
		if !settings.is_empty() {
			out.push(' ');
			out.push_str(settings);
		}
		out.push('\n');
		for line in block.iter().skip(at + 1) {
			out.push_str(line);
			out.push('\n');
		}
		cues += 1;
	}

	Ok((cues > 0).then_some(out))
}

/// What a cut file amounts to, for the person who asked for it.
#[derive(Debug, PartialEq)]
pub struct Summary {
	pub cues: usize,
	/// Seconds of the clip with a cue on screen.
	pub covered: f64,
	/// The first cue's text, on one line.
	pub opening: Option<String>,
}

/// Read a cut file back for reporting. Nothing here is enforced.
///
/// The coverage is a union, not a sum: cues overlap in a track written for two speakers, and
/// adding them would report more coverage than the clip has room for. `opening` exists because
/// this module cannot check which recording a track transcribes -- see
/// spec/architecture/video/captions.md, "Neither of those is a check on the track", and [`run`].
pub fn summarise(vtt: &str) -> Summary {
	let text = normalise(vtt);
	let mut spans: Vec<(f64, f64)> = Vec::new();
	let mut opening = None;
	for block in blocks(&text).iter().skip(1) {
		let Some(at) = block.iter().position(|line| line.contains("-->")) else { continue };
		let Some(&timing) = block.get(at) else { continue };
		let Ok((start, end, _)) = parse_timing(timing) else { continue };
		if opening.is_none() {
			let text = block.iter().skip(at + 1).copied().collect::<Vec<_>>().join(" ");
			let text = text.trim();
			if !text.is_empty() {
				opening = Some(text.to_owned());
			}
		}
		spans.push((start, end));
	}

	let cues = spans.len();
	spans.sort_by(|left, right| left.0.total_cmp(&right.0));
	let mut covered = 0.0;
	let mut reached = f64::NEG_INFINITY;
	for (start, end) in spans {
		let from = start.max(reached);
		if end > from {
			covered += end - from;
			reached = end;
		}
	}
	Summary { cues, covered, opening }
}

/// The one thing a WebVTT file can be read to say about itself.
///
/// A payload line that is nothing but an upper-case bracketed run -- `[EXPLOSION]`, or
/// `(DOOR SLAMS)` in the houses that use parentheses -- is captions, since only a captions
/// track transcribes non-speech. The inference runs one way only: its absence proves nothing,
/// since a descriptions track's narration reads exactly like dialogue. Read from the whole
/// track, not the cut -- the kind belongs to the track, not to an excerpt of it.
pub fn infer_kind(vtt: &str) -> Option<Kind> {
	let text = normalise(vtt);
	for block in blocks(&text).iter().skip(1) {
		let Some(&first) = block.first() else { continue };
		if first == "STYLE" || first == "REGION" || first.starts_with("NOTE") {
			continue;
		}
		let Some(at) = block.iter().position(|line| line.contains("-->")) else { continue };
		if block.iter().skip(at + 1).any(|line| transcribes_a_sound(line)) {
			return Some(Kind::Captions);
		}
	}
	None
}

/// Whether a payload line is a sound written down rather than a line spoken.
///
/// Whole-line only: inline markers exist, but so do bracketed asides inside dialogue, and
/// missing one only means this asks to be told -- the safe direction to be wrong in. The upper
/// case does real work: this track writes speaker labels the same way -- `[Woman:]`, `[Siri:]`
/// -- and a label is not a sound, so reading one as captions evidence would answer a question
/// this cannot see. Mixed case is the whole of what separates the two.
fn transcribes_a_sound(line: &str) -> bool {
	let line = line.trim();
	line
		.strip_prefix('[')
		.and_then(|rest| rest.strip_suffix(']'))
		.or_else(|| line.strip_prefix('(').and_then(|rest| rest.strip_suffix(')')))
		.is_some_and(|inner| {
			inner.chars().any(char::is_alphabetic) && !inner.chars().any(char::is_lowercase)
		})
}

/// One byte order mark and both spellings of a line ending, gone.
fn normalise(vtt: &str) -> String {
	vtt.strip_prefix('\u{feff}').unwrap_or(vtt).replace("\r\n", "\n").replace('\r', "\n")
}

/// The file split on blank lines, which is the only separator WebVTT has.
fn blocks(text: &str) -> Vec<Vec<&str>> {
	let mut out = Vec::new();
	let mut current: Vec<&str> = Vec::new();
	for line in text.lines() {
		if line.trim().is_empty() {
			if !current.is_empty() {
				out.push(std::mem::take(&mut current));
			}
		} else {
			current.push(line);
		}
	}
	if !current.is_empty() {
		out.push(current);
	}
	out
}

/// Start, end, and whatever settings followed, untouched.
fn parse_timing(line: &str) -> Result<(f64, f64, &str), Error> {
	let malformed = || Error::Timing(line.to_string());
	let (left, right) = line.split_once("-->").ok_or_else(malformed)?;
	let start = seconds(left.trim()).ok_or_else(malformed)?;
	let right = right.trim_start();
	let (end, settings) = match right.find(char::is_whitespace) {
		Some(at) => (right.get(..at).unwrap_or_default(), right.get(at..).unwrap_or_default().trim()),
		None => (right, ""),
	};
	Ok((start, seconds(end).ok_or_else(malformed)?, settings))
}

/// `[HH:]MM:SS.mmm`, lenient about digit counts because a hand-edited track will not always
/// have three of them.
fn seconds(stamp: &str) -> Option<f64> {
	let mut parts = stamp.split(':').rev();
	let seconds: f64 = parts.next()?.trim().parse().ok()?;
	let minutes: f64 = parts.next()?.trim().parse().ok()?;
	let hours: f64 = match parts.next() {
		Some(value) => value.trim().parse().ok()?,
		None => 0.0,
	};
	if parts.next().is_some() {
		return None;
	}
	Some(hours * 3600.0 + minutes * 60.0 + seconds)
}

fn millis(seconds: f64) -> u64 {
	(seconds * 1000.0).round().max(0.0) as u64
}

/// Always `HH:MM:SS.mmm`. WebVTT allows the hours off, and one spelling for every cue is worth
/// more than the three characters.
fn stamp(millis: u64) -> String {
	let (hours, minutes) = (millis / 3_600_000, millis / 60_000 % 60);
	let (seconds, rest) = (millis / 1000 % 60, millis % 1000);
	format!("{hours:02}:{minutes:02}:{seconds:02}.{rest:03}")
}

#[cfg(test)]
mod tests {
	use super::*;

	/// What `store::caption_path` must end a stored track with. See the note beside `MIME`.
	const EXTENSION: &str = "vtt";

	/// The shape of the track this was built against, cut down to what each test needs: an
	/// `X-TIMESTAMP-MAP` header, cue settings on every line, a sound written down, and the cue
	/// that straddles 2:18. The real file is not in the repository and never will be.
	const TRACK: &str = "WEBVTT\n\
		X-TIMESTAMP-MAP=MPEGTS:900000,LOCAL:00:00:00.000\n\
		\n\
		NOTE this comment is about the whole event\n\
		\n\
		00:00:34.398 --> 00:00:36.133 position:50.0%,center line:96.5%,end align:center\n\
		[EXPLOSION]\n\
		\n\
		00:02:13.697 --> 00:02:18.335 position:50.0%,center line:96.5%,end align:center\n\
		A car drives down the highway,\n\
		then it disappears into a tunnel.\n\
		\n\
		00:02:19.036 --> 00:02:20.871 position:50.0%,center\n\
		Cut to an interior.\n\
		\n\
		00:02:39.389 --> 00:02:42.025\n\
		I am so thrilled to be here today.\n";

	/// 2:18 to 2:42, the excerpt the track was cut for.
	fn window() -> Window {
		Window { from: 138.0, to: 162.0 }
	}

	#[test]
	fn keeps_a_cue_that_is_already_on_screen_when_the_clip_begins() {
		// Overlap, not "starts inside". This cue began at 2:13.697 and the reader is still
		// hearing it at 2:18; filtering on the start would drop the sentence the clip opens on.
		let out = cut(TRACK, window()).expect("cut").expect("cues");
		assert!(out.contains("A car drives down the highway,"));
		assert!(out.contains("00:00:00.000 --> 00:00:00.335"));
	}

	#[test]
	fn clamps_the_last_cue_to_the_length_of_the_clip() {
		// It runs 25ms past 2:42. A cue may not claim time the file does not have.
		let out = cut(TRACK, window()).expect("cut").expect("cues");
		assert!(out.contains("00:00:21.389 --> 00:00:24.000"));
	}

	#[test]
	fn leaves_out_a_cue_that_is_gone_before_the_clip_starts() {
		let out = cut(TRACK, window()).expect("cut").expect("cues");
		assert!(!out.contains("[EXPLOSION]"));
		assert_eq!(out.matches("-->").count(), 3);
	}

	#[test]
	fn carries_cue_settings_through_untouched() {
		// These lift a caption clear of the player's chrome. Re-deriving them would be inventing
		// a layout the track already states.
		let out = cut(TRACK, window()).expect("cut").expect("cues");
		assert!(out.contains("position:50.0%,center line:96.5%,end align:center"));
		assert!(out.contains("00:00:01.036 --> 00:00:02.871 position:50.0%,center\n"));
	}

	#[test]
	fn drops_the_timestamp_map_and_the_comments() {
		// MPEGTS:900000 is ten seconds against a presentation clock a standalone file has no
		// access to, so a player that honoured it would run the whole track ten seconds out.
		let out = cut(TRACK, window()).expect("cut").expect("cues");
		assert!(!out.contains("X-TIMESTAMP-MAP"));
		assert!(!out.contains("NOTE"));
		assert!(out.starts_with("WEBVTT\n"));
	}

	#[test]
	fn keeps_the_blocks_a_cue_setting_can_point_at() {
		// `region:` on a surviving cue names a REGION block; dropping those leaves the setting
		// pointing at nothing.
		let track = "WEBVTT\n\nREGION\nid:top\nwidth:40%\n\nSTYLE\n::cue { color: peachpuff }\n\n\
			00:02:20.000 --> 00:02:21.000 region:top\nCut to an interior.\n";
		let out = cut(track, window()).expect("cut").expect("cues");
		assert!(out.contains("REGION\nid:top\nwidth:40%"));
		assert!(out.contains("::cue { color: peachpuff }"));
	}

	#[test]
	fn keeps_a_cue_identifier() {
		let track = "WEBVTT\n\n47\n00:02:20.000 --> 00:02:21.000\nCut to an interior.\n";
		let out = cut(track, window()).expect("cut").expect("cues");
		assert!(out.contains("\n47\n00:00:02.000 --> 00:00:03.000\n"));
	}

	#[test]
	fn reads_a_stamp_with_the_hours_left_off() {
		// WebVTT allows both, and only one of them is written back out.
		let track = "WEBVTT\n\n02:20.000 --> 02:21.000\nCut to an interior.\n";
		let out = cut(track, window()).expect("cut").expect("cues");
		assert!(out.contains("00:00:02.000 --> 00:00:03.000"));
	}

	#[test]
	fn survives_a_byte_order_mark_and_windows_line_endings() {
		let track = format!("\u{feff}{}", TRACK.replace('\n', "\r\n"));
		let out = cut(&track, window()).expect("cut").expect("cues");
		assert!(out.starts_with("WEBVTT\n"));
		assert_eq!(out.matches("-->").count(), 3);
		assert!(!out.contains('\r'));
	}

	#[test]
	fn a_summary_counts_the_cues_and_quotes_the_first_of_them() {
		let out = cut(TRACK, window()).expect("cut").expect("cues");
		let summary = summarise(&out);
		assert_eq!(summary.cues, 3);
		// 0.335 + 1.835 + 2.611, and none of the three overlap.
		assert!((summary.covered - 4.781).abs() < 0.001, "{summary:?}");
		// Both lines of the cue, joined: it is quoted so a person can see whether the words
		// belong to the clip, which is the one thing no test can answer.
		assert_eq!(
			summary.opening.as_deref(),
			Some("A car drives down the highway, then it disappears into a tunnel.")
		);
	}

	#[test]
	fn coverage_does_not_count_a_second_speaker_twice() {
		// Two cues on screen at once is how a track writes an interruption. Adding them would
		// report more coverage than the clip has room for.
		let both = "WEBVTT\n\n\
			00:00:00.000 --> 00:00:04.000\nYou want a great opening scene?\n\n\
			00:00:02.000 --> 00:00:06.000\nHere's one.\n";
		let summary = summarise(both);
		assert_eq!(summary.cues, 2);
		assert_eq!(summary.covered, 6.0);
	}

	#[test]
	fn an_excerpt_nothing_is_said_over_has_no_track() {
		// A file with no cues renders exactly as no file does, so it is not worth an object.
		assert!(cut(TRACK, Window { from: 300.0, to: 320.0 }).expect("cut").is_none());
	}

	#[test]
	fn refuses_something_that_is_not_a_track_and_something_that_is_not_a_window() {
		assert!(matches!(cut("just some text\n", window()), Err(Error::Signature)));
		assert!(matches!(cut(TRACK, Window { from: 10.0, to: 10.0 }), Err(Error::Window { .. })));
		assert!(matches!(cut(TRACK, Window { from: 20.0, to: 10.0 }), Err(Error::Window { .. })));
	}

	#[test]
	fn reads_captions_off_a_sound_and_reads_nothing_off_dialogue() {
		// [EXPLOSION] is a sound written down for someone who cannot hear it, which no other
		// kind of track does. Dialogue on its own separates nothing, and the answer there is to
		// ask rather than to pick the likeliest.
		assert_eq!(infer_kind(TRACK), Some(Kind::Captions));
		let dialogue = "WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHello and welcome to Apple Park.\n";
		assert_eq!(infer_kind(dialogue), None);
	}

	#[test]
	fn does_not_read_a_bracketed_aside_inside_a_line_as_a_sound() {
		let aside = "WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHe went to [REDACTED] and back.\n";
		assert_eq!(infer_kind(aside), None);
	}

	#[test]
	fn does_not_read_a_speaker_label_as_a_sound() {
		// This track writes speaker labels exactly as it writes sounds -- bracketed, on a line of
		// their own -- and only the case tells them apart. Subtitles carry speaker labels too, so
		// reading `[Woman:]` as evidence of captions would answer a question this cannot see.
		let labelled = "WEBVTT\n\n\
			00:09:22.860 --> 00:09:24.795\n[Woman:]\nSiri, what did mom mention\n\n\
			00:09:52.322 --> 00:09:55.592\n[Siri:] Adding it to your list.\n";
		assert_eq!(infer_kind(labelled), None);
	}

	#[test]
	fn a_track_that_cannot_say_what_it_is_is_asked_about_rather_than_guessed() {
		let dialogue = "WEBVTT\n\n00:02:20.000 --> 00:02:21.000\nCut to an interior.\n";
		let temporary = tempfile::tempdir().expect("temp");
		let error = publish(dialogue, window(), "en", None, temporary.path());
		assert!(matches!(error, Err(Error::UnknownKind)));
		// Nothing is written on the way to that answer.
		assert!(!temporary.path().join("captions").exists());
	}

	#[test]
	fn stores_the_cut_under_its_own_content_id_and_records_it() {
		let temporary = tempfile::tempdir().expect("temp");
		let public = temporary.path();
		let track = publish(TRACK, window(), "en", None, public).expect("publish").expect("cues");
		let id = &track.content;

		let stored = store::caption_path(public, id);
		assert!(stored.is_file());
		// The store fixes the extension and this module fixes the mime, in two files that never
		// consult each other. This is the only thing holding the two halves of "WebVTT" together.
		assert_eq!(stored.extension().and_then(|value| value.to_str()), Some(EXTENSION));
		let bytes = std::fs::read(&stored).expect("stored track");
		// The key is the hash of the cut file, not of the track it came from.
		assert_eq!(id, &cid(&bytes));
		assert_ne!(id, &cid(TRACK.as_bytes()));
		assert_eq!(track.bytes, bytes.len() as u64);
		assert_eq!(track.mime, "text/vtt");
		assert_eq!(track.language, "en");
		assert_eq!(track.kind, "captions");
	}

	#[test]
	fn an_explicit_kind_beats_what_the_file_looks_like() {
		// A descriptions track leaves no trace of being one, so what it is told is the only
		// thing that can be right.
		let temporary = tempfile::tempdir().expect("temp");
		let track = publish(TRACK, window(), "en", Some(Kind::Descriptions), temporary.path())
			.expect("publish")
			.expect("cues");
		assert_eq!(track.kind, "descriptions");
	}
}
