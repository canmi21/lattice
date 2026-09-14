//! Where derived files land on disk.
//!
//! Paths are computed here and nowhere else, because the same layout has to be produced by
//! this tool and understood by the worker that serves it. Two spellings of one scheme is one
//! more than can be kept in step.

use std::path::{Path, PathBuf};

/// How many hex characters each level of the key fans out on.
const FAN: usize = 2;

/// `image/{ab}/{cd}/{cid}.{ext}` under the published root: a picture, or a video's poster frame.
///
/// The two levels buy nothing on R2, which has no directory to overflow. They exist so the
/// same bytes can be moved to an object store that does care, without rewriting every key --
/// and the CDN hides them anyway, since a request names only the cid.
///
/// **A prefix names what kind of object it is and the cid names the object, and nothing in a key
/// says what an object belongs to.** A caption does not live under the video it captions and a
/// poster does not live under the video it posters: a content id is about itself, and the same
/// bytes reached from two articles are one object either way. Where things belong together is
/// the record's job. See spec/architecture/video.md.
pub fn variant_path(public_root: &Path, cid: &str, extension: &str) -> PathBuf {
	let (first, second) = fanout(cid);
	public_root.join("image").join(first).join(second).join(format!("{cid}.{extension}"))
}

/// `video/{ab}/{cd}/{cid}.mp4` under the published root: one rung of a clip's ladder.
///
/// No extension to pass, unlike a picture. There is one codec in one container and the reason
/// is measured rather than stylistic -- AV1 in MP4 with `faststart`, because that is the only
/// path to the hardware decoder Apple devices need. A second spelling here would be a format
/// this repository does not publish. See spec/architecture/video.md.
pub fn video_path(public_root: &Path, cid: &str) -> PathBuf {
	let (first, second) = fanout(cid);
	public_root.join("video").join(first).join(second).join(format!("{cid}.mp4"))
}

/// `captions/{ab}/{cd}/{cid}.vtt` under the published root: one text track.
///
/// WebVTT and nothing else, for the same reason `video_path` fixes its own: a `<track>` element
/// takes one format and there is no second one to choose between.
pub fn caption_path(public_root: &Path, cid: &str) -> PathBuf {
	let (first, second) = fanout(cid);
	public_root.join("captions").join(first).join(second).join(format!("{cid}.vtt"))
}

/// `meta/{blake3}.json` under the published root.
///
/// Flat rather than fanned out: metadata is looked up by exact id and never listed, and
/// keeping it out of the object trees means a sync of one does not walk the other. It is
/// separated by kind rather than by hash because `meta/` holds the record for every kind of
/// asset -- a picture's and a clip's alike -- while `image/`, `video/` and `captions/` each
/// hold one kind of bytes.
pub fn meta_path(public_root: &Path, blake3: &str) -> PathBuf {
	public_root.join("meta").join(format!("{blake3}.json"))
}

/// The two fanout segments of a content id.
///
/// Public because every kind of object is addressed this way and there must not be a second
/// spelling of it anywhere.
pub fn fanout(cid: &str) -> (&str, &str) {
	let first = cid.get(..FAN).unwrap_or(cid);
	let second = cid.get(FAN..FAN * 2).unwrap_or("");
	(first, second)
}

pub fn write(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
	if let Some(parent) = path.parent() {
		std::fs::create_dir_all(parent)?;
	}
	std::fs::write(path, bytes)
}

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn fans_a_variant_out_over_two_levels() {
		let path = variant_path(Path::new("/pub"), "44b6081deaf0242ca3bf83d62a3b6c95", "avif");
		assert_eq!(path, Path::new("/pub/image/44/b6/44b6081deaf0242ca3bf83d62a3b6c95.avif"));
	}

	#[test]
	fn every_kind_of_object_fans_out_the_same_way() {
		// One scheme, three prefixes. A second fanout written for video is how the tool and the
		// worker that serves it start disagreeing about where a file is.
		let cid = "44b6081deaf0242ca3bf83d62a3b6c95";
		let pub_root = Path::new("/pub");
		assert_eq!(
			video_path(pub_root, cid),
			Path::new("/pub/video/44/b6/44b6081deaf0242ca3bf83d62a3b6c95.mp4")
		);
		assert_eq!(
			caption_path(pub_root, cid),
			Path::new("/pub/captions/44/b6/44b6081deaf0242ca3bf83d62a3b6c95.vtt")
		);
		assert_eq!(fanout(cid), ("44", "b6"));
	}

	#[test]
	fn nothing_in_a_key_says_what_an_object_belongs_to() {
		// A caption is addressed by its own content id under `captions/`, not nested under the
		// video it captions. The record is the only place that relationship is written.
		let caption = caption_path(Path::new("/pub"), "abcdef0123456789abcdef0123456789");
		assert!(!caption.to_string_lossy().contains("video"));
	}

	#[test]
	fn keeps_the_full_id_in_the_filename() {
		// The prefix directories are a copy of the first characters, not a substitute for
		// them: a file has to be identifiable from its own name alone once it is elsewhere.
		let path = variant_path(Path::new("/pub"), "abcdef0123456789abcdef0123456789", "webp");
		assert!(path.file_name().unwrap().to_string_lossy().starts_with("abcdef0123456789"));
	}

	#[test]
	fn puts_metadata_outside_the_object_trees() {
		let path = meta_path(Path::new("/pub"), "44b6081deaf0242ca3bf83d62a3b6c95");
		assert_eq!(path, Path::new("/pub/meta/44b6081deaf0242ca3bf83d62a3b6c95.json"));
	}

	#[test]
	fn survives_an_id_shorter_than_the_fanout() {
		// Never expected, but a panic here would come from a filename rather than from data,
		// which is a poor reason to lose a run partway through.
		let path = variant_path(Path::new("/pub"), "ab", "png");
		assert!(path.to_string_lossy().contains("ab.png"));
	}
}
