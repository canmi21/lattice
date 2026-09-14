//! Choosing which sizes a clip is published at.
//!
//! Pure arithmetic, kept apart from the encoder so the rules can be read and tested without
//! encoding anything. `image::ladder` answers the same question for pictures and answers it
//! differently: a picture gets every tier it can fill and chooses among them with `srcset`,
//! while `<video>` picks a `<source>` by type and never by size, so a chooser runs at
//! hydration and the ladder it chooses from is one or two rungs rather than all of them. The
//! `Size` both work in is shared; the rule is not. See spec/architecture/video.md.

use crate::image::ladder::Size;

/// Tiers named by height, because a tier has to be one axis or a vertical clip snaps to the
/// wrong one -- a 1080x1920 phone video is not a small video, it is a tall one.
pub const TIERS: [u32; 6] = [360, 480, 720, 1080, 1440, 2160];

/// The dividing line, and the whole shape of the ladder turns on it. The column an article
/// renders in is 768 CSS pixels, which is 1536 physical on a retina desktop; 720p falls a
/// fifth short of that and 1080p covers it with margin.
pub const PIVOT: u32 = 1080;

/// Above this a source is forced down rather than published at whatever it arrived as. 4K is
/// already two and a half times what the column can show and exists for full-screen only.
pub const CAP: u32 = 2160;

/// The sizes to produce for a clip, smallest first.
///
/// Above the pivot, two rungs: 1080p and the larger standard tier the source fits, capped.
/// At it, one. Below it, one at the nearest standard tier *below* the source -- a source that
/// has nothing below it is its own rung, re-encoded rather than resized. Aspect ratio is
/// preserved and nothing is ever upscaled.
///
/// Letterboxing is not cropped out. One of the clips this was written against is 1280x720
/// with a 1280x320 picture inside it, and that is the film's framing rather than a defect, so
/// the ladder reads the file's dimensions and nothing else.
pub fn ladder(source: Size) -> Vec<Size> {
	let height = source.height;
	let tiers: Vec<u32> = if height > PIVOT {
		// The cap is applied to what the source fits, not to the source: above 4K the top rung
		// is 4K rather than the original frame.
		let fits = height.min(CAP);
		TIERS
			.into_iter()
			.filter(|&tier| tier > PIVOT && tier <= fits)
			.max()
			.map_or_else(|| vec![PIVOT], |top| vec![PIVOT, top])
	} else if height == PIVOT {
		// Its own single rung, and this branch is not a special case of the one below it: the rule
		// there is the nearest tier *below* the source, which would step a 1080p source down to
		// 720p and publish nothing at the size the pivot exists to guarantee.
		vec![PIVOT]
	} else {
		TIERS.into_iter().filter(|&tier| tier < height).max().map_or_else(|| vec![height], |below| vec![below])
	};
	tiers.into_iter().map(|tier| scaled_to_height(source, tier)).collect()
}

/// `source` scaled so its height is `target`, ratio preserved and both axes even.
///
/// Even because the encoder writes yuv420p, which subsamples chroma by two on both axes and
/// has nowhere honest to put an odd last row. Rounding is to the nearest even and then clamped
/// to the source, and the clamp is what keeps "never upscaled" true for the rung that is the
/// source itself at an odd size. Two is the floor rather than zero: a dimension of one cannot
/// be encoded at all.
fn scaled_to_height(source: Size, target: u32) -> Size {
	let ceiling = Size::new(even_floor(source.width), even_floor(source.height));
	if source.height == 0 || target >= source.height {
		return ceiling;
	}
	let width = f64::from(source.width) * f64::from(target) / f64::from(source.height);
	Size::new(nearest_even(width).min(ceiling.width), even_floor(target).min(ceiling.height))
}

fn even_floor(value: u32) -> u32 {
	(value & !1).max(2)
}

fn nearest_even(value: f64) -> u32 {
	((value / 2.0).round() as u32).max(1) * 2
}

#[cfg(test)]
mod tests {
	use super::*;

	fn rungs(width: u32, height: u32) -> Vec<(u32, u32)> {
		ladder(Size::new(width, height)).into_iter().map(|size| (size.width, size.height)).collect()
	}

