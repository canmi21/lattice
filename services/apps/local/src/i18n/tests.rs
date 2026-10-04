use super::*;
use std::collections::BTreeMap;

#[test]
fn a_page_is_refused_by_name_and_an_article_is_not() {
	// The filter in `run` is what actually keeps pages out. This is the second line: it has to
	// name the file that arrived, so a run that suddenly reports one says why rather than just
	// failing somewhere further in.
	let refused = refuse_page(Path::new("contents/homepage.md")).unwrap_err();
	assert!(refused.contains(PAGE_FILE), "{refused}");
	assert!(refused.contains("spec/i18n/copy.md"), "{refused}");

	assert!(refuse_page(Path::new("contents/architecture/homepage.md")).is_err());
	assert!(refuse_page(Path::new("contents/milestone/less-is-more.md")).is_ok());
	// Only the whole name. An article may end in those letters without being a page.
	assert!(refuse_page(Path::new("contents/notes/not-homepage.md")).is_ok());
}

#[test]
fn parallelism_defaults_to_four_and_rejects_zero() {
	assert_eq!(parallelism(None).unwrap(), 4);
	assert_eq!(parallelism(Some("10")).unwrap(), 10);
	assert!(parallelism(Some("0")).is_err());
	assert!(parallelism(Some("many")).is_err());
}

#[test]
fn locale_selection_is_validated_and_keeps_canonical_order() {
	assert_eq!(
		selected_locales(&["zh-TW".into(), "en-US".into(), "zh-TW".into()]).unwrap(),
		vec!["en-US", "zh-TW"]
	);
	assert!(selected_locales(&["mw".into()]).is_err());
}

#[test]
fn frontmatter_scope_never_selects_body_prose() {
	let segments = segment::split(
		"---\ntitle: Visible title\nlang: en-US\n---\n\nBody that must stay out of this run.",
	)
	.expect("frontmatter");
	let selected =
		segments.iter().filter(|segment| Scope::Frontmatter.includes(segment)).collect::<Vec<_>>();

	// The title and the short form written from it, and nothing from the body.
	assert_eq!(selected.len(), 2);
	assert!(selected.iter().all(|segment| segment.source == "Visible title"));
	assert!(selected.iter().all(|segment| segment.region == segment::Region::Frontmatter));
	assert_eq!(
		selected.iter().map(|segment| segment.display).collect::<Vec<_>>(),
		vec![Some(segment::Display::Title), Some(segment::Display::ShortTitle)],
	);
}

#[test]
fn a_note_that_would_print_its_own_braces_is_refused() {
	// `:tn[words]{is="..."}` fails as a whole when any part of it is off, and fails quietly:
	// the parser stops seeing a directive and the braces render as text beside an empty
	// title. 90 of the first 168 markers were malformed this way, nearly all of them a
	// missing closing quote.
	assert!(validate::notes_well_formed("a :tn[word]{is=\"a note\"} b"));
	assert!(validate::notes_well_formed("nothing to check here"));

	// The one that reached a page: no closing quote, so the whole attribute block is text.
	assert!(!validate::notes_well_formed("a :tn[word]{is=\"a note} b"));
	// The syntax has no escape for a quote inside the value; it simply ends there.
	assert!(!validate::notes_well_formed("a :tn[word]{is=\"he said \"no\" loudly\"} b"));
	assert!(!validate::notes_well_formed("a :tn[word] b"));
	assert!(!validate::notes_well_formed("a :tn[word]{was=\"wrong key\"} b"));
}

#[test]
fn a_frontmatter_note_is_refused_before_it_can_be_stored() {
	// Metadata has no rendering channel for the explanation. Prompt wording is not an
	// acceptance boundary, so a model that ignores it must enter the retry path here.
	let boundary = "F7Q2L9DM4KX8V1C6R0PB3HNS5WJATGEU";
	let reply =
		format!("{}\n:tn[Translated title]{{is=\"a gloss\"}}\n", prompt::locale_marker("en-US"),);

	assert!(matches!(
		validate_reply(&reply, boundary, segment::Region::Frontmatter, &segment::mask("Source title"),),
		Err(Refusal::Failed(_))
	));
}

