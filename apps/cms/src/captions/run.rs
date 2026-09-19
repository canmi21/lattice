//! The `cms captions` command: a track cut to a clip already in the library, and attached to it.
//!
//! Separate from `cms video` because the two arrive on different days -- a clip is cut on
//! import, its track downloaded, written or bought later, and two of the three clips here have
//! none at all. See spec/architecture/video/captions.md, "The pairing is checked by arithmetic, and
//! the arithmetic is not about the track", for what the excerpt-length and non-empty-cut checks
//! catch, and "Neither of those is a check on the track" for why the track's own identity cannot be
//! checked at all and why `--language` is required rather than inferred. See "The window has one
//! home" for the `--from`/`--to` flags.

use super::{Kind, Window};
use crate::image::manifest::{Media, Merged, Track};
use crate::image::run::{MERGED, load, republish};
use crate::image::{self, manifest};
use crate::media;
use std::path::{Path, PathBuf};

/// How far the excerpt and the measured duration may differ and still be the same passage.
///
/// A person writes a window in whole seconds and ffmpeg cuts on a frame boundary, so the two are
/// never exactly equal: measured over the three clips here the gap is 0.000s, 0.024s and 0.051s,
/// which is under two frames at thirty. A quarter of a second leaves room for a clip cut at eight
/// frames a second and is still an order of magnitude below any mispairing -- the wrong passage of
/// the same talk is out by seconds, not by hundredths.
const TOLERANCE: f64 = 0.25;

pub struct Options<'a> {
	/// BCP 47. Required, because nothing in a WebVTT file says what language it is in.
	pub language: &'a str,
	/// `None` asks the track, and is refused when the track cannot say. See `super::infer_kind`.
	pub kind: Option<Kind>,
	/// Replace a track already attached for this language and kind.
	pub force: bool,
}

#[derive(Debug)]
pub struct Outcome {
	/// The clip the track was attached to.
	pub clip: String,
	/// Content id of the cut track, which is what it is keyed by.
	pub track: String,
	pub kind: Kind,
	/// What the cut amounts to, including the first line it will put on screen.
	pub summary: super::Summary,
	/// The clip's length, to read the coverage against.
	pub duration: f64,
	pub bytes: u64,
	/// The track this one displaced, when `--force` displaced one.
	pub replaced: Option<String>,
}

