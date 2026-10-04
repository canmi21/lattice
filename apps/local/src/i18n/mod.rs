//! The `local i18n` command: translating what the articles say.
//!
//! Segment by segment, with every missing locale in one request, because a paragraph edited on
//! its own should cost one call while a partial repair should never repay for finished work. See
//! spec/i18n/request.md.

pub mod audit;
pub mod invalidate;
pub mod layout;
pub mod model;
pub mod prompt;
pub mod runner;
pub mod segment;
pub mod store;
pub mod tn;
pub mod validate;
pub mod width;

use crate::task::{Record, claim, progress, registry, writer};
use runner::{Refusal, Runner};
use segment::Segment;
use std::path::Path;
use store::Translation;

mod reply;
mod translate;
#[cfg(test)]
use reply::validate_reply;
use reply::validate_reply_for;
use translate::{DisplayRequest, TranslationOptions, translate, translate_display};

/// Makes the sink each article's progress bar reports to.
///
/// A factory rather than one sink, because the terminal draws a bar per article and a bar that has
/// been finished cannot be started again. The desktop will pass something that folds them into one
/// view; that is its decision to make, not this function's.
pub type Sinks = Box<dyn Fn() -> Box<dyn progress::Sink> + Send + Sync>;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Scope {
	All,
	Frontmatter,
}

impl Scope {
	fn includes(self, segment: &Segment) -> bool {
		self == Self::All || segment.region == segment::Region::Frontmatter
	}
}

/// Requests in flight. The same reasoning as `local alt`: politeness rather than local limits.
pub const DEFAULT_PARALLEL: usize = 4;

pub fn parallelism(value: Option<&str>) -> Result<usize, String> {
	let Some(value) = value else {
		return Ok(DEFAULT_PARALLEL);
	};
	match value.parse::<usize>() {
		Ok(value) if value > 0 => Ok(value),
		_ => Err("--parallel takes a positive integer".to_owned()),
	}
}

/// How many times a segment is asked for again before it is reported as failed.
///
/// A retry escalates the model, which is the one difficulty signal here that is measured
/// rather than guessed: the light model failing is an event, where a difficulty score would
/// only ever have been an estimate.
const ATTEMPTS: usize = 3;

/// Where the backoff starts, and how far it is allowed to grow.
///
/// Throttling is not counted against `ATTEMPTS`: nothing was wrong with the request, the
/// runner was simply busy. Waiting and asking again is the whole response, so the only limit
/// is the allowance itself.
const BACKOFF_START: std::time::Duration = std::time::Duration::from_secs(5);
const BACKOFF_MAX: std::time::Duration = std::time::Duration::from_secs(120);

#[derive(Debug, Default)]
pub struct Outcome {
	pub translated: usize,
	pub segments: usize,
	pub tokens: u64,
	pub usd: f64,
	pub failed: Vec<(String, String)>,
	pub orphans: usize,
	pub incomplete_segments: usize,
	pub missing_locales: usize,
	/// Segments another live run was translating, left to it.
	pub claimed_elsewhere: usize,
	/// Articles left alone because they are drafts. Counted rather than silently dropped: a
	/// person who wrote one and ran this wants to be told why nothing happened to it.
	pub drafts: usize,
	/// Segments that turned out to be translated already once the claim was held -- work another
	/// run finished between the list being built and this item being reached.
	pub already_done: usize,
	/// Set when the allowance ran out, carrying what the runner said about the reset.
	pub exhausted: Option<String>,
	/// Report-only policy findings from `--check`: article, then what audit::of saw.
	pub audit: Vec<(String, audit::Finding)>,
	/// Locale views that will not render at all: article, locale, and how many body segments are
	/// missing. One is enough -- the site serves the source article rather than mixing languages
	/// inside a page -- so this is reported as its own outcome rather than left to be inferred
	/// from a count of missing entries.
	pub blocked_views: Vec<(String, String, usize)>,
}

/// When a file was last written, or `None` if it does not exist yet.
///
/// Used to notice another process having touched a sidecar without re-reading it every time. A
/// missing file and an unreadable one are the same answer here: reload and find out.
fn modified_at(path: &Path) -> Option<std::time::SystemTime> {
	std::fs::metadata(path).ok()?.modified().ok()
}

