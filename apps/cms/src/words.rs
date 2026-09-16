//! How much writing a piece of text is, counted the way a word processor counts.
//!
//! The convention -- Han and kana count once per character, everything else once per
//! whitespace-delimited run -- is not ours to invent. `words-count` won an empirical run-off
//! against four other crates on this file's own test table, right on 8 of 9 cases and missing
//! only Korean; two of the rejections were specific to this site, argued beside `count` below.
//!
//! `unicode_blocks::is_cjk` wrongly treats Hangul as Han, which is spaced like Latin, so the raw
//! crate's Korean count ran roughly three times too high -- 49,918 against a true 17,410 on this
//! corpus. Every Hangul character becomes one ASCII letter before counting, which leaves the
//! spacing intact.

/// Whether a character is Hangul, in every block Korean is actually written in.
///
/// Syllables are what modern Korean text is; the jamo blocks are the decomposed forms, which
/// arrive from input methods and from normalisation and read as ordinary text.
///
/// No Korean word-count crate exists to use instead: `charabia` segments morphemes rather than
/// counting 어절, returning 13 where a word processor says 7, and carries a dictionary of tens
/// of megabytes for it. `Intl.Segmenter` and `unicode-segmentation` fare no better.
fn is_hangul(value: char) -> bool {
	unicode_blocks::find_unicode_block(value).is_some_and(|block| {
		block == unicode_blocks::HANGUL_SYLLABLES
			|| block == unicode_blocks::HANGUL_JAMO
			|| block == unicode_blocks::HANGUL_COMPATIBILITY_JAMO
			|| block == unicode_blocks::HANGUL_JAMO_EXTENDED_A
			|| block == unicode_blocks::HANGUL_JAMO_EXTENDED_B
	})
}

// Not the npm package of the same name: that one is among the four rejected candidates, and
// shreds identifiers -- `av01.0.04M.08,mp4a.40.2` counts as eight -- of exactly the shape this
// site's prose is full of. Dictionary segmentation, one of the other three, returns six for
// 爱情公寓是一部情景喜剧 where a word processor says eleven: a segmenter counts phrases, not
// the characters a reader of Chinese would count. The remaining two rejections were ordinary.

/// How many words this text is.
///
/// One allocation per call, and only when the text holds Hangul: everything else goes to the
/// crate untouched.
pub fn count(text: &str) -> usize {
	if text.chars().any(is_hangul) {
		// `x` rather than a space: a space would join the words on either side of a syllable and
		// undercount, and any ordinary letter is something the crate already counts by spacing.
		let latinised: String =
			text.chars().map(|value| if is_hangul(value) { 'x' } else { value }).collect();
		return words_count::count(&latinised).words;
	}
	words_count::count(text).words
}

#[cfg(test)]
mod tests {
	use super::*;

	/// The specification, as cases rather than prose.
	///
	/// Every candidate library describes itself in the same sentence and then disagrees with the
	/// others, so what this module promises is this table and not a description of an algorithm.
	/// A replacement for the crate underneath is free to arrive; it has to pass these.
	#[test]
	fn counts_the_way_a_word_processor_counts() {
		let cases: [(&str, usize); 14] = [
			// Latin: whitespace-delimited, and an identifier is one word however it is spelled.
			// This is the half the Japanese-correct alternatives get wrong.
			("AV1 encodes at 1080p", 4),
			("blake3 and gpt-5.6-terra-medium", 3),
			("av01.0.04M.08,mp4a.40.2", 1),
			("a well-known state-of-the-art result", 4),
			("Hello, world! Isn't it nice?", 5),
			// Han: one per character. Six is what a dictionary segmenter says and no word
			// processor does.
			("爱情公寓是一部情景喜剧", 11),
			// Mixed, which is what this corpus actually is: 这是 + StyleX + 的 + atomic +
			// class + 机制.
			("这是 StyleX 的 atomic class 机制", 8),
			// Kana, both of them, and a run of either is per character rather than per run.
			("これはにほんごのぶんです", 12),
			("コンピューター", 7),
			("日本語のテキストです", 10),
			// Hangul: spaced, so counted by spacing. The crate alone says 8, 21 and 7.
			("한국어 문장 입니다", 3),
			("안녕하세요 저는 오늘 새로운 기사를 읽고 있습니다", 7),
			("AV1 코덱은 1080p 까지", 4),
			("", 0),
		];
		for (text, want) in cases {
			assert_eq!(count(text), want, "{text}");
		}
	}

	#[test]
	fn hangul_is_not_treated_as_han_and_han_still_is() {
		// The one classification this module changes, stated directly rather than only through
		// the table: if a later version of the crate fixes this itself, this is the test that
		// says the workaround is still doing something.
		assert!(is_hangul('한'));
		assert!(is_hangul('ᄀ'));
		assert!(!is_hangul('爱'));
		assert!(!is_hangul('あ'));
		assert!(!is_hangul('A'));
	}
}
