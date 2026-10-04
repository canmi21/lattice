//! The `local locale` command: translating tag labels and image descriptions.
//!
//! These are short plain strings, not article blocks. An ordinary tag asks for every missing
//! non-source locale at once; descriptions remain one request per locale. Each unit is saved
//! as soon as it returns, so an interrupted run keeps every answer it paid for.

use crate::i18n::runner::{self, Answer, Refusal, Runner};
use crate::i18n::store::Translation;
use crate::task::{Record, claim, progress, registry as task_registry, writer};
use crate::{media, tags};
use std::future::Future;
use std::path::Path;

mod items;
use items::{
	Destination, Item, description_request, pending, pending_summaries, summary_request, tag_request,
};

const ATTEMPTS: usize = 3;
const BACKOFF_START: std::time::Duration = std::time::Duration::from_secs(5);
const BACKOFF_MAX: std::time::Duration = std::time::Duration::from_secs(120);

#[derive(Debug, Default)]
pub struct Outcome {
	pub translated: usize,
	pub sources: usize,
	pub skipped: usize,
	pub deferred: usize,
	pub tokens: u64,
	pub usd: f64,
	pub failed: Vec<(String, String)>,
	/// Values another run holds a claim on, left to it rather than translated twice.
	pub claimed_elsewhere: usize,
	pub exhausted: Option<String>,
}

async fn translate_description<F, Fut>(
	runner: Runner,
	model_override: Option<&str>,
	item: &Item,
	locale: &str,
	ask: &mut F,
) -> Result<(Translation, u64, f64), Refusal>
where
	F: FnMut(Runner, String, String) -> Fut,
	Fut: Future<Output = Result<Answer, Refusal>>,
{
	let mut attempt = 0usize;
	let mut backoff = BACKOFF_START;
	let mut last = Refusal::Failed(String::new());

	while attempt < ATTEMPTS {
		let (prompt, output_boundary) = match &item.destination {
			Destination::Summary(_) => {
				let request = summary_request(item, locale);
				(request.text, Some(request.boundary))
			}
			_ => (description_request(item, locale), None),
		};
		let model = model_override.unwrap_or_else(|| runner.model_for(item.kind, attempt)).to_owned();
		let at = crate::image::manifest::now();
		let clock = std::time::Instant::now();
		match ask(runner, prompt, model).await {
			Ok(answer) => {
				let text = match output_boundary {
					Some(boundary) => {
						let Some(text) = crate::i18n::prompt::bounded_reply(&answer.text, &boundary) else {
							last = Refusal::Failed(
								"summary translation was not enclosed by its output boundary".to_owned(),
							);
							attempt += 1;
							continue;
						};
						text
					}
					None => answer.text.trim().to_owned(),
				};
				if text.is_empty() {
					last = Refusal::Failed("the model returned nothing".to_owned());
					attempt += 1;
					continue;
				}
				let tokens = answer.tokens;
				let usd = answer.usd;
				return Ok((
					Translation {
						text,
						provider: runner.provider().to_owned(),
						model: answer.model,
						at,
						seconds: clock.elapsed().as_secs_f64(),
						tokens,
						review: false,
					},
					tokens,
					usd,
				));
			}
			Err(Refusal::Exhausted(reason)) => return Err(Refusal::Exhausted(reason)),
			Err(Refusal::Throttled(_)) => {
				tokio::time::sleep(backoff).await;
				backoff = (backoff * 2).min(BACKOFF_MAX);
			}
			Err(error) => {
				last = error;
				attempt += 1;
			}
		}
	}
	Err(last)
}

