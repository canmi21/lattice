//! The `cms og` command: one card per page per language, rendered here and published as-is.
//!
//! Named by slug rather than by content id, which is the one place this repository does not
//! content-address something. A card is not an asset an article references -- the page emits
//! `/opengraph/{slug}.png` and nothing writes that URL down -- so there is no reference to
//! rewrite and nothing to look an id up in. The cost is that the name is mutable, which is
//! why these are cached for a week rather than a year. See spec/architecture/media.md.
//!
//! PNG, not AVIF. Every other image here is stored AVIF, but the consumers of these are
//! crawlers for X, Slack, Discord and the rest, and they do not read it.

pub mod layout;
pub mod locale;
pub mod manifest;
pub mod messages;

use crate::i18n::{segment, store};
use cosmic_text::FontSystem;
use cosmic_text::fontdb;
use layout::{Avatar, Card, Home};
use rayon::prelude::*;
use serde::Deserialize;
use std::collections::{BTreeMap, BTreeSet};
use std::path::{Path, PathBuf};

/// Where the author's portrait lives.
///
/// Kept beside the font and for the same reason: it is bytes somebody else serves, so it is
/// fetched into `data/` once rather than requested by a command that has to work offline.
const AVATAR: &str = "data/avatar.png";

/// The identity the home card repeats, read from the file the pages read it from.
#[derive(Debug, Deserialize)]
struct SiteConfig {
	#[serde(default)]
	name: String,
	#[serde(default)]
	domain: String,
	#[serde(default)]
	author: SiteAuthor,
}

#[derive(Debug, Default, Deserialize)]
struct SiteAuthor {
	#[serde(default, rename = "fullName")]
	full_name: String,
	#[serde(default)]
	role: String,
}

pub fn config_path(repo: &Path) -> PathBuf {
	repo.join("apps").join("site").join("site.config.yaml")
}

/// The family name inside the TTF, which is what the layout asks for by name.
const FAMILY: &str = "LXGW WenKai";

/// Where the full font lives. Not the split copy under `data/public/fonts`: a subset cannot
/// answer for an arbitrary character, and a title may contain any.
const FONT: &str = "data/fonts/LXGWWenKai-Regular.ttf";

#[derive(Debug, Default)]
pub struct Outcome {
	pub rendered: usize,
	pub skipped: usize,
	pub failed: Vec<(String, String)>,
	/// Cards deleted because nothing asks for them any more -- an article that became a draft,
	/// was renamed, or was removed. See [`sweep`].
	pub removed: usize,
}

/// One article, reduced to what the card shows.
#[derive(Debug, PartialEq, Eq)]
pub struct Article {
	pub slug: String,
	pub title: String,
	pub subtitle: Option<String>,
	pub category: Option<String>,
	pub created: Option<String>,
}

/// Read the frontmatter fields the card needs.
///
/// `subtitle` rather than `description`: the latter is written for search results and runs to
/// a paragraph, which at this size would fill the card and crowd out the title it is meant to
/// support.
pub fn article_of(root: &Path, path: &Path) -> Option<Article> {
	let text = std::fs::read_to_string(path).ok()?;
	let front = crate::document::split(&text).ok()?.frontmatter?;

	// Read with the same parser the segment layout uses, deliberately. These two read one
	// frontmatter and the card looks its translation up by the title *string*, so a byte of
	// disagreement between them is not a wrong card -- it is a card that silently falls back to
	// the source language, with nothing reporting why. A hand-rolled `split_once(':')` disagrees
	// on the first folded or quoted scalar it meets, and the corpus already uses folded scalars
	// elsewhere. See spec/code.md on not hand-rolling a standard.
	let values: serde_yaml_ng::Value = serde_yaml_ng::from_str(front).ok()?;
	let field = |key: &str| {
		values
			.get(key)
			.and_then(serde_yaml_ng::Value::as_str)
			.map(str::to_owned)
			.filter(|value| !value.is_empty())
	};
	let (title, subtitle, created) = (field("title"), field("subtitle"), field("created"));

	let relative = path.strip_prefix(root).ok()?.with_extension("");
	let slug = relative.to_str()?.to_owned();
	// The top directory is the category, so an article's place in the tree is the only thing
	// that has to say what it is about.
	let category =
		relative.parent().and_then(|p| p.file_name()).and_then(|n| n.to_str()).map(str::to_owned);

	Some(Article { slug, title: title?, subtitle, category, created })
}

