//! A caption track cut to an excerpt, and stored like every other object.
//!
//! Cutting is a filter and a subtraction. The filter keeps every cue that is on screen during
//! the window rather than every cue that begins inside it. At 2:18 of the September 2026 event
//! the line that began at 2:13.697 is still up; a clip that opens there and drops that cue drops
//! exactly the sentence the reader is hearing as the picture arrives.
//!
//! ## The cues are stored shifted, and the browser is the reason
//!
//! spec/architecture/video.md leaves this open: shifted, so the file stands alone against the
//! clip, or on the original's timeline, so the correspondence survives and every consumer
//! subtracts. Shifted -- because the consumer that matters cannot subtract. A `<track>` element
//! hands its `src` to the user agent's own text-track engine, and between the two there is no
//! offset attribute and no hook. A track left on the original's timeline could only be rendered
//! by fetching it with script, parsing WebVTT in the browser and rebuilding it cue by cue as a
//! `TextTrack` -- a parser shipped to a reader to undo arithmetic this machine could do once,
//! against spec/architecture/delivery.md's whole argument about payload. And a reader whose
//! script did not run would not lose captions, which announces itself; they would get captions
//! displaced by two minutes and eighteen seconds, which does not.
//!
//! What that gives up is the correspondence: a stored track no longer says where in the original
//! it came from. It is given up only in this file. `excerpt: { from, to }` in `data/media.yaml`
//! is that offset, written by the person who chose the window, so the original timing is an
//! addition away rather than a guess -- and the excerpt is already the one fact about a clip that
//! nothing can recover from the cut file, which is why it is authored there. The real cost is
//! that the two now have to agree: change the window and the track must be cut again, exactly as
//! the video rungs must be encoded again, so it adds no coupling that was not already there.
//!
//! ## A cue straddling the start is clamped, and that is the true statement
//!
//! Subtracting the window's start from a cue that began before it gives a negative time, and
//! WebVTT has no such thing -- the timestamp grammar is unsigned, so a parser drops the cue or
//! the file. So the choice is between dropping the line and clamping it to zero, and clamping is
//! not a repair, it is the accurate reading: the cue *is* on screen at the instant the clip
//! begins. Zero says so. The end is clamped to the clip's length for the same reason inverted --
//! a cue must not claim time the file does not have.
//!
//! Clamping can leave a cue with nothing left, when only a rounded millisecond of it fell inside
//! the window. That one is dropped: a line on screen for under a millisecond was never read, and
//! WebVTT requires an end strictly after its start.
//!
//! ## What is carried through and what is not
//!
//! Everything but the timing line is copied verbatim, cue settings included. `position`, `line`
//! and `align` are what lift a caption clear of the player's chrome, and re-deriving them would
//! be inventing a layout the track already states. Two things are deliberately not carried:
//! `NOTE` comments, which are about a track this file is no longer, and the header's
//! `X-TIMESTAMP-MAP`, which aligns cues to an MPEG-TS presentation clock that a standalone file
//! played by `<video>` does not have -- Apple's track carries `MPEGTS:900000`, ten seconds, and
//! a player that honoured it against a clip would be ten seconds out.

use crate::image::manifest::Caption;
use crate::image::{cid, store};
use std::path::Path;

/// The one type a caption track is ever stored as, spelled twice because two things ask.
///
/// `caption_path` takes an extension so it matches its two siblings, which need one -- an image
/// has more than one format and the CDN reads the extension as the request. A caption does not,
/// so the argument only ever takes this value and is therefore somewhere a wrong one could go:
/// `caption_path(p, cid, "mp4")` compiles and writes a path nobody will ever look for. Naming it
/// here keeps the literal in one place and next to the mime it has to agree with.
const EXTENSION: &str = "vtt";
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
	/// value costs most: someone deaf takes a track labelled `captions`, gets subtitles, loses
	/// every sound the film makes, and is told nothing -- the track plays, so nothing anywhere
	/// reports a fault. Guessing here buys one less argument at a call site and pays for it in
	/// silent, unreportable wrongness for the person the field exists for.
	///
	/// So the value has to come from somewhere that knows. `infer_kind` knows only when a track
	/// transcribes a sound; everything else has to be told. Meeting this as a compile error
	/// asking for a value is the intended experience.
	#[error("nothing in this track says whether it captions, subtitles or describes; pass the kind")]
	UnknownKind,
	#[error("could not write: {0}")]
	Write(#[source] std::io::Error),
}

