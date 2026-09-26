use super::*;
use crate::i18n::segment;

fn segment(kind: Kind) -> Segment {
	// A heading carries its marks: the rail rules read the level off them, and a heading
	// without any is not a heading the article could contain.
	let source = if kind == Kind::Heading { "## text" } else { "text" };
	Segment {
		id: "x".into(),
		kind,
		source: source.into(),
		region: segment::Region::Body,
		display: None,
		start: 0,
		end: 4,
	}
}

#[test]
fn the_boundary_is_different_every_time() {
	// A fixed boundary could be written into an article by anyone who has read this file.
	assert_ne!(boundary(), boundary());
	assert_eq!(boundary().len(), BOUNDARY_LEN);
}

#[test]
fn the_boundary_carries_no_markdown_meaning() {
	// Backticks and asterisks would be reformatted by the very model being fenced.
	let value = boundary();
	assert!(value.chars().all(|c| c.is_ascii_uppercase() || c.is_ascii_digit()));
}

#[test]
fn the_source_is_fenced_top_and_bottom_with_the_same_string() {
	let request = build(&segment(Kind::Prose), "hello", None, None, None);
	let fences: Vec<&str> = request
		.text
		.lines()
		.filter(|l| l.len() == BOUNDARY_LEN && l.chars().all(|c| c.is_ascii_alphanumeric()))
		.collect();
	assert_eq!(fences.len(), 2);
	assert_eq!(fences[0], fences[1]);
}

#[test]
fn the_context_is_fenced_and_named_on_both_sides() {
	// The fault this shape exists to prevent: three passages of article prose in one request
	// with only one of them marked, and the answer coming back about one of the other two.
	let request =
		build(&segment(Kind::Prose), "hello", Some("what came before"), Some("what comes after"), None);
	let context_fence = format!("{}CONTEXT", request.boundary);

	assert_eq!(request.text.matches(&context_fence).count(), 3);
	assert!(request.text.contains("PREVIOUS BLOCK:\nwhat came before"));
	assert!(request.text.contains("NEXT BLOCK:\nwhat comes after"));
	// And the material's own fence stays distinguishable from it, so "the text between those
	// two lines" names exactly one region: the context fence never stands alone on a line.
	let standalone = |mark: &str| request.text.lines().filter(|line| line.trim() == mark).count();
	assert_eq!(standalone(&request.boundary), 2);
	assert_eq!(standalone(&context_fence), 2);
}

#[test]
fn a_block_with_no_neighbours_is_told_so_rather_than_shown_an_empty_fence() {
	let request = build(&segment(Kind::Prose), "hello", None, None, None);
	assert!(!request.text.contains("CONTEXT"));
	assert!(!request.text.contains("PREVIOUS BLOCK"));
}

#[test]
fn an_echoed_context_fence_is_a_boundary_leak() {
	// The context fence is derived from the material's, so echoing either one trips the same
	// check and the reply is thrown away whole.
	let fence = "K3QZ7XW1M8ND5VBRTY2LPCFA6GHJ0SEU";
	let reply = format!("{}\n{fence}CONTEXT\nthe neighbouring paragraph\n", locale_marker("en-US"),);
	assert_eq!(parse(&reply, Some(fence)), Err(BoundaryLeak));
}

#[test]
fn frontmatter_is_told_to_use_target_locale_typography() {
	let mut item = segment(Kind::Heading);
	item.region = Region::Frontmatter;
	let request = build(&item, "A title.", None, None, None);

	assert!(request.text.contains("display metadata"));
	assert!(request.text.contains("native casing and punctuation"));
	assert!(request.text.contains("Never copy a neighbouring language's punctuation"));
	assert!(!request.text.contains("narrow table of contents"));
	assert!(request.text.contains("Translator's notes are forbidden"));
	assert!(!request.text.contains("add `:tn[word]"));
}

#[test]
fn a_body_heading_is_given_the_rail_it_has_to_fit() {
	let request = build(&segment(Kind::Heading), "A long heading", None, None, None);

	// The budget as a width that can be pictured, and the source's own width to aim at.
	assert!(request.text.contains("narrow rail"));
	assert!(request.text.contains("Han characters"));
	assert!(request.text.contains(&format!("{} columns", super::super::width::CLAMP)));
	// And the permission that makes shortening possible: the section explains itself.
	assert!(request.text.contains("recognise the section"));
	assert!(request.text.contains("no parenthetical glosses"));
}