/// `2026-04-13T19:18:28.488Z` as `Apr 13, 2026`.
///
/// Formatted here rather than shown raw because the card is read at a glance, and an ISO
/// timestamp is a thing to parse rather than a thing to read.
pub fn short_date(iso: &str) -> Option<String> {
	let stamp: jiff::Timestamp = iso.parse().ok()?;
	Some(stamp.strftime("%b %-d, %Y").to_string())
}

/// Where a card is published: one tree per view, each mirroring the article tree.
///
/// The view is a directory rather than a suffix on the name so a locale can be synced or
/// dropped as a unit, and so the fallback is one prefix substitution rather than a filename
/// rewrite. Nothing outside this repository ever sees the layout -- a reader asks for
/// `/opengraph/{slug}.png?lang=ja` and the CDN resolves it. See spec/architecture/media.md.
pub fn card_key(view: &str, slug: &str) -> String {
	format!("{view}/{slug}")
}

/// The translation of one frontmatter value, or `None` when this view has none.
///
/// A segment id is the hash of its own text, so the title's id can be computed from the title
/// rather than found by re-splitting the article. The source view asks for nothing: it is the
/// article's own words.
fn translated(sidecar: &store::Sidecar, view: &locale::View, source: &str) -> Option<String> {
	let tag = view.tag?;
	let text = sidecar.segments.get(&segment::id_of(source))?.get(tag)?.text.clone();
	(!text.trim().is_empty()).then_some(text)
}

fn load_fonts(repo: &Path) -> Result<FontSystem, String> {
	let path = repo.join(FONT);
	if !path.is_file() {
		return Err(format!(
			"{} is missing -- the full font is not published, so fetch it into data/fonts",
			path.display()
		));
	}
	let mut db = fontdb::Database::new();
	db.load_font_file(&path)
		.map_err(|error| format!("could not read {}: {error}", path.display()))?;
	Ok(FontSystem::new_with_locale_and_db("en-US".to_owned(), db))
}

/// One card to draw: everything decided, nothing rendered yet.
///
/// Enumerated before any drawing so the work can be counted, skipped and spread across threads
/// without the decisions being repeated on each one.
pub struct Job {
	/// What names the card in a report, including its view: `ja development/a-thing`.
	pub label: String,
	/// `{view}/{slug}`: what the record files this card under, not where its bytes land.
	pub key: String,
	pub site: String,
	pub domain: String,
	pub face: Face,
}

impl Job {
	/// Everything that decides what this card looks like, in a fixed order.
	///
	/// The site name and address are in here too: they are drawn on every card, so changing
	/// either has to redraw all of them rather than only the ones whose text moved.
	fn inputs(&self) -> String {
		let mut parts = vec![self.site.as_str(), self.domain.as_str()];
		match &self.face {
			Face::Article { title, subtitle, category, date, stats } => {
				parts.push("article");
				parts.push(title);
				parts.push(subtitle.as_deref().unwrap_or_default());
				parts.push(category.as_deref().unwrap_or_default());
				parts.push(date.as_deref().unwrap_or_default());
				parts.push(stats);
			}
			Face::Home { name, role, stats } => {
				parts.push("home");
				parts.push(name);
				parts.push(role);
				parts.push(stats);
			}
		}
		manifest::digest(&parts)
	}
}