/// Cut one track to a window, store it, and describe it for the video's record.
///
/// The returned pair is the cut file's own content id and the `Caption` to insert under it in
/// `Video::captions`. `None` means no cue is on screen during the window -- a silent excerpt --
/// and nothing is written, because a track with no cues renders exactly as no track does.
///
/// Reading the file is the caller's: this is handed text so it can be tested without one.
pub fn publish(
	vtt: &str,
	window: Window,
	language: &str,
	kind: Option<Kind>,
	public: &Path,
) -> Result<Option<(String, Caption)>, Error> {
	// Settled before anything is cut or written, so an untellable kind costs an object nobody
	// can name rather than being discovered after the bytes are on disk.
	let kind = kind.or_else(|| infer_kind(vtt)).ok_or(Error::UnknownKind)?;
	let Some(text) = cut(vtt, window)? else {
		return Ok(None);
	};

	let bytes = text.as_bytes();
	let id = cid(bytes);
	store::write(&store::caption_path(public, &id, EXTENSION), bytes).map_err(Error::Write)?;

	let caption = Caption {
		mime: MIME.to_string(),
		language: language.to_string(),
		kind: kind.as_str().to_string(),
		bytes: bytes.len() as u64,
	};
	Ok(Some((id, caption)))
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

/// The one thing a WebVTT file can be read to say about itself.
///
/// Only a captions track transcribes what is not speech, so a payload line that is nothing but
/// an upper-case bracketed run -- `[EXPLOSION]`, `(DOOR SLAMS)` in the houses that use
/// parentheses -- is a track written for someone who cannot hear it. That inference runs one way
/// only. Its absence separates nothing: a subtitle track, a descriptions track, and a captions
/// track for a clip with no notable sound are the same file. Descriptions in particular are
/// invisible to any test -- narration of what is on screen reads exactly like dialogue, and this
/// track's "A car drives down the highway, then it disappears into a tunnel" is a man describing
/// a film he is pitching, in dialogue, in a track that is not descriptions at all.
///
/// So silence here is not a default. `publish` turns it into `UnknownKind` and asks, because
/// `kind` is what a reader picks a track by: a deaf reader who takes a track labelled captions
/// and gets subtitles loses every sound the film makes, and is not told.
///
/// Read from the whole track rather than from the cut, because the kind belongs to the track. An
/// excerpt of a captions track that happens to hold no sound cue is still captions.
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
/// Whole-line only. Inline markers exist, but so do bracketed asides inside dialogue, and
/// missing one only means this asks to be told -- which is the safe direction to be wrong in.
///
/// The upper case is doing real work, not tidying. This track writes speaker labels the same
/// way -- `[Woman:]` and `[Siri:]`, each on a line of its own -- and a speaker label is not a
/// sound: subtitles carry them too, so reading one as evidence of captions would answer a
/// question this cannot actually see. Mixed case is the whole of what separates the two.
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
		let (id, caption) =
			publish(TRACK, window(), "en", None, public).expect("publish").expect("cues");

		let stored = store::caption_path(public, &id, "vtt");
		assert!(stored.is_file());
		let bytes = std::fs::read(&stored).expect("stored track");
		// The key is the hash of the cut file, not of the track it came from.
		assert_eq!(id, cid(&bytes));
		assert_ne!(id, cid(TRACK.as_bytes()));
		assert_eq!(caption.bytes, bytes.len() as u64);
		assert_eq!(caption.mime, "text/vtt");
		assert_eq!(caption.language, "en");
		assert_eq!(caption.kind, "captions");
	}

	#[test]
	fn an_explicit_kind_beats_what_the_file_looks_like() {
		// A descriptions track leaves no trace of being one, so what it is told is the only
		// thing that can be right.
		let temporary = tempfile::tempdir().expect("temp");
		let (_, caption) = publish(TRACK, window(), "en", Some(Kind::Descriptions), temporary.path())
			.expect("publish")
			.expect("cues");
		assert_eq!(caption.kind, "descriptions");
	}
}