	#[test]
	fn a_source_above_the_pivot_gets_1080p_and_the_tier_it_fits() {
		assert_eq!(rungs(3840, 2160), vec![(1920, 1080), (3840, 2160)]);
		assert_eq!(rungs(2560, 1440), vec![(1920, 1080), (2560, 1440)]);
	}

	#[test]
	fn above_4k_is_forced_down_to_4k() {
		// The cap applies to the rung, not to the source: nothing on the site renders above 4K
		// and the pixels over it are paid for by every reader who takes the top rung.
		assert_eq!(rungs(7680, 4320), vec![(1920, 1080), (3840, 2160)]);
	}

	#[test]
	fn a_source_between_tiers_above_the_pivot_publishes_only_1080p() {
		// 1200 fits no tier above 1080, so the second rung has nothing to be. One rung is the
		// answer rather than a rung at 1200, which is not a tier anything chooses by.
		assert_eq!(rungs(2133, 1200), vec![(1920, 1080)]);
	}

	#[test]
	fn a_source_exactly_at_the_pivot_is_its_own_single_rung() {
		assert_eq!(rungs(1920, 1080), vec![(1920, 1080)]);
	}

	#[test]
	fn a_source_below_the_pivot_steps_down_to_the_nearest_tier_below_it() {
		// Deliberately *below*, not "the nearest tier it fills": a 720p source publishes 480p.
		assert_eq!(rungs(1280, 720), vec![(854, 480)]);
		assert_eq!(rungs(1600, 900), vec![(1280, 720)]);
	}

	#[test]
	fn a_source_with_no_tier_below_it_is_its_own_rung() {
		// Re-encoded rather than resized. There is nothing under the lowest tier to step to,
		// and stepping up would be the upscale the whole ladder refuses.
		assert_eq!(rungs(640, 360), vec![(640, 360)]);
		assert_eq!(rungs(320, 180), vec![(320, 180)]);
	}

	#[test]
	fn a_tier_is_a_height_so_a_vertical_clip_is_not_snapped_to_the_wrong_axis() {
		// Measured on width, a 1080x1920 phone video would look like a 1080p source and publish
		// one rung. It is a 1920-tall source and gets two.
		assert_eq!(rungs(1080, 1920), vec![(608, 1080), (810, 1440)]);
	}

	#[test]
	fn letterboxing_is_not_cropped() {
		// A 1280x720 file holding a 1280x320 picture is framed that way on purpose. The ladder
		// reads the file, so the rung keeps the black bars and the ratio the article lays out
		// against stays the one the manifest recorded.
		assert_eq!(rungs(1280, 720), vec![(854, 480)]);
	}

	#[test]
	fn never_upscales_and_never_reorients() {
		for (width, height) in [(3840, 2160), (1280, 720), (640, 360), (1080, 1920), (1281, 721)] {
			let source = Size::new(width, height);
			for rung in ladder(source) {
				assert!(rung.width <= width && rung.height <= height, "{rung:?} exceeds {source:?}");
				assert_eq!(rung.width > rung.height, width > height, "{rung:?} flipped {source:?}");
			}
		}
	}

	#[test]
	fn every_rung_is_even_on_both_axes() {
		// yuv420p has no honest place for an odd last row, and an encoder handed one either
		// refuses or silently pads.
		for (width, height) in [(1281, 721), (1919, 1079), (641, 361), (3841, 2161)] {
			for rung in ladder(Size::new(width, height)) {
				assert_eq!(rung.width % 2, 0, "odd width in {rung:?}");
				assert_eq!(rung.height % 2, 0, "odd height in {rung:?}");
			}
		}
	}

	#[test]
	fn an_odd_source_at_the_pivot_rounds_down_rather_than_up() {
		// Rounding to the nearest even would enlarge 1921 to 1922, which is the one place the
		// even-rounding could break the rule the rest of the ladder holds.
		assert_eq!(rungs(1921, 1080), vec![(1920, 1080)]);
		assert_eq!(rungs(1281, 721), vec![(1280, 720)]);
	}
}
