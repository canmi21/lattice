//! Where derived files land on disk.
//!
//! Paths are computed here and nowhere else, because the same layout has to be produced by
//! this tool and understood by the worker that serves it. Two spellings of one scheme is one
//! more than can be kept in step.

use std::path::{Path, PathBuf};

/// How many hex characters each level of the key fans out on.
const FAN: usize = 2;

/// **The one declaration of the bucket's layout, on this side.** The twin of `OBJECTS` in
/// `libs/store`, kept in sync by a test there. See spec/architecture/data.md, "The layout is
/// declared once per language and the two are held together by a test", and
/// spec/architecture/video.md, "A prefix names what kind of object it is", for the table's
/// shape and the trap it replaced.
pub const OBJECTS: [(&str, bool, &str); 5] = [
	("captions", true, "vtt"),
	("image", true, ""),
	("license", true, "txt"),
	("meta", false, "json"),
	("video", true, "mp4"),
];

/// The path one object is stored at, from the table alone.
fn object_path(public_root: &Path, prefix: &str, cid: &str, extension: &str) -> PathBuf {
	let (_, fanned, fixed) = OBJECTS
		.iter()
		.find(|(name, _, _)| *name == prefix)
		.copied()
		.expect("every prefix used here is declared in OBJECTS");
	let extension = if fixed.is_empty() { extension } else { fixed };
	let name = format!("{cid}.{extension}");
	let root = public_root.join(prefix);
	if fanned {
		let (first, second) = fanout(cid);
		root.join(first).join(second).join(name)
	} else {
		root.join(name)
	}
}

/// `image/{ab}/{cd}/{cid}.{ext}`: a picture, or a video's poster frame.
///
/// The one kind that takes an extension, because one picture is published as several formats and
/// the request says which.
pub fn variant_path(public_root: &Path, cid: &str, extension: &str) -> PathBuf {
	object_path(public_root, "image", cid, extension)
}

/// `video/{ab}/{cd}/{cid}.mp4`: one rung of a clip's ladder.
///
/// No extension to pass, unlike a picture. There is one codec in one container and the reason
/// is measured rather than stylistic -- AV1 in MP4 with `faststart`, because that is the only
/// path to the hardware decoder Apple devices need. A second spelling here would be a format
/// this repository does not publish. See spec/architecture/video.md.
pub fn video_path(public_root: &Path, cid: &str) -> PathBuf {
	object_path(public_root, "video", cid, "")
}

/// `captions/{ab}/{cd}/{cid}.vtt`: one text track.
///
/// WebVTT and nothing else, for the same reason `video_path` fixes its own: a `<track>` element
/// takes one format and there is no second one to choose between.
pub fn caption_path(public_root: &Path, cid: &str) -> PathBuf {
	object_path(public_root, "captions", cid, "")
}

/// `meta/{blake3}.json`: the record written beside an asset's bytes.
///
/// Flat, and separated by kind rather than by hash because `meta/` holds the record for every
/// kind of asset -- a picture's and a clip's alike -- while `image/`, `video/` and `captions/`
/// each hold one kind of bytes.
pub fn meta_path(public_root: &Path, blake3: &str) -> PathBuf {
	object_path(public_root, "meta", blake3, "")
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
