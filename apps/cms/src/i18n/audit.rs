//! Report-only checks on stored translations: the note policies that shape cannot enforce, plus
//! a length check. See spec/i18n/segments.md, "An author's note continues from its words, in
//! every locale" and spec/i18n/prose.md, "A translation that runs far longer or shorter
//! than its source is reported", for what each policy is and why none of them are a hard gate.
//!
//! Triage, not judgement: `cms i18n --check` prints findings for a person to read, on the
//! premise that a check tuned until nothing is reported has stopped working rather than found a
//! clean corpus.

use super::segment::{Display, Kind, Region};
use super::tn;
use super::width;

/// The locales whose scripts legitimately contain Han characters, so a `:tn` wrapping them
/// says nothing about whether the words were translated.
const HAN_SCRIPT_LOCALES: [&str; 3] = ["zh-CN", "zh-TW", "ja-JP"];

/// Marks that open something and are followed immediately by what they open. Deliberately
/// without the French guillemet, which does take a space in its own typography.
const OPENING_MARKS: [char; 6] = ['¿', '¡', '(', '[', '\u{201C}', '\u{2018}'];

/// One suspect translation, named precisely enough to find and judge.
#[derive(Debug, PartialEq)]
pub struct Finding {
	pub segment: String,
	pub locale: String,
	pub reason: String,
}

/// Every `name[words]{is="note"}` directive in a text, as (words, note) pairs.
///
/// Tolerant where `validate::well_formed` is strict: this runs over stored translations that
/// already passed validation, and a malformed straggler is simply not a pair to audit.
fn directives(text: &str, name: &str) -> Vec<(String, String)> {
	let mut found = Vec::new();
	let mut rest = text;
	while let Some(at) = rest.find(name) {
		rest = &rest[at + name.len()..];
		let Some(words_end) = rest.find(']') else {
			break;
		};
		let words = &rest[..words_end];
		let after = &rest[words_end + 1..];
		let Some(tail) = after.strip_prefix("{is=\"") else {
			continue;
		};
		let Some(note_end) = tail.find("\"}") else {
			break;
		};
		found.push((words.to_owned(), tail[..note_end].to_owned()));
		rest = &tail[note_end + 2..];
	}
	found
}

/// The stretches of a recorded phrase a note is able to reproduce.
///
/// A note cannot contain a straight double quote -- the directive's attribute has no escape for
/// one -- so a phrase carrying one is cited around it rather than through it. A phrase without
/// one yields exactly itself, which is every phrase but the rare case this exists for.
fn quotable(phrase: &str) -> impl Iterator<Item = &str> {
	phrase.split('"').filter(|piece| !piece.is_empty())
}

fn has_han(text: &str) -> bool {
	text.chars().any(|c| ('\u{4E00}'..='\u{9FFF}').contains(&c))
}

/// Leading characters that are neither letters nor digits carry no restatement signal.
fn normalised(text: &str) -> String {
	text.trim_start_matches(|c: char| !c.is_alphanumeric()).to_lowercase()
}