/// Which card this is, and the words only that kind has.
pub enum Face {
	Article {
		title: String,
		subtitle: Option<String>,
		category: Option<String>,
		date: Option<String>,
		stats: String,
	},
	Home {
		name: String,
		role: String,
		stats: String,
	},
}

/// Every card an article asks for: one per view, each in that view's own words.
fn article_jobs(
	public: &Path,
	config: &SiteConfig,
	catalogs: &BTreeMap<&'static str, BTreeMap<String, String>>,
	path: &Path,
	article: &Article,
) -> std::io::Result<Vec<Job>> {
	let sidecar = store::load(&store::path_for(path))?;
	let date = article.created.as_deref().and_then(short_date);

	Ok(
		locale::VIEWS
			.iter()
			.map(|view| {
				// The source view is the article's own words; every other view falls back to them
				// when that segment has not been translated yet, because a card in the wrong
				// language still says more than no card at all.
				let title =
					translated(&sidecar, view, &article.title).unwrap_or_else(|| article.title.clone());
				let subtitle = article
					.subtitle
					.as_ref()
					.map(|text| translated(&sidecar, view, text).unwrap_or_else(|| text.clone()));

				// The other views, not all of them: this card is one of the nine, so what it has
				// left to offer is eight.
				let others = locale::VIEWS.len().saturating_sub(1).to_string();
				let stats = messages::for_view(catalogs, view.code)
					.get("card.languages")
					.map_or(String::new(), |template| messages::fill(template, &[("count", &others)]));

				Job {
					label: format!("{} {}", view.code, article.slug),
					key: card_key(view.code, &article.slug),
					site: config.name.clone(),
					domain: config.domain.clone(),
					face: Face::Article {
						title,
						subtitle,
						category: article.category.clone(),
						date: date.clone(),
						stats,
					},
				}
			})
			.collect(),
	)
}

/// The home page's card, which is a page rather than an article and has its own slug.
pub const HOME_SLUG: &str = "homepage";

/// The view whose figure the source view's card carries.
///
/// Tied to the language `mw.json` is written in rather than to anything structural, because that
/// is what makes the number readable: the card says "words" in English, so the figure beside it
/// has to be English words. See the note on [`Census`].
const SOURCE_VIEW_COUNTED_AS_CODE: &str = "en";

/// What the site amounts to, counted once per view because each view serves different text.
/// See spec/architecture/media.md, "The article page draws the same number, from the same
/// function", for why the unit is a word processor's word rather than a character, why each
/// view counts its own translation rather than the source, why `mw` (the source view) counts
/// as English, and why frontmatter and drafts are excluded.
pub struct Census {
	pub articles: usize,
	/// Words per view code. `locale::VIEWS` is the set of keys, and every one of them is present.
	pub words: BTreeMap<&'static str, usize>,
	pub languages: usize,
}

pub fn census(articles: &Path) -> Result<Census, String> {
	let mut counted = 0;
	let mut words: BTreeMap<&'static str, usize> =
		locale::VIEWS.iter().map(|view| (view.code, 0usize)).collect();

	for path in crate::refs::markdown_under(articles).map_err(|e| e.to_string())? {
		// The bio page is content, not an article, and the pages do not list it as one either.
		if path.file_stem().and_then(|name| name.to_str()) == Some(HOME_SLUG) {
			continue;
		}
		let Ok(text) = std::fs::read_to_string(&path) else {
			continue;
		};
		if crate::document::is_draft(&text) {
			continue;
		}
		let sidecar = crate::i18n::store::load_checked(&crate::i18n::store::path_for(&path))
			.map_err(|error| format!("{}: {error}", path.display()))?;
		// The one function this number comes from anywhere, so a card and the page it advertises
		// can never disagree about how long an article is. An article that will not split comes
		// back empty and is skipped rather than fatal, the same as one that cannot be read: the
		// card summarises the corpus, and one malformed article is `cms check`'s business.
		let per_view = crate::i18n::layout::words_per_view(&text, sidecar.as_ref());
		if per_view.is_empty() {
			continue;
		}
		counted += 1;
		for (code, total) in &per_view {
			if let Some(entry) = words.get_mut(code.as_str()) {
				*entry += total;
			}
		}
	}

	// The source view's total, replaced rather than summed. `words_per_view` gives `mw` the
	// source text, which is right for the article page -- that view serves the source, and a
	// reader of it sees exactly those words. It is wrong here, where every article is added
	// together: five in Chinese and one in English summed is Han characters plus English words,
	// not a quantity of anything. This card is worded in English, so it carries the English
	// figure. See the note on `Census`.
	if let Some(english) = words.get(SOURCE_VIEW_COUNTED_AS_CODE).copied()
		&& let Some(entry) = words.get_mut(locale::SOURCE)
	{
		*entry = english;
	}

	Ok(Census { articles: counted, words, languages: locale::VIEWS.len() })
}