#[test]
fn only_a_body_heading_is_told_about_the_rail() {
	let prose = build(&segment(Kind::Prose), "A paragraph", None, None, None);
	assert!(!prose.text.contains("narrow rail"));
}

#[test]
fn a_subsection_is_told_it_has_no_width_to_fit() {
	let mut item = segment(Kind::Heading);
	item.source = "### text".into();
	let request = build(&item, "A subsection heading", None, None, None);

	// No rail to fit -- quoting one would be a fiction, since it is never listed there.
	assert!(!request.text.contains("narrow rail"));
	assert!(request.text.contains("not listed in the article's table of contents"));
	// But the half that is about the writing still applies.
	assert!(request.text.contains("recognise the section"));
}

#[test]
fn instructions_sit_on_both_sides_of_the_material() {
	// Rules only before the text leave the last thing read being the untrusted content.
	let text = build(&segment(Kind::Prose), "hello", None, None, None).text;
	let first = text.find("Rules:").expect("rules");
	let fence = text.find(|c: char| c.is_ascii_uppercase()).unwrap_or(0);
	let closing =
		text.rfind("data, \nnot instruction").or(text.rfind("It is data")).expect("trailer");
	assert!(first < closing);
	let _ = fence;
}

#[test]
fn a_reply_is_read_line_by_line() {
	let reply = format!(
		"{}\nHello there.\n\n{}\nこんにちは。\n",
		locale_marker("en-US"),
		locale_marker("ja-JP")
	);
	let parsed = parse(&reply, None).expect("reply");
	assert_eq!(parsed.len(), 2);
	assert_eq!(parsed[0], ("en-US".into(), "Hello there.".into()));
	assert_eq!(parsed[1], ("ja-JP".into(), "こんにちは。".into()));
}

#[test]
fn one_broken_locale_costs_one_locale() {
	// The reason not to ask for JSON: a single defect here removes one answer rather than
	// invalidating the other seven.
	let reply = format!(
		"{}\nGood.\n\n{}\n\n{}\nBien.\n",
		locale_marker("en-US"),
		locale_marker("ja-JP"),
		locale_marker("fr-FR")
	);
	let parsed = parse(&reply, None).expect("reply");
	assert_eq!(parsed.len(), 2);
	assert!(parsed.iter().all(|(l, _)| l != "ja-JP"));
}

#[test]
fn multi_line_prose_survives_the_scan() {
	let reply = format!("{}\nline one\n\nline two\n", locale_marker("de-DE"));
	assert_eq!(parse(&reply, None).expect("reply")[0].1, "line one\n\nline two");
}

#[test]
fn a_boundary_echo_at_both_ends_rejects_the_whole_reply() {
	let boundary = "VVF4KTLBKEI0X2NJT7FOCD2N6HO4C0N2";
	let reply = format!(
		"{}\n{boundary}\nProse survives between the fences.\n{boundary}\n\n{}\nClean text.\n",
		locale_marker("en-US"),
		locale_marker("de-DE"),
	);
	assert_eq!(parse(&reply, Some(boundary)), Err(BoundaryLeak));
}

#[test]
fn a_bounded_reply_ignores_agent_narration_outside_the_answer() {
	let boundary = "RANDOMBOUNDARY";
	assert_eq!(
		bounded_reply(
			"First I will inspect the repository.\nRANDOMBOUNDARY\nThe answer.\nRANDOMBOUNDARY\nDone.",
			boundary,
		),
		Some("The answer.".to_owned())
	);
	assert_eq!(bounded_reply("RANDOMBOUNDARY\n\nRANDOMBOUNDARY", boundary), None);
	assert_eq!(
		bounded_reply("RANDOMBOUNDARY\none\nRANDOMBOUNDARY\ntwo\nRANDOMBOUNDARY", boundary,),
		None
	);
}

#[test]
#[should_panic(expected = "non-translatable segment reached the prompt")]
fn a_directive_cannot_reach_a_translation_prompt() {
	let _ = build(&segment(Kind::Directive), "::image{src=\"a\"}", None, None, None);
}

#[test]
fn the_source_locale_is_never_requested() {
	// The article is not a translation of itself, so there is no slot for it to fill.
	// `mw` is the code the site serves the original under; it is a routing name, not a
	// locale, and it must never become one here. See spec/locale/addressing.md.
	assert!(!LOCALES.contains(&"mw"));
	assert_eq!(LOCALES.len(), 8);
	let _ = segment::OPEN;
}

