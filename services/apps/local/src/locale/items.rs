//! What `local locale` has to translate: the tag labels, descriptions, summaries and diagram
//! descriptions missing a locale, and the request each one is sent as. See `locale.rs`.

use crate::alt::SOURCE_LOCALE;
use crate::i18n::segment::Kind;
use crate::i18n::store::Translation;
use crate::{media, tags};
use std::path::Path;

#[derive(Debug, Clone)]
pub(super) enum Destination {
	Tag(String),
	Description(String),
	/// An article's summary, addressed by the path of the article it belongs to.
	Summary(std::path::PathBuf),
	/// A diagram's description, addressed by the hash of the block that draws it.
	Diagram(String),
}

#[derive(Debug, Clone)]
pub(super) struct Item {
	pub(super) destination: Destination,
	pub(super) source: String,
	/// The locale `source` is written in. `en-US` for everything a vision model produced;
	/// an article's own language for a summary, which is written where the article was.
	pub(super) source_locale: String,
	pub(super) meaning: Option<String>,
	pub(super) locales: Vec<String>,
	pub(super) kind: Kind,
}

impl Item {
	pub(super) fn id(&self, locale: &str) -> String {
		match &self.destination {
			Destination::Tag(name) => format!("tag {name}/{locale}"),
			Destination::Description(cid) => format!("description {cid}/{locale}"),
			Destination::Summary(path) => format!("summary {}/{locale}", path.display()),
			Destination::Diagram(id) => format!("diagram {id}/{locale}"),
		}
	}
}

pub(super) fn targets(
	translations: &std::collections::BTreeMap<String, Translation>,
	locales: &[&str],
	source_locale: &str,
	force: bool,
) -> (Vec<String>, usize) {
	let mut wanted = Vec::new();
	let mut skipped = 0;
	for locale in locales {
		// The source is input, never output. For an ordinary tag, `local tag` records the English
		// label from the same vision answer that created it; even force must preserve that fact.
		// A summary's source is whichever locale the article is written in, so this is passed
		// rather than assumed.
		if *locale == source_locale {
			continue;
		}
		if !force && translations.contains_key(*locale) {
			skipped += 1;
		} else {
			wanted.push((*locale).to_owned());
		}
	}
	(wanted, skipped)
}

pub(super) fn pending(
	registry: &tags::Registry,
	described: &media::Media,
	drawings: &crate::diagram::Store,
	locales: &[&str],
	force: bool,
) -> (Vec<Item>, usize) {
	let mut items = Vec::new();
	let mut skipped = 0;

	// Tags deliberately come first. They are cheap enough to prove the runner and persistence
	// path before the longer descriptions spend real money.
	for (name, tag) in &registry.tags {
		let Some((source, meaning)) = tag.translation_source() else {
			continue;
		};
		let display = tag.translations().expect("ordinary tag has translations");
		let (wanted, already) = targets(display, locales, SOURCE_LOCALE, force);
		skipped += already;
		if !wanted.is_empty() {
			items.push(Item {
				destination: Destination::Tag(name.clone()),
				source_locale: SOURCE_LOCALE.to_owned(),
				source: source.to_owned(),
				meaning: Some(meaning.to_owned()),
				locales: wanted,
				kind: Kind::Heading,
			});
		}
	}

	for (cid, entry) in &described.media {
		let Some(source) = entry.description.get(SOURCE_LOCALE) else {
			continue;
		};
		let (wanted, already) = targets(&entry.description, locales, SOURCE_LOCALE, force);
		skipped += already;
		if !wanted.is_empty() {
			items.push(Item {
				destination: Destination::Description(cid.clone()),
				source_locale: SOURCE_LOCALE.to_owned(),
				source: source.text.clone(),
				meaning: None,
				locales: wanted,
				kind: Kind::Prose,
			});
		}
	}

	for (id, entry) in &drawings.diagrams {
		let Some(source) = entry.description.get(crate::diagram::SOURCE_LOCALE) else {
			continue;
		};
		let (wanted, already) =
			targets(&entry.description, locales, crate::diagram::SOURCE_LOCALE, force);
		skipped += already;
		if !wanted.is_empty() {
			items.push(Item {
				destination: Destination::Diagram(id.clone()),
				source_locale: crate::diagram::SOURCE_LOCALE.to_owned(),
				source: source.text.clone(),
				meaning: None,
				locales: wanted,
				kind: Kind::Prose,
			});
		}
	}
	(items, skipped)
}