/// The home card, once per view, worded by that view's own catalog.
fn home_jobs(
	public: &Path,
	config: &SiteConfig,
	catalogs: &BTreeMap<&'static str, BTreeMap<String, String>>,
	census: &Census,
) -> Vec<Job> {
	locale::VIEWS
		.iter()
		.map(|view| {
			let catalog = messages::for_view(catalogs, view.code);
			let stats = catalog.get("card.stats").map_or(String::new(), |template| {
				messages::fill(
					template,
					&[
						("articles", &census.articles.to_string()),
						("words", &messages::compact(census.words.get(view.code).copied().unwrap_or(0))),
						("languages", &census.languages.to_string()),
					],
				)
			});

			Job {
				label: format!("{} {HOME_SLUG}", view.code),
				key: card_key(view.code, HOME_SLUG),
				site: config.name.clone(),
				domain: config.domain.clone(),
				face: Face::Home {
					name: config.author.full_name.clone(),
					role: config.author.role.clone(),
					stats,
				},
			}
		})
		.collect()
}

/// The author's portrait, decoded once and shared by every thread that draws it.
///
/// Absent rather than fatal: a clone without the file still gets every card, with the home one
/// missing a portrait instead of the whole command refusing to run.
fn load_avatar(repo: &Path) -> Option<Avatar> {
	let bytes = std::fs::read(repo.join(AVATAR)).ok()?;
	let decoded = image::load_from_memory(&bytes).ok()?.to_rgba8();
	let size = decoded.width().min(decoded.height());
	// Square, from the top-left, because the portrait is already square and a rectangle here
	// would mean choosing a crop nobody asked for.
	Some(Avatar {
		rgba: image::DynamicImage::ImageRgba8(decoded).crop_imm(0, 0, size, size).to_rgba8().into_raw(),
		size,
	})
}

/// One job with the record entry that decides whether it still needs drawing.
struct Planned {
	job: Job,
	/// Where the card sits below the published root; the key it is recorded under.
	key: String,
	/// The hash of everything that decides what it looks like.
	hash: String,
}