/// The policy findings for one stored translation of one body segment.
///
/// `kind` decides whether the navigation-width policy applies; `source` is what the heading was
/// before translation, which is the only honest yardstick for it.
pub fn of(
	segment_id: &str,
	locale: &str,
	translation: &str,
	kind: Kind,
	source: &str,
	glosses: Option<&tn::Entry>,
) -> Vec<Finding> {
	let mut findings = Vec::new();
	let finding =
		|reason: String| Finding { segment: segment_id.to_owned(), locale: locale.to_owned(), reason };

	// Two lines is a legitimate outcome for a section heading; `validate` refuses only what gets
	// cut off. This reports the band in between, with the source beside it, since only a person
	// can judge whether the language could have said it shorter. A subsection is never in the
	// rail, so it is reported only past the clamp, as a reading judgement rather than a fit. See
	// spec/i18n/segments.md, "A section heading is also a label, and the rail is narrow".
	if kind == Kind::Heading {
		let columns = width::of(translation);
		match width::level(source) {
			Some(2) if columns > width::ONE_LINE => findings.push(finding(format!(
				"heading wraps the table of contents ({columns} columns, source is {}; one line is {})",
				width::of(source),
				width::ONE_LINE,
			))),
			Some(level) if level > 2 && columns > width::CLAMP => findings.push(finding(format!(
				"subsection heading runs long ({columns} columns, source is {}); it is not in the \
				 table of contents, so this is a reading judgement rather than a fit",
				width::of(source),
			))),
			_ => {}
		}
	}

	// The two wrong-block checks, reported over what is already stored. `validate` refuses these
	// on arrival now, but everything bought before it did is still on disk, and a person needs
	// the whole list at once rather than one failure per build.
	if !super::validate::author_notes_preserved(source, translation) {
		findings.push(finding(format!(
			"carries {} author's notes where the source has {} -- probably a translation of a \
			 neighbouring block",
			translation.matches(":fn[").count(),
			source.matches(":fn[").count(),
		)));
	}
	if !super::validate::markers_resolved(translation) {
		findings.push(finding(
			"carries a code marker that stands for nothing -- text copied from the neighbouring \
			 context"
				.to_owned(),
		));
	}

	// The same rule `validate` now refuses on arrival, reported over what is already stored.
	if !super::validate::spacing_intact(translation) {
		findings.push(finding("a note directive is glued to the word beside it".to_owned()));
	}

	// The correction overshooting: told to space a directive off the word beside it, a model
	// also spaces it off an opening mark, where the mark is already the boundary and the space
	// is a typographic error -- Spanish `¿ Modelo`. Reported rather than refused: which marks
	// take a space is a per-language typographic convention, and French genuinely spaces its
	// guillemets, so a threshold here would be wrong somewhere.
	if OPENING_MARKS.iter().any(|mark| {
		translation.contains(&format!("{mark} :fn[")) || translation.contains(&format!("{mark} :tn["))
	}) {
		findings.push(finding("a space follows an opening mark before a note directive".to_owned()));
	}

	// An author's note explanation continues from its words; opening by restating them is the
	// double reading the policy exists to avoid.
	for (words, note) in directives(translation, ":fn") {
		if !words.is_empty() && normalised(&note).starts_with(&normalised(&words)) {
			findings.push(finding(format!(":fn explanation restates the words it follows ({words})")));
		}
	}

	let tn_pairs = directives(translation, ":tn");
	// The wrapped words are the translation. Han inside them, in a locale whose script has
	// none, is the source carried into the sentence -- or a romanisation's sibling failure.
	if !HAN_SCRIPT_LOCALES.contains(&locale) {
		for (words, _) in &tn_pairs {
			if has_han(words) {
				findings.push(finding(format!(":tn wraps untranslated source script ({words})")));
			}
		}
	}
	// The note quotes the original span verbatim; checked against the stretches of the phrase a
	// note is actually able to hold, split at a straight quote the directive's attribute has no
	// escape for -- else a phrase like `"清"字` fails every locale that quoted it correctly. See
	// spec/i18n/prose.md, "A phrase can be unquotable, and the audit must not report that forever".
	if let Some(entry) = glosses {
		for span in &entry.spans {
			let quoted =
				quotable(&span.phrase).any(|piece| tn_pairs.iter().any(|(_, note)| note.contains(piece)));
			if !tn_pairs.is_empty() && !quoted {
				findings.push(finding(format!(":tn note does not quote the original ({})", span.phrase)));
			}
		}
	}

	findings
}

/// Below this many columns a same-language pair may legitimately differ by half -- one view can
/// leave a fragment alone while the other spells it out. Measured: every divergence under this
/// width was benign in the corpus. See spec/i18n/request.md, "Two views of one language are
/// each other's control".
const PAIR_FLOOR: usize = 60;

/// How far apart two views of one language may run before it is worth a person's eye.
const PAIR_RATIO: f64 = 0.75;