async fn translate_tag<F, Fut>(
	runner: Runner,
	model_override: Option<&str>,
	item: &Item,
	ask: &mut F,
) -> Result<(Vec<(String, Translation)>, u64, f64), Refusal>
where
	F: FnMut(Runner, String, String) -> Fut,
	Fut: Future<Output = Result<Answer, Refusal>>,
{
	let mut attempt = 0usize;
	let mut backoff = BACKOFF_START;
	let mut last = Refusal::Failed(String::new());

	while attempt < ATTEMPTS {
		let prompt = tag_request(item);
		let model = model_override.unwrap_or_else(|| runner.model_for(item.kind, attempt)).to_owned();
		let at = crate::image::manifest::now();
		let clock = std::time::Instant::now();
		match ask(runner, prompt, model).await {
			Ok(answer) => {
				let wanted = &item.locales;
				let found: Vec<(String, String)> = crate::i18n::prompt::parse(&answer.text, None)
					.unwrap_or_default()
					.into_iter()
					.filter(|(locale, _)| wanted.contains(locale))
					.collect();
				if found.is_empty() {
					last = Refusal::Failed("the model returned no requested locale".to_owned());
					attempt += 1;
					continue;
				}
				let provider = runner.provider().to_owned();
				let seconds = clock.elapsed().as_secs_f64();
				let entries = found
					.into_iter()
					.map(|(locale, text)| {
						(
							locale,
							Translation {
								text,
								provider: provider.clone(),
								model: answer.model.clone(),
								at: at.clone(),
								seconds,
								tokens: answer.tokens,
								review: false,
							},
						)
					})
					.collect();
				return Ok((entries, answer.tokens, answer.usd));
			}
			Err(Refusal::Exhausted(reason)) => return Err(Refusal::Exhausted(reason)),
			Err(Refusal::Throttled(_)) => {
				tokio::time::sleep(backoff).await;
				backoff = (backoff * 2).min(BACKOFF_MAX);
			}
			Err(error) => {
				last = error;
				attempt += 1;
			}
		}
	}
	Err(last)
}

pub struct Options<'a> {
	pub repository: &'a Path,
	pub runner: Runner,
	pub model_override: Option<String>,
	pub force: bool,
	pub limit: Option<usize>,
	pub shell: task_registry::Shell,
	/// Where to report progress. The CLI passes a terminal bar; the desktop passes its own.
	pub sink: Box<dyn progress::Sink>,
}

pub async fn run(options: Options<'_>) -> std::io::Result<Outcome> {
	let Options { repository, runner, model_override, force, limit, shell, sink } = options;
	run_with_model(
		repository,
		runner,
		model_override.as_deref(),
		force,
		limit,
		&crate::i18n::prompt::LOCALES,
		shell,
		sink,
		|runner, prompt, model| async move { runner::ask(runner, &prompt, &model).await },
	)
	.await
}

#[cfg(test)]
async fn run_with<F, Fut>(
	repo: &Path,
	runner: Runner,
	force: bool,
	limit: Option<usize>,
	locales: &[&str],
	ask: F,
) -> std::io::Result<Outcome>
where
	F: FnMut(Runner, String, String) -> Fut,
	Fut: Future<Output = Result<Answer, Refusal>>,
{
	run_with_model(
		repo,
		runner,
		None,
		force,
		limit,
		locales,
		task_registry::Shell::Cli,
		Box::new(progress::Silent),
		ask,
	)
	.await
}