#[derive(Debug, thiserror::Error)]
pub enum Error {
	#[error("no clip in the library is called `{0}`")]
	UnknownClip(String),
	#[error("`{0}` is a picture, not a clip")]
	NotAVideo(String),
	#[error(
		"{clip} has no `excerpt` in data/record/media.yaml, and that is where the window lives; write \
		 `excerpt: {{ from, to }}` in seconds of the original"
	)]
	NoExcerpt { clip: String },
	#[error(
		"the excerpt is {window:.3}s but the clip is {duration:.3}s: one of the two is describing \
		 something else, and cutting against this window would shift every cue by the difference"
	)]
	Mismatch { window: f64, duration: f64 },
	#[error("nothing is said anywhere in this window, so this track is not for this clip")]
	Silent,
	#[error(
		"{language} {kind} is already attached, as {existing}; pass --force to replace it, or the \
		 clip would offer a reader two tracks with one name"
	)]
	Occupied { language: String, kind: String, existing: String },
	#[error("could not read {}: {source}", .path.display())]
	Read {
		path: PathBuf,
		#[source]
		source: std::io::Error,
	},
	#[error(transparent)]
	Cut(#[from] super::Error),
	#[error("could not write: {0}")]
	Write(#[source] std::io::Error),
}

/// Cut one track to a clip's excerpt, store it, and record it against the clip.
///
/// `clip` names the video: its content id, the id as an article writes it (`{cid}.mp4`), or the
/// original's filename or path under `data/source/video`.
pub fn run(
	repo: &Path,
	public: &Path,
	clip: &str,
	track: &Path,
	options: &Options<'_>,
) -> Result<Outcome, Error> {
	let merged_path = repo.join(MERGED);
	let mut merged =
		load(&merged_path).map_err(|source| Error::Read { path: merged_path.clone(), source })?;

	let id = resolve(clip, &crate::paths::video_originals(repo), &merged)?;
	let video = merged
		.media
		.get(&id)
		.and_then(Media::video)
		.ok_or_else(|| Error::NotAVideo(clip.to_owned()))?;
	let duration = video.source.duration;

	// Read before the track is, so a window that cannot be right costs nothing but the manifest.
	let media_path = media::path_for(repo);
	let authored =
		media::load(&media_path).map_err(|source| Error::Read { path: media_path.clone(), source })?;
	let excerpt = authored
		.media
		.get(&id)
		.and_then(|entry| entry.excerpt)
		.ok_or_else(|| Error::NoExcerpt { clip: id.clone() })?;
	let window = Window { from: excerpt.from, to: excerpt.to };
	let length = window.to - window.from;
	if !(length - duration).abs().is_finite() || (length - duration).abs() > TOLERANCE {
		return Err(Error::Mismatch { window: length, duration });
	}

	let vtt = std::fs::read_to_string(track)
		.map_err(|source| Error::Read { path: track.to_owned(), source })?;

	// Settled here rather than left to `publish`, for the reason `publish` settles it before it
	// writes: the kind is what decides whether a track already attached is this one's rival, and
	// discovering that after the bytes are on disk leaves an object nobody asked for.
	let kind = options.kind.or_else(|| super::infer_kind(&vtt)).ok_or(super::Error::UnknownKind)?;

	// Cut once here for the report and the identity, and once more inside `publish` when the bytes
	// are stored. It is a pure function over a file of a few tens of kilobytes, and the alternative
	// is a second return value on `publish` that only this line wants.
	let Some(text) = super::cut(&vtt, window)? else {
		return Err(Error::Silent);
	};
	let summary = super::summarise(&text);
	let arriving = image::cid(text.as_bytes());

	let replaced = displaced(&video.tracks, options.language, kind, &arriving);
	if let Some(existing) = &replaced
		&& !options.force
	{
		return Err(Error::Occupied {
			language: options.language.to_owned(),
			kind: kind.as_str().to_owned(),
			existing: existing.clone(),
		});
	}

	let Some(track) = super::publish(&vtt, window, options.language, Some(kind), public)? else {
		return Err(Error::Silent);
	};
	let stored = track.content.clone();
	let bytes = track.bytes;

	let record = merged
		.media
		.get_mut(&id)
		.and_then(Media::video_mut)
		.ok_or_else(|| Error::NotAVideo(clip.to_owned()))?;
	if let Some(existing) = &replaced {
		// The bytes stay where they are. `cms gc` is what sweeps an object no record points at,
		// and it is the one place that decides whether something is still wanted.
		record.tracks.retain(|held| &held.content != existing);
	}
	// Replaced in place rather than appended twice: re-importing the same file is the same track,
	// and two entries with one content id would offer a reader the same words under two names.
	record.tracks.retain(|held| held.content != stored);
	record.tracks.push(track);

	let media = merged.media.get(&id).cloned().ok_or_else(|| Error::NotAVideo(clip.to_owned()))?;
	// The sidecar first: it is what a build reads for one asset, and the merged manifest is the
	// aggregate. A crash between the two leaves the sidecar ahead, which the next run overwrites
	// from the manifest, rather than a manifest claiming a track the sidecar has never heard of.
	republish(public, &id, &media).map_err(Error::Write)?;
	merged.updated = manifest::now();
	let json = serde_json::to_string_pretty(&merged)
		.map_err(|error| Error::Write(std::io::Error::other(error.to_string())))?;
	image::store::write(&merged_path, format!("{json}\n").as_bytes()).map_err(Error::Write)?;

	Ok(Outcome { clip: id, track: stored, kind, summary, duration, bytes, replaced })
}

/// The attached track this one would stand in for, if there is one.
///
/// Language and kind together, because that pair is the whole of what a player shows in its track
/// menu: two entries reading "English (captions)" is a choice a reader cannot make. A track with
/// the same content id is not a rival -- it is this one, imported again -- so re-running is
/// idempotent and needs no flag.
fn displaced(tracks: &[Track], language: &str, kind: Kind, arriving: &str) -> Option<String> {
	tracks
		.iter()
		.find(|track| {
			track.language == language && track.kind == kind.as_str() && track.content != arriving
		})
		.map(|track| track.content.clone())
}

/// The content id of the clip a person named, however they named it.
///
/// Three spellings, because three are what is to hand: the id, the id as the article now writes
/// it, and the original's name in `data/source/video`, which is the only one still legible after
/// the import rewrote the article. A path is resolved by hashing it, the same operation the
/// import used to arrive at the id in the first place.
fn resolve(clip: &str, originals: &Path, merged: &Merged) -> Result<String, Error> {
	let is_video = |cid: &str| merged.media.get(cid).and_then(Media::video).is_some();

	if is_video(clip) {
		return Ok(clip.to_owned());
	}
	if let Some(stem) = Path::new(clip).file_stem().and_then(|value| value.to_str())
		&& is_video(stem)
	{
		return Ok(stem.to_owned());
	}

	for candidate in [PathBuf::from(clip), originals.join(clip)] {
		if candidate.is_file() {
			let bytes = std::fs::read(&candidate)
				.map_err(|source| Error::Read { path: candidate.clone(), source })?;
			let id = image::cid(&bytes);
			return if is_video(&id) { Ok(id) } else { Err(Error::UnknownClip(clip.to_owned())) };
		}
	}

	Err(Error::UnknownClip(clip.to_owned()))
}

#[cfg(test)]
mod tests {
	use super::*;

	fn track(content: &str, language: &str, kind: &str) -> Track {
		Track {
			content: content.to_owned(),
			mime: "text/vtt".to_owned(),
			language: language.to_owned(),
			kind: kind.to_owned(),
			bytes: 1,
		}
	}

	#[test]
	fn a_track_for_a_language_and_kind_already_attached_is_displaced_rather_than_added() {
		// Two entries reading "English (captions)" is a choice a reader cannot make.
		let tracks = [track("old", "en", "captions")];
		assert_eq!(displaced(&tracks, "en", Kind::Captions, "new"), Some("old".to_owned()));
	}

	#[test]
	fn a_second_language_and_a_second_kind_stand_beside_it() {
		let tracks = [track("old", "en", "captions")];
		assert_eq!(displaced(&tracks, "fr", Kind::Captions, "new"), None);
		assert_eq!(displaced(&tracks, "en", Kind::Subtitles, "new"), None);
	}

	#[test]
	fn importing_the_same_track_again_displaces_nothing() {
		// Same window, same file, same bytes, same id. Nothing has changed and no flag should be
		// needed to say so.
		let tracks = [track("same", "en", "captions")];
		assert_eq!(displaced(&tracks, "en", Kind::Captions, "same"), None);
	}
}