/// Draw every card whose inputs have moved, in parallel. See spec/architecture/media.md, "A
/// card is redrawn when its inputs move, not when its file is missing", for why.
///
/// `map_init` rather than a shared font system: shaping needs `&mut FontSystem`, so the choice
/// is one per thread or a lock every glyph goes through. One per thread costs a font parse per
/// worker and nothing after that.
pub fn render_all(
	repo: &Path,
	public: &Path,
	jobs: Vec<Job>,
	force: bool,
) -> Result<Outcome, String> {
	// Parsed once here as well, so a missing font fails before any thread starts rather than
	// once per worker.
	load_fonts(repo)?;

	let manifest_path = manifest::path_for(repo);
	let record = manifest::load(&manifest_path);

	let planned: Vec<Planned> = jobs
		.into_iter()
		.map(|job| {
			let hash = job.inputs();
			let key = job.key.clone();
			Planned { job, key, hash }
		})
		.collect();

	// A card is current when the record says these inputs drew it *and* the object it names is
	// still on disk. Checking the object rather than a path derived from the slug is the half
	// content addressing changes: there is no path to derive any more.
	let (todo, current): (Vec<&Planned>, Vec<&Planned>) =
		planned.iter().partition(|planned| match record.cards.get(&planned.key) {
			Some(card) if !force && card.hash == planned.hash => {
				!crate::image::store::variant_path(public, &card.cid, "png").is_file()
			}
			_ => true,
		});

	// Decoded once and shared: it is read-only pixels, and decoding it per thread would repeat
	// the only part of this that is not text shaping.
	let avatar = load_avatar(repo);

	let results: Vec<Result<(&Planned, String), (String, String)>> = todo
		.par_iter()
		.map_init(
			|| load_fonts(repo).expect("font already parsed once above"),
			|fonts, planned| {
				let job = &planned.job;
				let pixels = match &job.face {
					Face::Article { title, subtitle, category, date, stats } => layout::render(
						fonts,
						FAMILY,
						&Card {
							site: &job.site,
							domain: &job.domain,
							title,
							subtitle: subtitle.as_deref(),
							category: category.as_deref(),
							date: date.as_deref(),
							stats,
						},
					),
					Face::Home { name, role, stats } => layout::render_home(
						fonts,
						FAMILY,
						&Home {
							site: &job.site,
							domain: &job.domain,
							name,
							role,
							stats,
							avatar: avatar.as_ref(),
						},
					),
				};
				let png = encode(&pixels).map_err(|error| (job.label.clone(), error))?;
				// The card's own bytes decide its address, like every other object. Which means
				// two views that happen to draw identically are one object, and a redrawn card
				// never overwrites the one a reader may still be holding.
				let cid = crate::image::cid(&png);
				crate::image::store::write(&crate::image::store::variant_path(public, &cid, "png"), &png)
					.map_err(|error| (job.label.clone(), error.to_string()))?;
				Ok((*planned, cid))
			},
		)
		.collect();

	// Rebuilt rather than merged, so a card that is no longer produced leaves the record with
	// it. A failed one is left out too, which is what makes the next run retry it.
	let mut next = manifest::Manifest::default();
	for planned in &current {
		if let Some(card) = record.cards.get(&planned.key) {
			next.cards.insert(planned.key.clone(), card.clone());
		}
	}

	let mut outcome = Outcome { skipped: current.len(), ..Outcome::default() };
	for result in results {
		match result {
			Ok((planned, cid)) => {
				outcome.rendered += 1;
				next.cards.insert(planned.key.clone(), manifest::Card { hash: planned.hash.clone(), cid });
			}
			Err(failure) => outcome.failed.push(failure),
		}
	}

	// The record already forgets a card that is no longer produced; this is the other half, which
	// it did not have. Without it an article that becomes a draft, gets renamed or is deleted
	// leaves nine pictures of itself in `data/public`, and they deploy, and the path is guessable.
	outcome.removed = sweep(public, &record, &next);

	manifest::save(&manifest_path, &next)
		.map_err(|error| format!("could not write the card record: {error}"))?;
	Ok(outcome)
}

/// Delete the cards the previous record holds and this run no longer wants. See
/// spec/architecture/media.md, "A draft gets no card, and a card nothing asks for is deleted",
/// for why this is driven by the record rather than by walking `data/public`.
///
/// A failed delete is not reported. The file is not referenced any more either way, and failing
/// a card run over a leftover would be the tail wagging the dog; the next run tries again,
/// because the key stays in the record it reads.
fn sweep(public: &Path, previous: &manifest::Manifest, next: &manifest::Manifest) -> usize {
	// By content id, and only when nothing the new record keeps still names it: two views that
	// drew identically share one object, so a key going away is not a reason to delete bytes.
	let kept: BTreeSet<&str> = next.cards.values().map(|card| card.cid.as_str()).collect();
	let mut removed = 0;
	for (key, card) in &previous.cards {
		if next.cards.contains_key(key) || kept.contains(card.cid.as_str()) {
			continue;
		}
		let target = crate::image::store::variant_path(public, &card.cid, "png");
		if target.is_file() && std::fs::remove_file(&target).is_ok() {
			removed += 1;
		}
	}
	removed
}