pub fn selected_locales(values: &[String]) -> Result<Vec<&'static str>, String> {
	if values.is_empty() {
		return Ok(prompt::LOCALES.to_vec());
	}
	for value in values {
		if !prompt::LOCALES.contains(&value.as_str()) {
			return Err(format!("--locale takes one of {}", prompt::LOCALES.join(", ")));
		}
	}
	Ok(
		prompt::LOCALES
			.iter()
			.copied()
			.filter(|locale| values.iter().any(|value| value == locale))
			.collect(),
	)
}

/// The file name of a page. The homepage is the whole of that category today.
const PAGE_FILE: &str = "homepage.md";

/// A backstop, not the filter: `run` already drops a page before a byte is read, so this exists
/// only for the day that filter breaks, to say which file arrived and where it should have
/// stopped rather than let a page quietly acquire a sidecar. See spec/i18n/copy.md, "A page is
/// not an article, and is not translated".
fn refuse_page(path: &Path) -> Result<(), String> {
	if path.file_name().is_some_and(|name| name == PAGE_FILE) {
		return Err(format!(
			"{PAGE_FILE} is a page, not an article, and is never translated. It reached the run \
			 anyway, which means the filter in `run` no longer holds. See spec/i18n/copy.md."
		));
	}
	Ok(())
}

/// Lines a block occupies, ignoring the blank ones a reply may pad with.
fn body_lines(text: &str) -> usize {
	text.lines().filter(|line| !line.trim().is_empty()).count()
}

/// One line, rewritten in place, showing what is being worked on.
/// Translate every article under `articles`.
pub struct RunOptions<'a> {
	pub runner: Runner,
	pub model_override: Option<String>,
	pub limit: Option<usize>,
	pub parallel: usize,
	pub force: bool,
	pub scope: Scope,
	pub locales: &'a [&'a str],
	pub check: bool,
	/// The repository root, for the run registry, the claims and the record lock.
	pub repository: &'a Path,
	pub shell: registry::Shell,
	pub sinks: Sinks,
}

