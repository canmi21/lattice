use super::*;
use crate::alt::SOURCE_LOCALE;
use crate::i18n::segment::Kind;

/// A repository root that removes itself, with `data/` already in place.
///
/// This was a hand-rolled `Temp` with its own `Drop` and an atomic counter, because two tests
/// in one process choosing the same name would otherwise share a directory. `TempDir` is the
/// same guarantee without the counter: uniqueness is the library's, not a name's.
fn temp() -> tempfile::TempDir {
	let temporary = tempfile::tempdir().expect("temp");
	std::fs::create_dir_all(
		temporary.path().join(crate::image::run::MERGED).parent().expect("record dir"),
	)
	.expect("record directory");
	temporary
}

fn translation(text: &str) -> Translation {
	Translation {
		text: text.to_owned(),
		provider: "anthropic".to_owned(),
		model: "claude-sonnet-5".to_owned(),
		at: "2026-08-01T00:00:00Z".to_owned(),
		seconds: 1.0,
		tokens: 10,
		review: false,
	}
}

fn answer(text: &str) -> Answer {
	Answer { text: text.to_owned(), model: "gpt-oss-120b-medium".to_owned(), tokens: 12, usd: 0.0 }
}

fn ordinary(
	source: &str,
	meaning: &str,
	entries: impl IntoIterator<Item = (&'static str, Translation)>,
) -> tags::Tag {
	let mut display =
		std::collections::BTreeMap::from([(SOURCE_LOCALE.to_owned(), translation(source))]);
	display.extend(entries.into_iter().map(|(locale, translation)| (locale.to_owned(), translation)));
	tags::Tag::Ordinary { source: source.to_owned(), meaning: meaning.to_owned(), display }
}

fn marked(entries: &[(&str, &str)]) -> String {
	entries
		.iter()
		.map(|(locale, text)| format!("{}\n{text}\n", crate::i18n::prompt::locale_marker(locale)))
		.collect::<Vec<_>>()
		.join("\n")
}

/// A value another run holds a claim on is left to it, and no request is made for it.
///
/// The claim is what stops two runs paying for the same translation. Counting requests is
/// the check that matters: a run that skipped the write but still asked would have spent
/// the money anyway.
#[tokio::test]
async fn a_value_another_run_claimed_is_not_translated_again() {
	let temp = temp();
	let mut registry = tags::Registry::default();
	registry.tags.insert(
		"terminal".to_owned(),
		ordinary("Terminal", "terminal emulator or command-line window", []),
	);
	tags::save(&tags::path_for(&temp.path()), &registry).expect("tags");

	let held = claim::take(&temp.path(), "locale", "tag terminal/").expect("claim");
	let mut requests = 0;
	let outcome = run_with(&temp.path(), Runner::GptOss, false, None, &["zh-CN"], |_, _, _| {
		requests += 1;
		async { Ok(answer("终端")) }
	})
	.await
	.expect("run");
	drop(held);

	assert_eq!(requests, 0);
	assert_eq!(outcome.claimed_elsewhere, 1);
	assert_eq!(outcome.translated, 0);
}

#[tokio::test]
async fn an_existing_translation_is_skipped_without_a_request() {
	let temp = temp();
	let mut registry = tags::Registry::default();
	registry.tags.insert(
		"terminal".to_owned(),
		ordinary(
			"Terminal",
			"terminal emulator or command-line window",
			[("zh-CN", translation("终端"))],
		),
	);
	tags::save(&tags::path_for(&temp.path()), &registry).expect("tags");

	let mut requests = 0;
	let outcome = run_with(&temp.path(), Runner::GptOss, false, None, &["zh-CN"], |_, _, _| {
		requests += 1;
		std::future::ready(Ok(answer("unexpected")))
	})
	.await
	.expect("run");

	assert_eq!(requests, 0);
	assert_eq!(outcome.skipped, 1);
	assert_eq!(
		tags::load(&tags::path_for(&temp.path())).expect("tags").tags["terminal"]
			.translations()
			.expect("ordinary")["zh-CN"],
		registry.tags["terminal"].translations().expect("ordinary")["zh-CN"]
	);
}

#[tokio::test]
async fn force_never_overwrites_the_source_locale() {
	let temp = temp();
	let mut described = media::Media::default();
	described.media.insert(
		"asset".to_owned(),
		media::Entry {
			description: std::collections::BTreeMap::from([(
				SOURCE_LOCALE.to_owned(),
				translation("Original description"),
			)]),
			..media::Entry::default()
		},
	);
	media::save(&media::path_for(&temp.path()), &described).expect("media");

	let outcome =
		run_with(&temp.path(), Runner::GptOss, true, None, &[SOURCE_LOCALE, "zh-CN"], |_, _, _| {
			std::future::ready(Ok(answer("translated")))
		})
		.await
		.expect("run");

	assert_eq!(outcome.translated, 1);
	let saved_media = media::load(&media::path_for(&temp.path())).expect("media");
	assert_eq!(saved_media.media["asset"].description[SOURCE_LOCALE].text, "Original description");
}

#[tokio::test]
async fn a_failed_unit_does_not_discard_another_answer() {
	let temp = temp();
	let mut registry = tags::Registry::default();
	registry.tags.insert("first".to_owned(), ordinary("First", "first concept", []));
	registry.tags.insert("second".to_owned(), ordinary("Second", "second concept", []));
	tags::save(&tags::path_for(&temp.path()), &registry).expect("tags");

	let mut requests = 0;
	let outcome =
		run_with(&temp.path(), Runner::GptOss, false, None, &[SOURCE_LOCALE, "zh-CN"], |_, _, _| {
			requests += 1;
			std::future::ready(if requests <= ATTEMPTS {
				Err(Refusal::Failed("bad answer".to_owned()))
			} else {
				Ok(answer(&marked(&[("zh-CN", "第二")])))
			})
		})
		.await
		.expect("run");

	assert_eq!(outcome.failed.len(), 1);
	assert_eq!(outcome.translated, 1);
	let saved = tags::load(&tags::path_for(&temp.path())).expect("tags");
	assert_eq!(saved.tags["first"].translations().expect("ordinary").len(), 1);
	assert_eq!(saved.tags["second"].translations().expect("ordinary")["zh-CN"].text, "第二");
}

#[tokio::test]
async fn a_technical_tag_never_produces_a_translation_request() {
	let temp = temp();
	let mut registry = tags::Registry::default();
	registry.tags.insert(
		"typescript".to_owned(),
		tags::Tag::Technical {
			display: "TypeScript".to_owned(),
			meaning: "programming language".to_owned(),
		},
	);
	tags::save(&tags::path_for(&temp.path()), &registry).expect("tags");

	let mut requests = 0;
	let outcome =
		run_with(&temp.path(), Runner::GptOss, true, None, &crate::i18n::prompt::LOCALES, |_, _, _| {
			requests += 1;
			std::future::ready(Ok(answer("unexpected")))
		})
		.await
		.expect("run");

	assert_eq!(requests, 0);
	assert_eq!(outcome.sources, 0);
}

#[tokio::test]
async fn one_tag_requests_every_non_source_locale_once() {
	let temp = temp();
	let mut registry = tags::Registry::default();
	registry
		.tags
		.insert("browser".to_owned(), ordinary("Browser", "software for viewing websites", []));
	tags::save(&tags::path_for(&temp.path()), &registry).expect("tags");
	let translations: Vec<(&str, &str)> = crate::i18n::prompt::LOCALES
		.iter()
		.filter(|locale| **locale != SOURCE_LOCALE)
		.map(|locale| (*locale, *locale))
		.collect();
	let reply = marked(&translations);
	let mut requests = 0;

	let outcome = run_with(
		&temp.path(),
		Runner::GptOss,
		true,
		None,
		&crate::i18n::prompt::LOCALES,
		|_, prompt, _| {
			requests += 1;
			for locale in
				crate::i18n::prompt::LOCALES.into_iter().filter(|locale| *locale != SOURCE_LOCALE)
			{
				assert!(prompt.contains(&crate::i18n::prompt::locale_marker(locale)));
			}
			assert!(!prompt.contains(&crate::i18n::prompt::locale_marker(SOURCE_LOCALE)));
			std::future::ready(Ok(answer(&reply)))
		},
	)
	.await
	.expect("run");

	assert_eq!(requests, 1);
	assert_eq!(outcome.translated, crate::i18n::prompt::LOCALES.len() - 1);
	let saved = tags::load(&tags::path_for(&temp.path())).expect("tags");
	let display = saved.tags["browser"].translations().expect("ordinary");
	assert_eq!(display.len(), crate::i18n::prompt::LOCALES.len());
	assert_eq!(display[SOURCE_LOCALE].model, "claude-sonnet-5");
	assert_eq!(display[SOURCE_LOCALE].tokens, 10);
	assert!(
		display
			.iter()
			.filter(|(locale, _)| locale.as_str() != SOURCE_LOCALE)
			.all(|(_, translation)| translation.tokens == 12)
	);
}

#[tokio::test]
async fn the_limit_reaches_tags_before_descriptions() {
	let temp = temp();
	let mut registry = tags::Registry::default();
	registry.tags.insert(
		"terminal".to_owned(),
		ordinary("Terminal", "terminal emulator or command-line window", []),
	);
	tags::save(&tags::path_for(&temp.path()), &registry).expect("tags");

	let mut described = media::Media::default();
	described.media.insert(
		"000-first-by-key".to_owned(),
		media::Entry {
			description: std::collections::BTreeMap::from([(
				SOURCE_LOCALE.to_owned(),
				translation("A long description"),
			)]),
			..media::Entry::default()
		},
	);
	media::save(&media::path_for(&temp.path()), &described).expect("media");

	let mut prompts = Vec::new();
	let outcome = run_with(
		&temp.path(),
		Runner::GptOss,
		false,
		Some(1),
		&[SOURCE_LOCALE, "zh-CN"],
		|_, prompt, _| {
			prompts.push(prompt);
			std::future::ready(Ok(answer(&marked(&[("zh-CN", "终端")]))))
		},
	)
	.await
	.expect("run");

	assert_eq!(prompts.len(), 1);
	assert!(prompts[0].contains("Raw identifier: terminal"));
	assert_eq!(outcome.deferred, 1);
	assert!(
		!media::load(&media::path_for(&temp.path())).expect("media").media["000-first-by-key"]
			.description
			.contains_key("zh-CN")
	);
}

#[test]
fn a_tag_prompt_carries_one_raw_name_and_every_target_locale() {
	let item = Item {
		destination: Destination::Tag("cellular-network".to_owned()),
		source: "Cellular Network".to_owned(),
		source_locale: SOURCE_LOCALE.to_owned(),
		meaning: Some("mobile carrier connectivity and SIM service, not biology".to_owned()),
		locales: vec!["zh-CN".to_owned()],
		kind: Kind::Heading,
	};
	let text = tag_request(&item);
	assert!(text.contains("ordinary tag"));
	assert!(text.contains("Raw identifier: cellular-network"));
	assert!(text.contains("English source label: Cellular Network"));
	assert!(text.contains("not biology"));
	assert!(text.contains("ready-to-render standalone UI label"));
	assert!(text.contains("en-US uses Title Case"));
	assert!(text.contains(&crate::i18n::prompt::locale_marker("zh-CN")));
}