/// Every article that gets a card, with the file it was read from.
///
/// Three filters decide it, and the sweep in [crate::gc] applies the same three or it deletes a
/// card a reader can still fetch: the bio page gets the home card rather than an article one, a
/// draft has no production URL for a card to be the picture of -- and a card is public, deployed
/// and guessable, so drawing one publishes a piece nobody decided to publish -- and an article
/// with no title cannot be drawn at all. See spec/architecture/media.md.
fn live_articles(articles: &Path) -> std::io::Result<Vec<(PathBuf, Article)>> {
	let mut found = Vec::new();
	for path in crate::refs::markdown_under(articles)? {
		if path.file_stem().and_then(|name| name.to_str()) == Some(HOME_SLUG) {
			continue;
		}
		if std::fs::read_to_string(&path).is_ok_and(|text| crate::document::is_draft(&text)) {
			continue;
		}
		if let Some(article) = article_of(articles, &path) {
			found.push((path, article));
		}
	}
	Ok(found)
}

/// Where every card the site still asks for sits below the published root.
///
/// Derived from the corpus rather than from `data/build/opengraph.json`: that record says what
/// the last run wrote and reads as empty when it is missing or of another version, so a sweep
/// trusting it would take the whole tree exactly when the record was lost. Built through
/// [card_path], so the published layout stays decided in one place.
pub fn wanted(articles: &Path) -> std::io::Result<BTreeSet<String>> {
	let mut slugs: Vec<String> =
		live_articles(articles)?.into_iter().map(|(_, article)| article.slug).collect();
	slugs.push(HOME_SLUG.to_owned());

	let mut wanted = BTreeSet::new();
	for view in &locale::VIEWS {
		for slug in &slugs {
			wanted.insert(card_key(view.code, slug));
		}
	}
	Ok(wanted)
}

/// Render every card the site needs, in every view.
pub fn run(repo: &Path, public: &Path, articles: &Path, force: bool) -> Result<Outcome, String> {
	let text = std::fs::read_to_string(config_path(repo))
		.map_err(|error| format!("could not read the site config: {error}"))?;
	let config: SiteConfig =
		serde_yaml_ng::from_str(&text).map_err(|error| format!("site config: {error}"))?;

	// Nine files, read here and nowhere else. Each card wants the catalogue for its own view, and
	// asking per card meant several thousand reads and parses to arrive at nine answers.
	let catalogs = messages::load_all(repo);

	let mut jobs = Vec::new();
	for (path, article) in live_articles(articles).map_err(|e| e.to_string())? {
		jobs.extend(
			article_jobs(public, &config, &catalogs, &path, &article).map_err(|e| e.to_string())?,
		);
	}

	jobs.extend(home_jobs(public, &config, &catalogs, &census(articles)?));
	render_all(repo, public, jobs, force)
}

fn encode(pixels: &[u8]) -> Result<Vec<u8>, String> {
	let buffer = image::RgbaImage::from_raw(layout::WIDTH, layout::HEIGHT, pixels.to_vec())
		.ok_or("bad canvas")?;
	let mut out = Vec::new();
	image::DynamicImage::ImageRgba8(buffer)
		.write_to(&mut std::io::Cursor::new(&mut out), image::ImageFormat::Png)
		.map_err(|error| error.to_string())?;
	Ok(out)
}

#[cfg(test)]
mod tests {
	use super::*;