#[test]
fn a_reply_carrying_the_neighbouring_paragraphs_is_refused() {
	// Measured from four articles: seventeen stored translations held their own block plus a
	// neighbour that had been supplied as context. Filed under this block's id, the extra
	// prose then surfaced untranslated inside an unrelated view, a long way from the reply
	// that caused it. A block does not gain lines in translation, so the shape says so.
	let boundary = "K3QZ7XW1M8ND5VBRTY2LPCFA6GHJ0SEU";
	let source = "::linkcard{src=\"a.avif\" url=\"https://example.com\" title=\"One\"}";
	let echoed = format!(
		"{}\n::linkcard{{src=\"b.avif\" url=\"https://other.example\" title=\"Two\"}}\n\
		 A paragraph that belongs to the block before this one.\n{source}\n",
		prompt::locale_marker("en-US"),
	);
	assert!(matches!(
		validate_reply(&echoed, boundary, segment::Region::Body, &segment::mask(source)),
		Err(Refusal::Failed(_))
	));

	// The same block answered on its own is kept, so the check costs nothing that is correct.
	let clean = format!(
		"{}\n::linkcard{{src=\"a.avif\" url=\"https://example.com\" title=\"Eins\"}}\n",
		prompt::locale_marker("de-DE"),
	);
	assert!(validate_reply(&clean, boundary, segment::Region::Body, &segment::mask(source)).is_ok());
}

#[test]
fn a_multi_line_block_may_keep_its_lines() {
	// A list translates line for line, so the rule is "no more than", never "exactly one".
	let boundary = "PQ9WZ4WX2TN7VLKD8RYC5MBFA1GHJ0SE";
	let source = "- first\n- second\n- third";
	let reply = format!("{}\n- erste\n- zweite\n- dritte\n", prompt::locale_marker("de-DE"),);
	assert!(validate_reply(&reply, boundary, segment::Region::Body, &segment::mask(source)).is_ok());
}

#[test]
fn an_exact_source_locale_may_be_rewritten_as_a_localised_view() {
	let boundary = "JQ8WZ4MX2TN7VLKD9RYC5PBFA1GH30SE";
	let source = "这是一段作者写下来的原文，它的措辞、节奏和判断都应该保持不变。";
	let polished = format!(
		"{}\n这是一段作者写下来的原文，它的措辞、节奏和判断都应该保持不变！\n",
		prompt::locale_marker("zh-CN"),
	);
	let rewritten = format!(
		"{}\n作者在这里主张，编辑应当完整保存文章的核心思想和表达方式。\n",
		prompt::locale_marker("zh-CN"),
	);
	let masked = segment::mask(source);

	assert!(
		validate_reply_for(
			&polished,
			boundary,
			segment::Kind::Prose,
			segment::Region::Body,
			source,
			&masked,
			&["zh-CN"],
			Some("zh-CN"),
		)
		.is_ok()
	);
	assert!(
		validate_reply_for(
			&rewritten,
			boundary,
			segment::Kind::Prose,
			segment::Region::Body,
			source,
			&masked,
			&["zh-CN"],
			Some("zh-CN"),
		)
		.is_ok()
	);
}

#[test]
fn a_boundary_echo_cannot_reach_a_sidecar() {
	let boundary = "VVF4KTLBKEI0X2NJT7FOCD2N6HO4C0N2";
	let reply = format!(
		"{}\n{boundary}\nPaid-for prose remains intact.\n{boundary}\n",
		prompt::locale_marker("en-US"),
	);
	let result = validate_reply(&reply, boundary, segment::Region::Body, &segment::mask("source"));
	assert!(matches!(&result, Err(Refusal::Failed(_))));

	let mut sidecar = store::Sidecar::default();
	if let Ok(entries) = result {
		sidecar.segments.insert(
			"segment".to_owned(),
			entries
				.into_iter()
				.map(|(locale, text)| {
					(
						locale,
						Translation {
							text,
							provider: "openai".to_owned(),
							model: "gpt-oss-120b-medium".to_owned(),
							at: "2026-08-02T00:00:00Z".to_owned(),
							seconds: 1.0,
							tokens: 10,
							review: false,
						},
					)
				})
				.collect::<BTreeMap<_, _>>(),
		);
	}
	assert!(sidecar.segments.is_empty());
	assert!(!serde_yaml_ng::to_string(&sidecar).expect("sidecar").contains(boundary));
}