/// Whether a stored display field (title, subtitle) still fits its fixed-width slot.
///
/// Report-only: fixing this means deleting the entry and re-running the translation, which is a
/// person's call. Compares against `target`, not `budget` -- a fifth of headroom is held back
/// from a full form since it sits one edit from overflowing; a short form, already the last
/// fallback, is written to its budget. See spec/i18n/prose.md, "A budget is a ceiling, not a
/// target".
pub fn display(segment_id: &str, locale: &str, translation: &str, field: Display) -> Vec<Finding> {
	let drawn = width::pixels(translation);
	if drawn <= field.target() {
		return Vec::new();
	}
	let budget = field.budget();
	let verdict = if drawn > budget { "over" } else { "inside the fifth held back from" };
	vec![Finding {
		segment: segment_id.to_owned(),
		locale: locale.to_owned(),
		reason: format!(
			"{} draws about {drawn:.0}px, {verdict} its {budget:.0}px budget: {translation}",
			field.name()
		),
	}]
}

/// How much wider than its source a translation usually comes out, per locale and region.
///
/// Median of `pixels(translation) / pixels(source)` across the corpus, frontmatter and body kept
/// separate since they expand at different rates. An unrecorded locale takes 1.0 and is then
/// judged only against its siblings. See spec/i18n/prose.md, "A translation that runs far longer or
/// shorter than its source is reported".
fn expansion(region: Region, locale: &str) -> f32 {
	match (region, locale) {
		(Region::Frontmatter, "de-DE") => 1.29,
		(Region::Frontmatter, "en-US") => 1.00,
		(Region::Frontmatter, "es-ES") => 1.15,
		(Region::Frontmatter, "fr-FR") => 1.21,
		(Region::Frontmatter, "ja-JP") => 0.93,
		(Region::Frontmatter, "ko-KR") => 0.86,
		(Region::Frontmatter, "zh-CN") => 0.82,
		(Region::Frontmatter, "zh-TW") => 0.83,
		(Region::Body, "de-DE") => 1.78,
		(Region::Body, "en-US") => 1.51,
		(Region::Body, "es-ES") => 1.71,
		(Region::Body, "fr-FR") => 1.76,
		(Region::Body, "ja-JP") => 1.43,
		(Region::Body, "ko-KR") => 1.22,
		(Region::Body, "zh-CN") => 1.04,
		(Region::Body, "zh-TW") => 1.02,
		_ => 1.0,
	}
}

/// Sources below this draw too little ink for a ratio to mean anything: one word either way
/// swings it past any threshold, and the shortest strings in the corpus are the ones where a
/// language legitimately needs a different number of words.
const MIN_SOURCE_PX: f32 = 40.0;

/// The band a translation may sit in against what its own language usually spends.
///
/// Measured across the corpus after dividing by `expansion`: 0.35 to 2.16, with 8 of 2848 pairs
/// outside this band. Those eight are the price of the half of this check that can see a whole
/// row of translations drifting the same way, which the sibling test below cannot.
const ALONE_SHORT: f32 = 0.45;
const ALONE_LONG: f32 = 2.2;

/// The band a translation may sit in relative to what its siblings made of the same source.
///
/// Measured: across the corpus this quantity spans 0.51 to 1.86 with 99% inside 1.43, so the
/// band clears the observed extremes by about a fifth on each side and flags nothing that is
/// there today. It is the half that survives an article written in a language the corpus has
/// little of, because a source-language shift moves every sibling together and cancels.
const APART_SHORT: f32 = 0.4;
const APART_LONG: f32 = 2.2;