	/// A title the hand-rolled reader got wrong, and the reason the reader was replaced.
	///
	/// `split_once(':')` on a folded scalar returns the fold marker, so the card was drawn
	/// titled `>-` and, worse, looked its translation up under the hash of that -- finding
	/// nothing, and falling back to the source language on every view without saying so.
	#[test]
	fn reads_a_folded_title_as_the_text_it_folds_to() {
		let temporary = tempfile::tempdir().expect("temp");
		let root = temporary.path();
		std::fs::create_dir_all(root.join("essay")).expect("dir");
		let path = root.join("essay/a.md");
		std::fs::write(
			&path,
			"---\nlang: en\ntitle: >-\n  One title that was\n  written across two lines\ncreated: 2026-04-13T00:00:00.000Z\n---\n\nBody.\n",
		)
		.expect("write");

		let article = article_of(&root, &path).expect("an article");
		assert_eq!(article.title, "One title that was written across two lines");
		let _ = std::fs::remove_dir_all(&root);
	}

	/// Quoted scalars are the other shape the old reader mangled: it stripped one layer of
	/// quotes by hand, which is not what a quoted scalar means the moment one is escaped.
	#[test]
	fn reads_a_quoted_title_without_hand_stripping_quotes() {
		let temporary = tempfile::tempdir().expect("temp");
		let root = temporary.path();
		std::fs::create_dir_all(root.join("essay")).expect("dir");
		let path = root.join("essay/a.md");
		std::fs::write(
			&path,
			"---\nlang: en\ntitle: \"A title with a \\\"quote\\\" inside\"\n---\n\nBody.\n",
		)
		.expect("write");

		let article = article_of(&root, &path).expect("an article");
		assert_eq!(article.title, "A title with a \"quote\" inside");
		let _ = std::fs::remove_dir_all(&root);
	}

	#[test]
	fn reads_the_fields_the_card_shows() {
		let temporary = tempfile::tempdir().expect("temp");
		let root = temporary.path();
		let dir = root.join("development");
		std::fs::create_dir_all(&dir).expect("dir");
		let path = dir.join("a-thing.md");
		std::fs::write(
			&path,
			"---\ntitle: A Thing\nsubtitle: About the thing\ndescription: a much longer paragraph\n\
			 created: 2026-04-13T19:18:28.488Z\n---\n\nbody\n",
		)
		.expect("write");

		let article = article_of(&root, &path).expect("article");
		assert_eq!(article.slug, "development/a-thing");
		assert_eq!(article.title, "A Thing");
		assert_eq!(article.subtitle.as_deref(), Some("About the thing"));
		// The category is where the file sits, not something restated in the frontmatter.
		assert_eq!(article.category.as_deref(), Some("development"));
		std::fs::remove_dir_all(&root).ok();
	}

	#[test]
	fn an_article_without_a_title_has_no_card() {
		let temporary = tempfile::tempdir().expect("temp");
		let root = temporary.path();
		std::fs::create_dir_all(&root).expect("dir");
		let path = root.join("x.md");
		std::fs::write(&path, "---\nsubtitle: only this\n---\n").expect("write");
		assert!(article_of(&root, &path).is_none());
		std::fs::remove_dir_all(&root).ok();
	}

	#[test]
	fn dates_are_shown_rather_than_printed() {
		assert_eq!(short_date("2026-04-13T19:18:28.488Z").as_deref(), Some("Apr 13, 2026"));
		assert_eq!(short_date("not a date"), None);
	}

	#[test]
	fn a_card_is_recorded_under_its_view_and_not_under_a_path() {
		// The key files the card in `cms og`'s record; where its bytes land is decided by the
		// bytes, like every other object. Nothing derives an address from a slug any more.
		assert_eq!(card_key("mw", "development/a-thing"), "mw/development/a-thing");
		assert_eq!(card_key("ja", "development/a-thing"), "ja/development/a-thing");
	}
}