#[allow(clippy::too_many_arguments)]
async fn run_with_model<F, Fut>(
	repo: &Path,
	runner: Runner,
	model_override: Option<&str>,
	force: bool,
	limit: Option<usize>,
	locales: &[&str],
	shell: task_registry::Shell,
	sink: Box<dyn progress::Sink>,
	mut ask: F,
) -> std::io::Result<Outcome>
where
	F: FnMut(Runner, String, String) -> Fut,
	Fut: Future<Output = Result<Answer, Refusal>>,
{
	let registry_path = tags::path_for(repo);
	let mut registry = tags::load(&registry_path)?;
	let described_path = media::path_for(repo);
	// Read once to plan against. Every write below goes through a writer that re-reads inside its
	// own lock, so this copy is never what gets saved.
	let described = media::load(&described_path)?;
	let drawings_path = crate::diagram::store_path(repo);
	let drawings = crate::diagram::load(&drawings_path)?;
	let (mut items, skipped) = pending(&registry, &described, &drawings, locales, force);
	// Summaries ride the same queue: the backoff, the exhausted-allowance stop and the
	// save-per-answer rule are all already here, and a second loop would have to grow its own.
	let (summaries, summaries_skipped) = pending_summaries(&repo.join("contents"), locales, force)?;
	items.extend(summaries);
	let skipped = skipped + summaries_skipped;
	let wanted = items.len();
	if let Some(limit) = limit {
		items.truncate(limit);
	}

	let mut outcome =
		Outcome { sources: items.len(), skipped, deferred: wanted - items.len(), ..Outcome::default() };
	let calls: usize = items
		.iter()
		.map(|item| match item.destination {
			Destination::Tag(_) => 1,
			Destination::Description(_) | Destination::Summary(_) | Destination::Diagram(_) => {
				item.locales.len()
			}
		})
		.sum();
	let progress = crate::task::start(repo, "locale", shell, calls as u64, sink)?;

	// One record per destination and no answer touching two, so the ordering rule spec/tasks.md
	// gives for multi-record tasks has nothing to decide here.
	let tag_writer = writer::Writer::start(repo, Record::Tags)?;
	let media_writer = writer::Writer::start(repo, Record::Media)?;
	let summary_writer = writer::Writer::start(repo, Record::Summaries)?;
	let diagram_writer = writer::Writer::start(repo, Record::Diagrams)?;

	for item in items {
		match &item.destination {
			Destination::Tag(name) => {
				progress.set_message(name.clone());
				// Claimed before the model is asked: a label another run is translating now is
				// left to it rather than paid for twice.
				let claimed = match claim::take(repo, "locale", &item.id("")) {
					Ok(claimed) => claimed,
					Err(claim::Denied::Taken(_)) => {
						outcome.claimed_elsewhere += 1;
						progress.inc(1);
						continue;
					}
					Err(claim::Denied::Io(error)) => return Err(error),
				};
				match translate_tag(runner, model_override, &item, &mut ask).await {
					Ok((entries, tokens, usd)) => {
						let Some(display) = registry.tags.get_mut(name).and_then(tags::Tag::translations_mut)
						else {
							outcome.failed.push((format!("tag {name}"), "tag is no longer ordinary".to_owned()));
							progress.inc(1);
							continue;
						};
						for (locale, translation) in entries {
							display.insert(locale, translation);
							outcome.translated += 1;
						}
						outcome.tokens += tokens;
						outcome.usd += usd;
						// One paid turn produced the whole tag, so one durable write commits it.
						// Re-read inside the writer: another run may have minted a tag since this
						// one started, and saving the copy read at the top would drop it.
						let path = registry_path.clone();
						let updated = registry.tags.get(name).cloned();
						let key = name.clone();
						if let Err(error) = tag_writer.apply(move || {
							let mut current = tags::load(&path)?;
							if let Some(tag) = updated {
								current.tags.insert(key, tag);
							}
							tags::save(&path, &current)
						}) {
							outcome.failed.push((format!("tag {name}"), error.to_string()));
						}
					}
					Err(Refusal::Exhausted(reason)) => {
						outcome.exhausted = Some(reason);
						progress.finish_and_clear();
						return Ok(outcome);
					}
					Err(error) => outcome.failed.push((format!("tag {name}"), error.to_string())),
				}
				drop(claimed);
				progress.inc(1);
			}
			Destination::Summary(path) => {
				for locale in &item.locales {
					progress.set_message(format!("{} {locale}", path.display()));
					let claimed = match claim::take(repo, "locale", &item.id(locale)) {
						Ok(claimed) => claimed,
						Err(claim::Denied::Taken(_)) => {
							outcome.claimed_elsewhere += 1;
							progress.inc(1);
							continue;
						}
						Err(claim::Denied::Io(error)) => return Err(error),
					};
					match translate_description(runner, model_override, &item, locale, &mut ask).await {
						Ok((translation, tokens, usd)) => {
							// Reloaded per answer rather than held open: an interrupted run has
							// to leave every translation it paid for on disk.
							let id = item.id(locale);
							let sidecar_path = path.clone();
							let locale = locale.clone();
							let applied = summary_writer.apply(move || {
								let mut sidecar = crate::summary::load(&sidecar_path)?;
								sidecar.version = crate::summary::VERSION;
								sidecar.summary.insert(locale, translation);
								let encoded = serde_yaml_ng::to_string(&sidecar).map_err(std::io::Error::other)?;
								std::fs::write(&sidecar_path, encoded)
							});
							if let Err(error) = applied {
								outcome.failed.push((id, error.to_string()));
								drop(claimed);
								progress.inc(1);
								continue;
							}
							outcome.translated += 1;
							outcome.tokens += tokens;
							outcome.usd += usd;
						}
						Err(Refusal::Exhausted(reason)) => {
							outcome.exhausted = Some(reason);
							progress.finish_and_clear();
							return Ok(outcome);
						}
						Err(error) => outcome.failed.push((item.id(locale), error.to_string())),
					}
					progress.inc(1);
				}
			}
			Destination::Description(cid) => {
				for locale in &item.locales {
					progress.set_message(format!("{cid} {locale}"));
					let claimed = match claim::take(repo, "locale", &item.id(locale)) {
						Ok(claimed) => claimed,
						Err(claim::Denied::Taken(_)) => {
							outcome.claimed_elsewhere += 1;
							progress.inc(1);
							continue;
						}
						Err(claim::Denied::Io(error)) => return Err(error),
					};
					match translate_description(runner, model_override, &item, locale, &mut ask).await {
						Ok((translation, tokens, usd)) => {
							let id = item.id(locale);
							let path = described_path.clone();
							let key = cid.clone();
							let locale = locale.clone();
							let applied = media_writer.apply(move || {
								let mut current = media::load(&path)?;
								current.media.entry(key).or_default().description.insert(locale, translation);
								media::save(&path, &current)
							});
							if let Err(error) = applied {
								outcome.failed.push((id, error.to_string()));
								drop(claimed);
								progress.inc(1);
								continue;
							}
							outcome.translated += 1;
							outcome.tokens += tokens;
							outcome.usd += usd;
						}
						Err(Refusal::Exhausted(reason)) => {
							outcome.exhausted = Some(reason);
							progress.finish_and_clear();
							return Ok(outcome);
						}
						Err(error) => outcome.failed.push((item.id(locale), error.to_string())),
					}
					progress.inc(1);
				}
			}
			Destination::Diagram(id) => {
				for locale in &item.locales {
					progress.set_message(format!("{id} {locale}"));
					let claimed = match claim::take(repo, "locale", &item.id(locale)) {
						Ok(claimed) => claimed,
						Err(claim::Denied::Taken(_)) => {
							outcome.claimed_elsewhere += 1;
							progress.inc(1);
							continue;
						}
						Err(claim::Denied::Io(error)) => return Err(error),
					};
					match translate_description(runner, model_override, &item, locale, &mut ask).await {
						Ok((translation, tokens, usd)) => {
							let reported = item.id(locale);
							let path = drawings_path.clone();
							let key = id.clone();
							let locale = locale.clone();
							let applied = diagram_writer.apply(move || {
								let mut current = crate::diagram::load(&path)?;
								current.version = crate::diagram::VERSION;
								current.diagrams.entry(key).or_default().description.insert(locale, translation);
								crate::diagram::save(&path, &current)
							});
							if let Err(error) = applied {
								outcome.failed.push((reported, error.to_string()));
								drop(claimed);
								progress.inc(1);
								continue;
							}
							outcome.translated += 1;
							outcome.tokens += tokens;
							outcome.usd += usd;
						}
						Err(Refusal::Exhausted(reason)) => {
							outcome.exhausted = Some(reason);
							progress.finish_and_clear();
							return Ok(outcome);
						}
						Err(error) => outcome.failed.push((item.id(locale), error.to_string())),
					}
					progress.inc(1);
				}
			}
		}
	}
	progress.finish_and_clear();
	Ok(outcome)
}

#[cfg(test)]
mod tests;
