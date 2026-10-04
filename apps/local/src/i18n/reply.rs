//! Whether a model's reply is locale text that can be restored and rendered under the segment
//! it answers. `translate` retries whatever this refuses.

use super::*;

/// Accept only locale text that can be restored and rendered under this segment's rules.
///
/// A failure returns to `translate`, whose attempt counter retries and escalates it. Keeping the
/// acceptance boundary here makes a malformed successful process no more trusted than a runner
/// process that explicitly failed.
#[cfg(test)]
pub(super) fn validate_reply(
	reply: &str,
	boundary: &str,
	region: segment::Region,
	masked: &segment::Masked,
) -> Result<Vec<(String, String)>, Refusal> {
	validate_reply_for(
		reply,
		boundary,
		segment::Kind::Prose,
		region,
		masked.text.as_str(),
		masked,
		&prompt::LOCALES,
		None,
	)
}

pub(super) fn validate_reply_for(
	reply: &str,
	boundary: &str,
	kind: segment::Kind,
	region: segment::Region,
	source: &str,
	masked: &segment::Masked,
	locales: &[&str],
	_source_locale: Option<&str>,
) -> Result<Vec<(String, String)>, Refusal> {
	let parsed = prompt::parse(reply, Some(boundary)).map_err(|prompt::BoundaryLeak| {
		Refusal::Failed("the model echoed the prompt boundary".to_owned())
	})?;
	// The neighbouring paragraphs go into the prompt as context, and a reply that includes them
	// is not a translation of this block -- it is this block plus somebody else's, stored under
	// this block's id. It shows up as untranslated prose appearing inside an unrelated view,
	// which is a long way from the reply that caused it. A block cannot gain lines in
	// translation, so counting them catches it at the point it happens.
	let allowed = body_lines(masked.text.as_str());
	// Read from the source rather than from the answer: a reply that changed the marks is a
	// different fault, and it must not be able to talk its way out of this one.
	let level = width::level(source);
	// Width is read after restoring, not before: a marker stands in for code of a different
	// length, so measuring the masked text would charge the heading for the wrong glyphs.
	let mut too_wide = Vec::new();
	let mut glued = Vec::new();
	let mut oversized = Vec::new();
	let wrong_block = std::cell::RefCell::new(Vec::new());
	let kept: Vec<(String, String)> = parsed
		.into_iter()
		.filter(|(locale, text)| {
			// The shape checks read the masked text, which is what was asked for. Masking lifts
			// inline code and nothing else, so the note counts they compare are the same on either
			// side of it.
			if !locales.contains(&locale.as_str()) {
				return false;
			}
			if !masked.intact(text) || body_lines(text) > allowed {
				return false;
			}
			match validate::translation(region, masked.text.as_str(), text) {
				Ok(()) => true,
				// Named rather than swept into the generic message: an author's note that did not
				// come back is not a translation of this block at all, and the next move is to
				// look at what block it *is* -- not to ask the same question again.
				Err(error @ validate::Error::AuthorNoteCountChanged) => {
					wrong_block.borrow_mut().push(format!("{locale} ({error})"));
					false
				}
				Err(_) => false,
			}
		})
		.map(|(locale, text)| (locale, masked.restore(&text)))
		.filter(|(locale, text)| {
			// Read after restoring: every marker this block owns has just been put back, so one
			// still standing here belongs to the folded context and was copied out of it.
			if !validate::markers_resolved(text) {
				wrong_block.borrow_mut().push(format!("{locale} ({})", validate::Error::UnresolvedMarker));
				return false;
			}
			// Size is compared against the real source, not the masked one, for the same reason
			// the two below are read here: a marker stands in for code of a different length.
			if !validate::size_plausible(source, text) {
				oversized.push(format!("{locale} at {} columns", width::raw(text)));
				return false;
			}
			// Spacing is read after restoring too: a marker is not the word it stands for, so
			// masked text cannot say whether a directive is glued to its neighbour.
			if !validate::spacing_intact(text) {
				glued.push(locale.clone());
				return false;
			}
			let fits = validate::heading_fits(kind, region, level, text);
			if !fits {
				too_wide.push(format!("{locale} at {} columns", width::of(text)));
			}
			fits
		})
		.collect();
	if kept.is_empty() {
		// Naming the width when that is the reason: the generic message covers a lost marker, an
		// added line and a malformed note alike, and none of those suggests the same next move.
		let wrong_block = wrong_block.into_inner();
		return Err(Refusal::Failed(if !wrong_block.is_empty() {
			format!("the reply is about a different block ({})", wrong_block.join(", "))
		} else if !oversized.is_empty() {
			format!(
				"a translation is far larger than its source ({}; source is {} columns) -- the \
				 reply is probably the neighbouring context rather than this block",
				oversized.join(", "),
				width::raw(source)
			)
		} else if !glued.is_empty() {
			format!("a note directive is glued to the word beside it ({})", glued.join(", "))
		} else if too_wide.is_empty() {
			"no locale survived marker and shape validation".to_owned()
		} else {
			format!(
				"heading overruns the table of contents ({}; {} columns is the limit)",
				too_wide.join(", "),
				width::CLAMP
			)
		}));
	}
	Ok(kept)
}