/// Report a translation whose length disagrees with what its own language usually spends, or
/// with what its siblings made of the same source -- two tests, since each is blind to what the
/// other catches. This is `display`'s backstop for body prose, which has no fixed-width budget
/// to compare against. See spec/i18n/prose.md, "A translation that runs far longer or shorter
/// than its source is reported".
pub fn lengths(
	segment_id: &str,
	source: &str,
	region: Region,
	field: Option<Display>,
	texts: &[(&str, &str)],
) -> Vec<Finding> {
	// A short form is shorter than its source by construction -- that is the whole of its job --
	// so measuring it against the source says only that it did it. The long form of the same
	// field is measured, which is where padding shows up anyway.
	if field.is_some_and(Display::is_short) {
		return Vec::new();
	}
	let src = width::pixels(source);
	if src < MIN_SOURCE_PX || texts.len() < 4 {
		return Vec::new();
	}

	let mut scaled: Vec<(&str, f32)> = texts
		.iter()
		.map(|(locale, text)| (*locale, width::pixels(text) / src / expansion(region, locale)))
		.collect();
	let mut sorted: Vec<f32> = scaled.iter().map(|(_, v)| *v).collect();
	sorted.sort_by(|a, b| a.partial_cmp(b).expect("widths are finite"));
	let middle = sorted.len() / 2;
	let centre = if sorted.len() % 2 == 0 {
		(sorted[middle - 1] + sorted[middle]) / 2.0
	} else {
		sorted[middle]
	};
	if centre <= 0.0 {
		return Vec::new();
	}

	scaled.sort_by(|a, b| a.0.cmp(b.0));
	scaled
		.into_iter()
		.filter_map(|(locale, value)| {
			let apart = value / centre;
			let reason = if value > ALONE_LONG || apart > APART_LONG {
				format!("runs {:.1}x the length this source usually takes in {locale}", value)
			} else if value < ALONE_SHORT || apart < APART_SHORT {
				format!("runs {:.1}x the length this source usually takes in {locale}", value)
			} else {
				return None;
			};
			Some(Finding {
				segment: segment_id.to_owned(),
				locale: locale.to_owned(),
				reason: format!("{reason}; read it against the source and the other locales"),
			})
		})
		.collect()
}

/// Findings from comparing locales of one segment: a check `validate` cannot make since it looks
/// at a single locale in isolation. See spec/i18n/request.md, "Two views of one language are
/// each other's control".
pub fn across_locales(segment_id: &str, source: &str, texts: &[(&str, &str)]) -> Vec<Finding> {
	let mut findings = Vec::new();
	if width::raw(source) < PAIR_FLOOR {
		return findings;
	}
	for (index, (locale, text)) in texts.iter().enumerate() {
		let language = locale.split('-').next();
		for (other, other_text) in texts.iter().skip(index + 1) {
			if other.split('-').next() != language {
				continue;
			}
			let (a, b) = (width::raw(text), width::raw(other_text));
			let (low, high) = (a.min(b), a.max(b));
			if high == 0 {
				continue;
			}
			#[expect(
				clippy::cast_precision_loss,
				reason = "column counts are far below the range where f64 loses integers"
			)]
			let ratio = low as f64 / high as f64;
			if ratio < PAIR_RATIO {
				findings.push(Finding {
					segment: segment_id.to_owned(),
					locale: format!("{locale}/{other}"),
					reason: format!(
						"two views of one language differ by half ({locale} {a} columns, {other} \
						 {b}, source {}) -- one of them is probably about a different block",
						width::raw(source),
					),
				});
			}
		}
	}
	findings
}

#[cfg(test)]
mod tests {
	use super::*;