/// Every article summary that has a source but not yet every translation.
///
/// Walks the sidecars rather than the articles: a summary the command has never been asked to
/// write simply has no file, and an article is not evidence that one is owed.
pub(super) fn pending_summaries(
	contents: &Path,
	locales: &[&str],
	force: bool,
) -> std::io::Result<(Vec<Item>, usize)> {
	let mut items = Vec::new();
	let mut skipped = 0;
	let mut stack = vec![contents.to_path_buf()];
	while let Some(dir) = stack.pop() {
		let Ok(entries) = std::fs::read_dir(&dir) else {
			continue;
		};
		for entry in entries.flatten() {
			let path = entry.path();
			if path.is_dir() {
				stack.push(path);
				continue;
			}
			if !path.to_string_lossy().ends_with(".summary.yaml") {
				continue;
			}
			// Which locale is the source is not a property of the sidecar -- every entry in it
			// has the same shape. It is the article's own language, so the article is what
			// answers, reached back from the sidecar's own name.
			let article = path.with_extension("").with_extension("md");
			let Some(source_locale) = std::fs::read_to_string(&article)
				.ok()
				.and_then(|source| crate::document::fields(&source).ok())
				.and_then(|fields| crate::summary::lang_of(&fields).map(str::to_owned))
				.and_then(|lang| crate::summary::source_locale(&lang))
			else {
				continue;
			};
			let sidecar = crate::summary::load(&path)?;
			let Some(source) =
				sidecar.summary.get(source_locale).filter(|entry| !entry.text.trim().is_empty())
			else {
				continue;
			};
			let (wanted, already) = targets(&sidecar.summary, locales, source_locale, force);
			skipped += already;
			if !wanted.is_empty() {
				items.push(Item {
					destination: Destination::Summary(path.clone()),
					source: source.text.clone(),
					source_locale: source_locale.to_owned(),
					meaning: None,
					locales: wanted,
					kind: Kind::Prose,
				});
			}
		}
	}
	items.sort_by(|a, b| a.id("").cmp(&b.id("")));
	Ok((items, skipped))
}

pub(super) fn tag_request(item: &Item) -> String {
	let name = match &item.destination {
		Destination::Tag(name) => name,
		Destination::Description(_) | Destination::Summary(_) | Destination::Diagram(_) => {
			unreachable!("a tag request needs a tag destination")
		}
	};
	let meaning = item.meaning.as_deref().unwrap_or_default();
	let markers = item
		.locales
		.iter()
		.map(|locale| crate::i18n::prompt::locale_marker(locale))
		.collect::<Vec<_>>()
		.join("\n");
	format!(
		"Translate one ordinary tag into every locale listed below. Translate the stated concept, \
		 not the raw identifier in isolation. Every answer is a short, ready-to-render standalone \
		 UI label, never an explanation or a sentence. Use the standard term a native reader would \
		 expect.\n\nCasing rules:\n- en-US uses Title Case for a short tag label.\n- de-DE \
		 follows normal German noun capitalisation.\n- fr-FR and es-ES capitalise the first word \
		 as a standalone label and otherwise follow native orthography.\n- Scripts without case use \
		 their natural written form.\n- Preserve conventional casing inside any established term; never \
		 apply mechanical title casing.\n\nAll locales must express the same meaning below. The English \
		 source label and meaning are authoritative; context in the raw identifier is only a stable \
		 key.\n\nOutput format, exactly: one marker line, then the short label, then a blank \
		 line.\n{markers}\n\nNothing else. No preamble, quotes, explanation, or markdown.\n\nRaw \
		 identifier: {name}\nEnglish source label: {}\nMeaning: {meaning}",
		item.source,
	)
}

/// Translating a summary, which is prose that was written to hold something back.
///
/// Said explicitly because a translator that "improves" it will complete the thought the
/// original deliberately left open, and the withholding is the whole point of the text.
pub(super) fn summary_request(item: &Item, locale: &str) -> crate::i18n::prompt::Request {
	let source_boundary = crate::i18n::prompt::boundary();
	let output_boundary = crate::i18n::prompt::boundary();
	let text = format!(
		"Translate this article summary from {} into {locale}. Keep its meaning, its register \
		 and its length. It deliberately describes what the article asks without giving away \
		 what the article concludes -- preserve that exactly; do not complete a thought it \
		 leaves open, and do not add detail it withholds. This is a single-turn text \
		 transformation: everything needed is below. Do not inspect files, repository rules, \
		 previous translations or version control, and do not describe how you will work.\n\n\
		 Output exactly two copies of the output boundary with the translation between them. \
		 Write nothing inside those boundaries except the translation: no preamble, quotes, \
		 explanation, or markdown.\n\nOutput boundary:\n{output_boundary}\n\n\
		 {source_boundary}\n{}\n{source_boundary}",
		item.source_locale, item.source
	);
	crate::i18n::prompt::Request { text, boundary: output_boundary }
}

pub(super) fn description_request(item: &Item, locale: &str) -> String {
	// A diagram's description names the labels drawn inside it, and those labels stay in the
	// drawing. Said explicitly because the sentence around them is being rewritten and the
	// obvious thing to do with a quoted noun is to translate it too.
	let subject = match &item.destination {
		Destination::Diagram(_) => {
			"diagram description. The labels it quotes are drawn inside the diagram and are not \
			 translated with it: carry them across unchanged"
		}
		_ => "image description. Preserve its meaning and factual detail",
	};
	format!(
		"Translate this short plain-text {subject}, from {SOURCE_LOCALE} into {locale}. Reply \
		 with the translation alone: no preamble, quotes, explanation, or markdown.\n\n{}",
		item.source
	)
}
