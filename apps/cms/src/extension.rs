//! What a stored file is called, given what is in it.
//!
//! One answer, because there were two and they disagreed. `cms image` named a JPEG `.jpeg` while
//! `cms favicon` named one `.jpg` -- the same format, spelled for an eight-character filename
//! limit that outlived the system imposing it, the history that leaves `yml` beside `yaml`.
//!
//! Reading stays wide and only writing is narrow. `image::mime_of` still accepts a `.jpg` an
//! author drags in; what this decides is the name *this repository* puts on a file. That name is
//! load-bearing: an object address forms a key from it and corrects nothing, so a file written
//! under one spelling and linked under the other is a 404. Only a `/derive` target is corrected,
//! that being a request for a format rather than a name for stored bytes. See
//! spec/architecture/delivery.md.

/// The extension for a derived image variant.
///
/// Total rather than optional: the encoder only ever produces these, and anything unrecognised
/// is AVIF because that is what the ladder stores.
pub fn for_variant(mime: &str) -> &'static str {
	match mime {
		"image/png" => "png",
		"image/webp" => "webp",
		"image/jpeg" => JPEG,
		_ => "avif",
	}
}

/// The extension for an icon fetched from somebody else's site.
///
/// Optional, and matched loosely on purpose: this is a `Content-Type` header from a server nobody
/// here controls, which arrives as `image/x-icon`, `image/vnd.microsoft.icon`, or with a charset
/// bolted on. A type that is none of these is not an icon this repository can store.
pub fn for_icon(content_type: &str) -> Option<&'static str> {
	let lower = content_type.to_lowercase();
	if lower.contains("svg") {
		Some("svg")
	} else if lower.contains("png") {
		Some("png")
	} else if lower.contains("jpeg") || lower.contains("jpg") {
		Some(JPEG)
	} else if lower.contains("icon") {
		Some("ico")
	} else {
		None
	}
}

/// Every extension an icon can be stored under, in the order a lookup should try them.
pub const ICON_EXTENSIONS: [&str; 4] = ["svg", "png", JPEG, "ico"];

/// The spelling, written once so the two functions above cannot drift apart on it.
const JPEG: &str = "jpeg";

#[cfg(test)]
mod tests {
	use super::*;

	/// The disagreement this module exists to prevent. Both paths name a file the CDN then has
	/// to serve by that exact name, so a second spelling is not a hop -- it is a missing file.
	#[test]
	fn both_paths_spell_jpeg_the_same_way() {
		assert_eq!(for_variant("image/jpeg"), "jpeg");
		assert_eq!(for_icon("image/jpeg"), Some("jpeg"));
		assert_eq!(for_icon("image/jpg"), Some("jpeg"));
		assert!(ICON_EXTENSIONS.contains(&"jpeg"));
		assert!(!ICON_EXTENSIONS.contains(&"jpg"));
	}

	#[test]
	fn an_icon_type_is_matched_however_the_server_spells_it() {
		assert_eq!(for_icon("image/svg+xml"), Some("svg"));
		assert_eq!(for_icon("image/png"), Some("png"));
		assert_eq!(for_icon("image/x-icon"), Some("ico"));
		assert_eq!(for_icon("image/vnd.microsoft.icon"), Some("ico"));
		assert_eq!(for_icon("IMAGE/PNG; charset=binary"), Some("png"));
		assert_eq!(for_icon("application/octet-stream"), None);
	}

	#[test]
	fn a_variant_falls_back_to_what_the_ladder_stores() {
		assert_eq!(for_variant("image/avif"), "avif");
		assert_eq!(for_variant("image/heic"), "avif");
	}
}