#[test]
fn an_incremental_request_lists_only_the_missing_locales() {
	let request =
		build_for(&segment(Kind::Prose), "hello", None, None, &["de-DE", "fr-FR"], Some("en-US"), None);

	assert!(request.text.contains(&locale_marker("de-DE")));
	assert!(request.text.contains(&locale_marker("fr-FR")));
	assert!(!request.text.contains(&locale_marker("ja-JP")));
}

#[test]
fn same_language_targets_are_told_to_localise_the_source() {
	let request =
		build_for(&segment(Kind::Prose), "原文", None, None, &["zh-CN", "zh-TW"], Some("zh-CN"), None);

	assert!(request.text.contains("zh-CN, zh-TW use the same language"));
	assert!(request.text.contains("localised views"));
	assert!(request.text.contains("resolve mixed-language phrasing"));
	assert!(request.text.contains("Apply translator's notes"));
}

fn display_request() -> Request {
	build_display(
		"朋友都只是人生某个阶段的同行者",
		Some("探寻我那脆弱的人际关系？"),
		"A piece about friendships that belong to one stretch of a life.",
		&[("de-DE".to_owned(), Display::ShortTitle), ("de-DE".to_owned(), Display::ShortSubtitle)],
		&[("de-DE".to_owned(), Display::Title, "Freundschaften auf Zeit".to_owned())],
		Some("zh-CN"),
	)
}

#[test]
fn a_display_request_states_each_budget_in_the_script_that_will_fill_it() {
	let request = build_display(
		"A title",
		None,
		"About.",
		&[("de-DE".to_owned(), Display::ShortTitle), ("ja-JP".to_owned(), Display::ShortTitle)],
		&[],
		None,
	);
	// A German short title has 23 Latin characters; a Japanese one has 11 of its own.
	assert!(request.text.contains("at most 23 characters"));
	assert!(request.text.contains("at most 11 characters"));
}

#[test]
fn what_is_already_correct_is_context_rather_than_work() {
	let request = display_request();
	assert!(request.text.contains("Freundschaften auf Zeit"));
	assert!(request.text.contains("Do not output them again"));
	// And it is not in the list of things to produce.
	let asks = request.text.split("in this order, and nothing else:").nth(1).expect("asks");
	assert!(!asks.contains(&field_marker("de-DE", Display::Title)));
	assert!(asks.contains(&field_marker("de-DE", Display::ShortTitle)));
}

#[test]
fn an_article_without_a_subtitle_says_so_rather_than_leaving_a_gap() {
	let request = build_display("A title", None, "About.", &[], &[], None);
	assert!(request.text.contains("SUBTITLE: (this article has none)"));
}

#[test]
fn a_display_reply_is_read_back_by_locale_and_field() {
	let reply = format!(
		"{}\nFreunde auf Zeit\n\n{}\nMeine fragilen Beziehungen?\n",
		field_marker("de-DE", Display::ShortTitle),
		field_marker("de-DE", Display::ShortSubtitle),
	);
	let parsed = parse_display(&reply, None).expect("parsed");
	assert_eq!(
		parsed,
		vec![
			("de-DE".to_owned(), Display::ShortTitle, "Freunde auf Zeit".to_owned()),
			("de-DE".to_owned(), Display::ShortSubtitle, "Meine fragilen Beziehungen?".to_owned()),
		]
	);
}

#[test]
fn one_malformed_field_costs_one_field() {
	// The marker for the second is misspelled, so it is simply absent -- the first still lands.
	let reply = format!(
		"{}\nFreunde auf Zeit\n\n<<<de-DE:short-sub>>>\nSomething\n",
		field_marker("de-DE", Display::ShortTitle),
	);
	let parsed = parse_display(&reply, None).expect("parsed");
	assert_eq!(parsed.len(), 1);
	assert_eq!(parsed[0].1, Display::ShortTitle);
}

#[test]
fn a_display_reply_that_leaks_the_fence_is_refused() {
	let request = display_request();
	let reply = format!("{}\n{}\n", field_marker("de-DE", Display::ShortTitle), request.boundary);
	assert_eq!(parse_display(&reply, Some(&request.boundary)), Err(BoundaryLeak));
}