pub async fn run(
	articles: &Path,
	only: &[std::path::PathBuf],
	options: RunOptions<'_>,
) -> std::io::Result<Outcome> {
	let RunOptions {
		runner,
		model_override,
		limit,
		parallel,
		force,
		scope,
		locales,
		check,
		repository,
		shell,
		sinks,
	} = options;
	let mut outcome = Outcome::default();
	// Loaded once. A suggestion applies to a segment id, so which article it came from stops
	// mattering the moment it is written down.
	let glosses = tn::load(&tn::path_for(articles.parent().unwrap_or(articles)))?;
	let mut budget = limit.unwrap_or(usize::MAX);

	// Walked up front so the registry can publish a total rather than a number that grows while
	// somebody watches it. Reading the articles twice is local file I/O against a run that spends
	// minutes per article on a model.
	let planned: Vec<std::path::PathBuf> = crate::refs::markdown_under(articles)?
		.into_iter()
		// Named articles narrow the run. Retranslating one edited piece should not mean walking
		// everything before it in the tree.
		.filter(|path| {
			only.is_empty() || only.iter().any(|wanted| path.ends_with(wanted) || path == wanted)
		})
		// Pages leave here, before anything is read and before the total is published, so a run
		// never counts work it was never going to do. `refuse_page` below is the guard for this
		// line being changed, not the mechanism it uses.
		.filter(|path| refuse_page(path).is_ok())
		// And so do drafts: every edit changes segment ids, so translating one buys eight locales
		// the next save throws away. Naming an article is still an explicit request and goes
		// through, same as `only` everywhere else here. An unreadable file stays in -- that fault
		// is for the loop below to report, not for this filter to hide. See spec/i18n/segments.md, "A
		// draft is written, not owed".
		.filter(|path| {
			if !only.is_empty() {
				return true;
			}
			let draft = std::fs::read_to_string(path).is_ok_and(|text| crate::document::is_draft(&text));
			if draft {
				outcome.drafts += 1;
			}
			!draft
		})
		.collect();

	// One entry for the whole run, counted in articles. The per-article bars below count segments;
	// the two are different units on purpose and each says which it is.
	let planned_total = planned.len() as u64;
	let entry = registry::publish(repository, "i18n", shell, planned_total)?;
	let published = registry::Published::new(entry);
	let translations = writer::Writer::start(repository, Record::Translations)?;
	let mut articles_done = 0u64;

	for path in planned {
		if budget == 0 {
			break;
		}
		{
			use progress::Sink as _;
			published.advanced(articles_done, planned_total, &path.display().to_string());
		}
		// Recorded rather than returned: one file arriving that should not have is a fault in
		// this command, not a reason to abandon the articles that are fine. It lands in the run's
		// own report, where a reader is already looking for what did not get done.
		if let Err(reason) = refuse_page(&path) {
			outcome.failed.push((path.display().to_string(), reason));
			continue;
		}
		let article = std::fs::read_to_string(&path)?;
		// A page is not an article and is never translated. The test is the same one `cms
		// summary` applies: no `lang` frontmatter, no language to translate out of. The homepage
		// is the standing example -- it is identity copy, rendered from the source in every
		// view, and translations of it were only ever dead weight. See spec/i18n/copy.md.
		let fields = crate::document::fields_of(&article, &path)?;
		let Some(lang) = crate::summary::lang_of(&fields) else {
			continue;
		};
		let source_locale = crate::summary::source_locale(lang).map(str::to_owned);
		let live = segment::translatable(&article).map_err(|error| {
			std::io::Error::new(std::io::ErrorKind::InvalidData, format!("{}: {error}", path.display()))
		})?;
		let sidecar_path = store::path_for(&path);
		let mut sidecar = store::load(&sidecar_path)?;
		outcome.segments += live.values().filter(|segment| scope.includes(segment)).count();
		outcome.orphans += store::orphans(&sidecar, &live).len();

		let mut wanted = if force && !check {
			live
				.keys()
				.map(|id| (id.clone(), locales.iter().map(|locale| (*locale).to_owned()).collect()))
				.collect::<std::collections::BTreeMap<_, _>>()
		} else {
			store::missing(&sidecar, &live, locales, source_locale.as_deref(), &glosses)
		};
		wanted.retain(|id, _| live.get(id).is_some_and(|segment| scope.includes(segment)));
		if check {
			outcome.incomplete_segments += wanted.len();
			outcome.missing_locales += wanted.values().map(Vec::len).sum::<usize>();
			// The policies shape cannot enforce, reported over what is already stored. Only
			// live body segments: an orphaned entry is leaving anyway, and frontmatter carries
			// no notes.
			for (id, locales) in &sidecar.segments {
				let Some(segment) = live.get(id) else {
					continue;
				};
				if segment.region != segment::Region::Body {
					// Frontmatter carries no notes, but the fields that are drawn have a width.
					if let Some(field) = segment.display {
						for (locale, translation) in locales {
							for found in audit::display(id, locale, &translation.text, field) {
								outcome.audit.push((path.display().to_string(), found));
							}
						}
						// Frontmatter never reaches `across_locales` below, and a field measured
						// only against its own budget is how a translation that answered a wider
						// question than the source asked got through. See spec/i18n/prose.md.
						let together: Vec<(&str, &str)> = locales
							.iter()
							.map(|(locale, translation)| (locale.as_str(), translation.text.as_str()))
							.collect();
						for found in
							audit::lengths(id, &segment.source, segment.region, segment.display, &together)
						{
							outcome.audit.push((path.display().to_string(), found));
						}
					}
					continue;
				}
				for (locale, translation) in locales {
					for found in audit::of(
						id,
						locale,
						&translation.text,
						segment.kind,
						&segment.source,
						glosses.find(id),
					) {
						outcome.audit.push((path.display().to_string(), found));
					}
				}
				// And once more with every locale of this segment in hand: the checks above cannot
				// see a sibling, and a sibling is what catches an answer that is well-formed and
				// simply about something else.
				let together: Vec<(&str, &str)> = locales
					.iter()
					.map(|(locale, translation)| (locale.as_str(), translation.text.as_str()))
					.collect();
				for found in audit::across_locales(id, &segment.source, &together) {
					outcome.audit.push((path.display().to_string(), found));
				}
				for found in audit::lengths(id, &segment.source, segment.region, segment.display, &together)
				{
					outcome.audit.push((path.display().to_string(), found));
				}
			}
			// A missing body segment is not a gap in one paragraph. The site refuses to mix
			// languages within a page, so it serves the whole article in the source language and
			// says the translation is unavailable -- which means one absent block and a wholly
			// untranslated locale are the same event, and a count alone does not say so.
			for locale in locales {
				let blocked = wanted
					.iter()
					.filter(|(id, missing)| {
						missing.iter().any(|m| m == locale)
							&& live.get(*id).is_some_and(|segment| segment.region == segment::Region::Body)
					})
					.count();
				if blocked > 0 {
					outcome.blocked_views.push((path.display().to_string(), (*locale).to_owned(), blocked));
				}
			}
			continue;
		}

		// Order for context comes from the article, not `live`: filtering to translatable blocks
		// first made a code fence or figure invisible and promoted whatever prose lay beyond it,
		// and made a frontmatter field the "previous paragraph" of the first body block. See
		// spec/i18n/request.md, "The context is fenced too, because it is also article prose".
		let ordered: Vec<Segment> = segment::split(&article)
			.map_err(|error| {
				std::io::Error::new(std::io::ErrorKind::InvalidData, format!("{}: {error}", path.display()))
			})?
			.into_iter()
			.filter(|segment| segment.region == segment::Region::Body)
			.collect();
		let neighbours = |item: &Segment| {
			if item.region != segment::Region::Body {
				return (None, None);
			}
			// By offset rather than by id: one id can sit in an article many times -- every
			// horizontal rule shares one -- and a position found by id would be the first of them.
			let at = ordered.iter().position(|s| s.start == item.start);
			at.map_or((None, None), |at| {
				(
					at.checked_sub(1).and_then(|i| ordered.get(i)).map(segment::context_of),
					ordered.get(at + 1).map(segment::context_of),
				)
			})
		};

		// The four drawn fields are asked for together, in one request, by the pass below. They
		// are separate segments and separate stored entries -- what differs is only that a
		// subtitle written without its title beside it, or a short form written without the full
		// one, is written in ignorance of the thing it has to agree with.
		let display_todo: Vec<(String, segment::Display, Vec<String>)> = wanted
			.iter()
			.filter_map(|(id, locales)| {
				let field = live.get(id)?.display?;
				Some((id.clone(), field, locales.clone()))
			})
			.collect();
		let todo: Vec<(Segment, Vec<String>)> = wanted
			.iter()
			.filter(|(id, _)| live.get(*id).is_none_or(|segment| segment.display.is_none()))
			.filter_map(|(id, locales)| live.get(id).map(|segment| (segment.clone(), locales.clone())))
			.take(budget)
			.collect();
		budget -= todo.len();

		// The article key claims are namespaced by, so two articles holding a segment with the
		// same id -- which happens, since an id is the hash of the text -- are two items.
		let article_key = path.strip_prefix(articles).unwrap_or(&path).display().to_string();
		let mut sidecar_seen = modified_at(&sidecar_path);

		if !display_todo.is_empty() && budget > 0 {
			let by_field = |field: segment::Display| {
				live.values().find(|segment| segment.display == Some(field)).cloned()
			};
			let title_segment = by_field(segment::Display::Title);
			let subtitle_segment = by_field(segment::Display::Subtitle);
			// What the article is about, so a short form can be written to the piece rather than
			// to the words of the title. The description is written for exactly this and is not
			// drawn anywhere, so it costs the reader nothing to be long.
			let context = live
				.values()
				.find(|segment| segment.region == segment::Region::Frontmatter && segment.display.is_none())
				.map(|segment| segment.source.clone())
				.or_else(|| {
					live
						.values()
						.find(|segment| {
							segment.region == segment::Region::Body && segment.kind == segment::Kind::Prose
						})
						.map(|segment| segment.source.chars().take(600).collect())
				})
				.unwrap_or_default();

			if let Some(title_segment) = title_segment {
				let ids: std::collections::HashMap<segment::Display, String> = live
					.values()
					.filter_map(|segment| Some((segment.display?, segment.id.clone())))
					.collect();
				let mut ask: Vec<(String, segment::Display)> = Vec::new();
				for (_, field, missing) in &display_todo {
					for locale in missing {
						ask.push((locale.clone(), *field));
					}
				}
				let mut held: Vec<(String, segment::Display, String)> = Vec::new();
				for (field, id) in &ids {
					let Some(stored) = sidecar.segments.get(id) else {
						continue;
					};
					for (locale, entry) in stored {
						if !ask.iter().any(|(l, f)| l == locale && f == field) {
							held.push((locale.clone(), *field, entry.text.clone()));
						}
					}
				}

				let claimed = claim::take(repository, "i18n", &format!("{article_key}#display"));
				match claimed {
					Err(claim::Denied::Taken(_)) => outcome.claimed_elsewhere += 1,
					Err(claim::Denied::Io(error)) => return Err(error),
					Ok(claimed) => {
						let asked = ask.len();
						let result = translate_display(DisplayRequest {
							title: &title_segment.source,
							subtitle: subtitle_segment.as_ref().map(|s| s.source.as_str()),
							context: &context,
							wanted: ask,
							have: held,
							runner,
							model_override: model_override.clone(),
							source_locale: source_locale.clone(),
						})
						.await;
						budget = budget.saturating_sub(asked);
						match result {
							Ok((entries, tokens, usd, unfinished)) => {
								for (locale, field, entry) in entries {
									let Some(id) = ids.get(&field) else {
										continue;
									};
									sidecar.segments.entry(id.clone()).or_default().insert(locale, entry);
									outcome.translated += 1;
								}
								outcome.tokens += tokens;
								outcome.usd += usd;
								sidecar.version = store::VERSION;
								{
									let path = sidecar_path.clone();
									let snapshot = sidecar.clone();
									translations.apply(move || store::save(&path, &snapshot))?;
								}
								sidecar_seen = modified_at(&sidecar_path);
								if !unfinished.is_empty() {
									outcome.failed.push((
										"display".to_owned(),
										format!(
											"{} did not come back within budget",
											unfinished
												.iter()
												.map(|(locale, field)| format!("{locale}:{}", field.name()))
												.collect::<Vec<_>>()
												.join(", ")
										),
									));
								}
							}
							Err(Refusal::Exhausted(reason)) => {
								outcome.exhausted = Some(reason);
								drop(claimed);
								return Ok(outcome);
							}
							Err(error) => {
								outcome.failed.push(("display".to_owned(), error.to_string()));
							}
						}
						drop(claimed);
					}
				}
			}
		}

		let progress = progress::Progress::new(todo.len() as u64, sinks());
		progress.set_message(format!("{}", path.display()));

		// The claim on each in-flight segment, released when its result has been stored. Kept
		// beside the JoinSet rather than moved into the task so that a claim outlives the request
		// and covers the write as well: releasing at the end of the model call would let another
		// process start the same segment while this one was still saving it.
		let mut held: std::collections::HashMap<String, claim::Claim> =
			std::collections::HashMap::new();

		let mut queue = todo.into_iter();
		type Finished = (String, Result<(Vec<(String, Translation)>, u64, f64, Vec<String>), Refusal>);
		let mut running = tokio::task::JoinSet::<Finished>::new();

		loop {
			while running.len() < parallel {
				let Some((item, locales)) = queue.next() else {
					break;
				};

				// Claimed before anything is spent. A segment another process is translating right
				// now is left to it; the run reports it rather than paying for the same answer.
				let claimed = match claim::take(repository, "i18n", &format!("{article_key}#{}", item.id)) {
					Ok(claimed) => claimed,
					Err(claim::Denied::Taken(_)) => {
						outcome.claimed_elsewhere += 1;
						progress.inc(1);
						continue;
					}
					Err(claim::Denied::Io(error)) => return Err(error),
				};

				// The claim only stops two runs translating this segment at the same instant. A
				// run that finished it a moment ago and let go is invisible to the claim, and the
				// answer would simply be bought twice -- measured on favicons, where it cost a
				// request; here it costs the price of a translation. So the sidecar is re-read
				// whenever another process has touched it since we last looked, and a segment that
				// is no longer missing is dropped. See spec/tasks.md.
				let latest = modified_at(&sidecar_path);
				if latest != sidecar_seen {
					sidecar = store::load(&sidecar_path)?;
					sidecar_seen = latest;
				}
				let required = if item.region == segment::Region::Body {
					glosses.find(&item.id).map(|entry| entry.spans.as_slice()).unwrap_or_default()
				} else {
					&[]
				};
				let have = sidecar.segments.get(&item.id);
				if !force
					&& locales.iter().all(|locale| {
						!store::translation_missing(have.and_then(|map| map.get(locale)), required)
					}) {
					outcome.already_done += 1;
					progress.inc(1);
					drop(claimed);
					continue;
				}
				held.insert(item.id.clone(), claimed);

				progress.set_message(progress::preview(&item.source, 44));
				let (before, after) = neighbours(&item);
				let model_override = model_override.clone();
				let gloss = glosses.find(&item.id).cloned();
				let source_locale = source_locale.clone();
				let owned = item;
				running.spawn(async move {
					let id = owned.id.clone();
					(
						id,
						translate(
							&owned,
							before,
							after,
							TranslationOptions { runner, model_override, locales, source_locale, gloss },
						)
						.await,
					)
				});
			}
			if running.is_empty() {
				break;
			}

			let finished = match running.join_next().await {
				None => break,
				Some(Ok(result)) => result,
				Some(Err(error)) => (String::new(), Err(Refusal::Failed(error.to_string()))),
			};
			progress.inc(1);

			let (id, result) = finished;
			// Released once the result is in hand and about to be stored, not when the request
			// returned: the write below is part of the work this claim covers.
			let claimed = held.remove(&id);
			match result {
				Ok((entries, tokens, usd, lost)) => {
					let slot = sidecar.segments.entry(id.clone()).or_default();
					for (locale, entry) in entries {
						slot.insert(locale, entry);
						outcome.translated += 1;
					}
					outcome.tokens += tokens;
					outcome.usd += usd;
					// Written the moment it arrives, not batched: an interrupt with a run's worth
					// of paid segments still in memory throws all of it away -- it happened once.
					// Through the writer so the sidecar is never open in two places, since a
					// second copy on this article would otherwise clobber one of the two results.
					sidecar.version = store::VERSION;
					{
						let path = sidecar_path.clone();
						let snapshot = sidecar.clone();
						translations.apply(move || store::save(&path, &snapshot))?;
					}
					sidecar_seen = modified_at(&sidecar_path);
					if !lost.is_empty() {
						outcome.failed.push((id, format!("{} did not survive validation", lost.join(", "))));
					}
				}
				// One spent allowance ends the run. Every request after it would fail the same
				// way, and firing a hundred more only fills the screen with one fact repeated.
				Err(Refusal::Exhausted(reason)) => {
					outcome.exhausted = Some(reason);
					progress.finish_and_clear();
					return Ok(outcome);
				}
				Err(error) => outcome.failed.push((id, error.to_string())),
			}
			drop(claimed);
		}
		progress.finish_and_clear();
		// Anything still in flight when the loop ended keeps nothing: dropping the map releases
		// every remaining claim so an interrupted run does not leave items locked behind it.
		held.clear();
		articles_done += 1;
		let mut incomplete =
			store::missing(&sidecar, &live, locales, source_locale.as_deref(), &glosses);
		incomplete.retain(|id, _| live.get(id).is_some_and(|segment| scope.includes(segment)));
		outcome.incomplete_segments += incomplete.len();
		outcome.missing_locales += incomplete.values().map(Vec::len).sum::<usize>();
	}
	Ok(outcome)
}

#[cfg(test)]
mod tests;