	/// Prose whose source is stood in for by one carrying the same author's notes.
	///
	/// The note policies under test read neither the source's words nor its width, but the
	/// wrong-block check counts its `:fn` directives, and a source of `""` would make every
	/// fixture below look like an answer about a different block.
	/// The eight locales, paired with texts, in the order the store hands them over.
	fn row<'a>(texts: [&'a str; 8]) -> Vec<(&'a str, &'a str)> {
		["de-DE", "en-US", "es-ES", "fr-FR", "ja-JP", "ko-KR", "zh-CN", "zh-TW"]
			.into_iter()
			.zip(texts)
			.collect()
	}

	#[test]
	fn a_row_of_faithful_translations_is_not_reported() {
		let source = "从魔法到降解，把结构交给编译器去读";
		let findings = lengths(
			"id",
			source,
			Region::Frontmatter,
			Some(Display::Subtitle),
			&row([
				"Von Magie zum Lowering, die Struktur liest der Compiler",
				"From magic to lowering, with the compiler reading the structure",
				"De magia a lowering, con el compilador leyendo la estructura",
				"De la magie au lowering, la structure lue par le compilateur",
				"魔法から lowering へ、構造はコンパイラが読む",
				"마법에서 lowering으로, 구조는 컴파일러가 읽는다",
				"从魔法到降解，把结构交给编译器去读",
				"從魔法到降解，把結構交給編譯器去讀",
			]),
		);
		assert_eq!(findings, Vec::new());
	}

	#[test]
	fn a_translation_that_answered_a_wider_question_is_reported() {
		// The case this check was written for: a four-word subtitle came back as a sentence with
		// a clause the source does not have. Seven of the eight padded, which moves the sibling
		// centre with them -- so what catches it is the half that judges a locale against its own
		// language's habit. See spec/i18n/prose.md.
		let source = "From magic to lowering.";
		let findings = lengths(
			"id",
			source,
			Region::Frontmatter,
			Some(Display::Subtitle),
			&row([
				"Von Magie zum Lowering: Rendering neu gedacht.",
				"From magic to lowering.",
				"De magia a lowering: replanteando el renderizado.",
				"De la magie au lowering : repenser le rendu.",
				"魔法から低レベルへ：レンダリングをリファクタリング。",
				"마법에서 lowering으로: 렌더링 흐름 재구성.",
				"从魔法到降维：重构渲染流水线。",
				"從魔法到降維：重構渲染流程。",
			]),
		);
		assert!(
			findings.iter().any(|found| found.locale == "ja-JP"),
			"expected the padded Japanese to be reported, got {findings:?}"
		);
	}

	#[test]
	fn a_short_form_is_not_measured_against_the_source_it_shortens() {
		// Being shorter is the job, so the ratio only ever says it was done.
		let source = "A placeholder, kept only until the real piece is written";
		let texts = row([
			"Platzhalter, bis der Text da ist",
			"A placeholder until the real text",
			"Un hueco hasta que se escriba",
			"Une réservation, le temps du vrai",
			"本文が書かれるまでの仮置き",
			"진짜 글이 쓰일 때까지만",
			"临时占位，等正文写好",
			"暫時占位，等正文寫好",
		]);
		assert_eq!(
			lengths("id", source, Region::Frontmatter, Some(Display::ShortSubtitle), &texts),
			Vec::new()
		);
		assert!(
			!lengths("id", source, Region::Frontmatter, Some(Display::Subtitle), &texts).is_empty(),
			"the same texts as a full subtitle are short enough to report"
		);
	}

	fn of_prose(id: &str, locale: &str, text: &str, glosses: Option<&tn::Entry>) -> Vec<Finding> {
		let source = ":fn[x]{is=\"y\"}".repeat(text.matches(":fn[").count());
		of(id, locale, text, Kind::Prose, &source, glosses)
	}

	fn gloss(phrase: &str) -> tn::Entry {
		tn::Entry {
			source: String::new(),
			spans: vec![tn::Gloss { phrase: phrase.to_owned(), guidance: String::new() }],
		}
	}

	#[test]
	fn a_restating_explanation_is_reported_and_a_continuing_one_is_not() {
		let restating =
			of_prose("s", "en-US", r#"The :fn[model]{is="model means the runtime"} here"#, None);
		assert_eq!(restating.len(), 1);
		assert!(restating[0].reason.contains("restates"));
		let continuing =
			of_prose("s", "en-US", r#"The :fn[model]{is="the runtime, not the data"} here"#, None);
		assert!(continuing.is_empty());
	}

	#[test]
	fn restatement_ignores_case_and_leading_punctuation() {
		let found = of_prose("s", "en-US", r#":fn[Seam]{is="-- seam is a protocol"} x"#, None);
		assert_eq!(found.len(), 1);
	}

	#[test]
	fn han_inside_a_latin_locales_tn_is_reported() {
		let text = r#"he :tn[鸽了]{is="a note"} it"#;
		assert_eq!(of_prose("s", "en-US", text, None).len(), 1);
		// The same words in a Han-script locale say nothing.
		assert!(of_prose("s", "zh-TW", text, None).is_empty());
	}

	#[test]
	fn a_note_that_skips_the_original_is_reported_and_a_quoting_one_is_not() {
		let glosses = gloss("鸽");
		let skipping = r#"he :tn[put it off]{is="the source said postponing, like a no-show"} it"#;
		assert_eq!(of_prose("s", "en-US", skipping, Some(&glosses)).len(), 1);
		let quoting = r#"he :tn[put it off]{is="the source word 鸽, literally pigeon, means standing someone up"} it"#;
		assert!(of_prose("s", "en-US", quoting, Some(&glosses)).is_empty());
	}

	#[test]
	fn two_views_of_one_language_are_read_against_each_other() {
		// The block that started this: zh-TW held the next paragraph's translation. Well-formed,
		// a plausible paragraph length, every marker present -- and half the length of its own
		// zh-CN sibling, which is the only thing about it that was wrong.
		let source = "今天已经是我 move 到 US 来的整整一个月了；落地 NC 日常安顿好后，周围的地区和比较近的景点也基本上逛完了，那么人就闲下来了。";
		let found = across_locales(
			"s",
			source,
			&[
				(
					"en-US",
					"Today marks exactly one month since I moved to the US; after landing in NC and getting settled in, I have seen most of what is nearby, so now I have time on my hands.",
				),
				(
					"zh-CN",
					"今天正好是我搬到美国满一个月。落地北卡后，日常起居都安顿好了，附近的地区和几个稍近的景点也基本逛遍了，人就闲了下来。",
				),
				("zh-TW", "不過在開始吐槽別人之前，大概還是得先補一點背景知識"),
			],
		);
		assert_eq!(found.len(), 1);
		assert_eq!(found[0].locale, "zh-CN/zh-TW");
		assert!(found[0].reason.contains("differ by half"));

		// Two views that agree are silent, and locales of different languages are never compared:
		// German is simply longer than Japanese and always was.
		assert!(
			across_locales(
				"s",
				source,
				&[
					(
						"zh-CN",
						"今天正好是我搬到美国满一个月。落地北卡后，日常起居都安顿好了，附近的地区也基本逛遍了。"
					),
					(
						"zh-TW",
						"今天正好是我搬到美國滿一個月。落地北卡後，日常起居都安頓好了，附近的地區也基本逛遍了。"
					),
				],
			)
			.is_empty()
		);
	}

	#[test]
	fn a_short_block_may_have_divergent_views_of_one_language() {
		// Under the floor a same-language pair legitimately differs by half: one leaves the
		// fragment alone and the other spells it into a sentence. Both are correct.
		assert!(
			across_locales(
				"s",
				"甚至模式匹配",
				&[("zh-CN", "甚至连模式匹配也不例外。"), ("zh-TW", "甚至模式匹配")],
			)
			.is_empty()
		);
	}

	#[test]
	fn a_wrong_block_answer_is_reported_over_what_is_already_stored() {
		// The same invariant `validate` refuses on arrival: an author's note the source does not
		// have came from somewhere else.
		let found = of(
			"s",
			"ko-KR",
			r#"지난 글에서도 썼듯이 :fn[프로토콜 노드]{is="구조 단위"}"#,
			Kind::Prose,
			"只可惜之前我 UI 选了 React 开始动刀",
			None,
		);
		assert_eq!(found.len(), 1);
		assert!(found[0].reason.contains("neighbouring block"));
	}

	#[test]
	fn a_phrase_that_cannot_be_quoted_verbatim_is_matched_without_its_quotes() {
		// `"清"字` is the author quoting one character. No note can reproduce it: a straight
		// double quote ends the attribute, so a literal comparison fails however well the note
		// cites the character.
		let glosses = gloss("\"清\"字");
		assert_eq!(quotable("\"清\"字").collect::<Vec<_>>(), vec!["清", "字"]);
		// A phrase with no quote in it is compared whole, as before.
		assert_eq!(quotable("两点一线").collect::<Vec<_>>(), vec!["两点一线"]);

		let citing =
			r#"the :tn[clear]{is="The original uses one character, 清, at once fresh and cool"} smell"#;
		assert!(of_prose("s", "en-US", citing, Some(&glosses)).is_empty());

		let silent = r#"the :tn[clear]{is="no single English word carries all three senses"} smell"#;
		assert_eq!(of_prose("s", "en-US", silent, Some(&glosses)).len(), 1);
	}

	#[test]
	fn a_translation_with_no_directives_has_no_findings() {
		assert!(of_prose("s", "en-US", "plain prose", None).is_empty());
		// A recorded gloss without any tn in the text is missing work, not a policy finding --
		// the completeness audit owns that.
		assert!(of_prose("s", "en-US", "plain prose", Some(&gloss("鸽"))).is_empty());
	}
}
