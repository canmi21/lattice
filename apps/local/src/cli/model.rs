//! The commands that ask a model and spend money doing it: summaries, descriptions of pictures,
//! diagrams and clips, translation of articles and of short strings, and classification. Each says
//! what it spent. See spec/architecture/local.md, "A class that spends money says so".

use super::*;

/// Drop the translations a selector names, so the next `local i18n` buys exactly those back.
pub(super) fn invalidate_translations(
	live: bool,
	selection: &i18n::invalidate::Selection<'_>,
	articles: &[std::path::PathBuf],
) -> anyhow::Result<ExitCode> {
	if selection.names_nothing() {
		eprintln!(
			"nothing selected: give --segment, --containing, or --translation-containing. An \
			 empty selection deleting everything is what --force on a translation run is for."
		);
		return Ok(ExitCode::FAILURE);
	}
	let root = paths::repo_root()?;
	let report = i18n::invalidate::run(&root.join("contents"), articles, selection, live)?;
	for (article, id, locales) in &report.dropped {
		println!(
			"{} {article}#{} {}",
			if live { "drop" } else { "would drop" },
			&id[..id.len().min(12)],
			locales.join(", ")
		);
	}
	if report.kept_reviewed > 0 {
		println!(
			"kept {} reviewed entr{} a person vouched for; unset review to include them",
			report.kept_reviewed,
			if report.kept_reviewed == 1 { "y" } else { "ies" }
		);
	}
	let entries: usize = report.dropped.iter().map(|(_, _, l)| l.len()).sum();
	println!(
		"{} {entries} locale entr{} across {} segment(s){}",
		if live { "dropped" } else { "would drop" },
		if entries == 1 { "y" } else { "ies" },
		report.dropped.len(),
		if live { "" } else { "; run again with --live" },
	);
	Ok(ExitCode::SUCCESS)
}

/// `local i18n` takes eight of them, which is past the point where positional parameters read.
pub(super) struct I18nArgs<'a> {
	pub(super) model: &'a ModelArgs,
	pub(super) force: bool,
	pub(super) check: bool,
	pub(super) frontmatter: bool,
	pub(super) limit: Option<usize>,
	pub(super) parallel: Option<usize>,
	pub(super) locale: &'a [String],
	pub(super) articles: &'a [std::path::PathBuf],
}

/// Write a reader-facing summary into every article that has none.
///
/// The value lands in a sidecar beside the article, in the article's own language. `local locale`
/// translates it into the other locales afterwards.
pub(super) fn summarise_articles(
	model: &ModelArgs,
	force: bool,
	limit: Option<usize>,
) -> anyhow::Result<ExitCode> {
	// Not `DEFAULT_TEXT`. This is the one text task carrying a constraint the model has to hold
	// against its own training -- summarise, but withhold the conclusion -- and the open-weight
	// default measurably does not: it handed over the whole design and then appended "reaches a
	// surprising conclusion", and gave a first-person essay's author a pronoun the article never
	// uses. Translation has no comparable trap, which is why that one stays on the cheap model.
	let runner = model.runner(i18n::runner::Runner::Codex);
	let model_override = model.overrides(runner).map_err(anyhow::Error::msg)?;

	let root = paths::repo_root()?;

	let runtime = tokio::runtime::Runtime::new().context("could not start a runtime")?;
	let outcome = match runtime.block_on(summary::run(summary::Options {
		repository: &root,
		runner,
		model_override,
		force,
		limit,
		shell: task::registry::Shell::Cli,
		sink: Box::new(task::progress::Terminal::new()),
	})) {
		Ok(outcome) => outcome,
		Err(error) => {
			eprintln!("{error}");
			return Ok(ExitCode::FAILURE);
		}
	};

	for (path, error) in &outcome.failed {
		eprintln!("fail  {path}: {error}");
	}
	if outcome.claimed_elsewhere > 0 {
		eprintln!("note  {} left to a run already summarising them", outcome.claimed_elsewhere);
	}
	println!(
		"{} written, {} already had one, {} reviewed, {} deferred, {} failed",
		outcome.written,
		outcome.skipped,
		outcome.reviewed,
		outcome.deferred,
		outcome.failed.len()
	);
	if outcome.written > 0 {
		let spent = outcome.spent;
		println!("{} in, ${:.2}", spent.total_in(), spent.usd);
		println!("run `local locale` to translate the new values");
	}
	if outcome.failed.is_empty() { Ok(ExitCode::SUCCESS) } else { Ok(ExitCode::FAILURE) }
}

/// Describe every diagram that has no description yet.
pub(super) fn describe_diagrams(
	model: &ModelArgs,
	force: bool,
	limit: Option<usize>,
) -> anyhow::Result<ExitCode> {
	// Not `DEFAULT_TEXT`, for the reason `summary` gives: this task carries a constraint the model
	// has to hold against its own reading, and the open-weight default measurably does not. Asked
	// to describe the picture and not the markup, it reported opacities, fill colours and the size
	// of the legend squares -- which is what the source says and not what the drawing shows.
	let runner = model.runner(i18n::runner::Runner::Codex);
	let model_override = model.overrides(runner).map_err(anyhow::Error::msg)?;
	let root = paths::repo_root()?;
	// A runtime only for this command, as with the others that wait on somebody else.
	let runtime = tokio::runtime::Runtime::new().context("could not start a runtime")?;
	let outcome = match runtime.block_on(diagram::run(diagram::Options {
		repository: &root,
		runner,
		model_override,
		force,
		limit,
		shell: task::registry::Shell::Cli,
		sink: Box::new(task::progress::Terminal::new()),
	})) {
		Ok(outcome) => outcome,
		Err(error) => {
			eprintln!("{error}");
			return Ok(ExitCode::FAILURE);
		}
	};

	for (name, error) in &outcome.failed {
		eprintln!("fail  {name}: {error}");
	}
	if outcome.claimed_elsewhere > 0 {
		eprintln!("note  {} left to a run already describing them", outcome.claimed_elsewhere);
	}
	println!(
		"{} written, {} already had one, {} reviewed, {} deferred, {} failed",
		outcome.written,
		outcome.skipped,
		outcome.reviewed,
		outcome.deferred,
		outcome.failed.len()
	);
	if outcome.written > 0 {
		let spent = outcome.spent;
		println!("{} in, ${:.2}", spent.total_in(), spent.usd);
		println!("run `local locale` to translate the new values");
	}
	if outcome.failed.is_empty() { Ok(ExitCode::SUCCESS) } else { Ok(ExitCode::FAILURE) }
}

/// Describe every asset that has no description yet.
///
/// The description is written into the manifest, so it belongs to the picture rather than to
/// whichever article happened to be open when it was generated. Every reference inherits it,
/// including ones written later.
pub(super) fn describe_images(
	model: &ModelArgs,
	force: bool,
	limit: Option<usize>,
) -> anyhow::Result<ExitCode> {
	let runner = model.runner(i18n::runner::DEFAULT_VISION);
	let model_override = model.overrides(runner).map_err(anyhow::Error::msg)?;

	let root = paths::repo_root()?;
	let originals = crate::paths::image_originals(&root);
	let public = paths::objects_root(&root);
	let merged = match image::run::load(&root.join(image::run::MERGED)) {
		Ok(merged) => merged,
		Err(error) => {
			eprintln!("could not read {}: {error}", image::run::MERGED);
			return Ok(ExitCode::FAILURE);
		}
	};
	// A runtime only for this command. Everything else here is a local file walk that gains
	// nothing from one; this is the single place where the work is waiting on somebody else.
	let runtime = tokio::runtime::Runtime::new().context("could not start a runtime")?;
	let outcome = match runtime.block_on(alt::run(alt::Options {
		repository: &root,
		runner,
		model_override,
		merged: &merged,
		originals: &originals,
		force,
		limit,
		shell: task::registry::Shell::Cli,
		sink: Box::new(task::progress::Terminal::new()),
	})) {
		Ok(outcome) => outcome,
		Err(error) => {
			eprintln!("{error}");
			return Ok(ExitCode::FAILURE);
		}
	};

	for (cid, error) in &outcome.failed {
		eprintln!("fail  {cid}: {error}");
	}
	if outcome.claimed_elsewhere > 0 {
		eprintln!("note  {} left to a run already describing them", outcome.claimed_elsewhere);
	}
	let _ = public;

	println!(
		"{} described, {} already had one, {} left by --limit, {} failed",
		outcome.described,
		outcome.skipped,
		outcome.deferred,
		outcome.failed.len()
	);
	if outcome.described > 0 {
		let spent = outcome.spent;
		println!(
			"{} in ({} fresh, {} cached, {} written), {} out, ${:.2}",
			spent.total_in(),
			spent.input,
			spent.cache_read,
			spent.cache_written,
			spent.output,
			spent.usd
		);
	}
	if outcome.failed.is_empty() { Ok(ExitCode::SUCCESS) } else { Ok(ExitCode::FAILURE) }
}

/// `local clip`: the same question as `local alt`, asked about a series of stills.
///
/// A separate command rather than a flag, because it is a different question: the frames, the
/// budget and the guard against answering from context are all specific to a clip. See
/// spec/architecture/video/pipeline.md.
pub(super) fn describe_clips(
	model: &ModelArgs,
	force: bool,
	limit: Option<usize>,
) -> anyhow::Result<ExitCode> {
	let runner = model.runner(i18n::runner::DEFAULT_VISION);
	let model_override = model.overrides(runner).map_err(anyhow::Error::msg)?;

	let root = paths::repo_root()?;
	let originals = crate::paths::video_originals(&root);
	let articles = root.join("contents");
	let merged = match image::run::load(&root.join(image::run::MERGED)) {
		Ok(merged) => merged,
		Err(error) => {
			eprintln!("could not read {}: {error}", image::run::MERGED);
			return Ok(ExitCode::FAILURE);
		}
	};

	let runtime = tokio::runtime::Runtime::new().context("could not start a runtime")?;
	let outcome = match runtime.block_on(clip::run(clip::Options {
		repository: &root,
		runner,
		model_override,
		merged: &merged,
		originals: &originals,
		articles: &articles,
		force,
		limit,
		shell: task::registry::Shell::Cli,
		sink: Box::new(task::progress::Terminal::new()),
	})) {
		Ok(outcome) => outcome,
		Err(error) => {
			eprintln!("{error}");
			return Ok(ExitCode::FAILURE);
		}
	};

	for (cid, error) in &outcome.failed {
		eprintln!("fail  {cid}: {error}");
	}
	// Reported rather than fatal: a clip whose original is gone still plays, it just cannot be
	// sampled again. A rung would decode, but the frames are read for text and a re-encode of a
	// re-encode is not what to read it from. `local alt` and `local tag` carry no such line: they
	// select on the originals tree now, so a picture with no original is not their work to miss.
	for cid in &outcome.unreadable {
		eprintln!("warn  no original on hand for {cid}");
	}
	if outcome.claimed_elsewhere > 0 {
		eprintln!("note  {} left to a run already describing them", outcome.claimed_elsewhere);
	}

	println!(
		"{} described, {} already had one, {} left by --limit, {} failed",
		outcome.described,
		outcome.skipped,
		outcome.deferred,
		outcome.failed.len()
	);
	if outcome.described > 0 {
		let spent = outcome.spent;
		println!(
			"{} words asked for, {} tokens in, {} out, ${:.4}",
			outcome.words,
			spent.total_in(),
			spent.output,
			spent.usd
		);
	}
	Ok(if outcome.failed.is_empty() { ExitCode::SUCCESS } else { ExitCode::FAILURE })
}

/// Translate every article segment that has no translation yet.
///
/// One request covers one segment's missing locales, so an edited paragraph costs one call while
/// a partial repair does not repay for completed languages.
pub(super) fn translate_articles(args: I18nArgs<'_>) -> anyhow::Result<ExitCode> {
	let I18nArgs { model, force, check, frontmatter, limit, parallel, locale, articles } = args;
	let scope = if frontmatter { i18n::Scope::Frontmatter } else { i18n::Scope::All };
	let parallel =
		i18n::parallelism(parallel.map(|n| n.to_string()).as_deref()).map_err(anyhow::Error::msg)?;
	let locales = i18n::selected_locales(locale).map_err(anyhow::Error::msg)?;
	let only = articles.to_vec();
	let runner = model.runner(i18n::runner::DEFAULT_TEXT);
	let model_override = model.overrides(runner).map_err(anyhow::Error::msg)?;

	let root = paths::repo_root()?;
	if let Err(error) = i18n::layout::sync(&root) {
		eprintln!("could not write {}: {error}", i18n::layout::FILE);
		return Ok(ExitCode::FAILURE);
	}

	let runtime = tokio::runtime::Runtime::new().context("could not start a runtime")?;
	let outcome = match runtime.block_on(i18n::run(
		&root.join("contents"),
		&only,
		i18n::RunOptions {
			runner,
			model_override,
			limit,
			parallel,
			force,
			scope,
			locales: &locales,
			check,
			repository: &root,
			shell: task::registry::Shell::Cli,
			sinks: Box::new(|| Box::new(task::progress::Terminal::new())),
		},
	)) {
		Ok(outcome) => outcome,
		Err(error) => {
			eprintln!("could not write: {error}");
			return Ok(ExitCode::FAILURE);
		}
	};

	for (id, error) in &outcome.failed {
		eprintln!("fail  {id}: {error}");
	}
	// Reported rather than swept here: an edited paragraph leaves its old translation behind,
	// and that text is usually still worth reading before it goes.
	if outcome.orphans > 0 {
		eprintln!("note  {} stale segments left by edits", outcome.orphans);
	}
	// Said out loud, because a silent skip looks identical to a run that did nothing. Naming the
	// article is how a person asks for one anyway, so the note names the way out as well.
	if outcome.drafts > 0 {
		eprintln!(
			"note  {} draft(s) left alone; name one to translate it before publishing",
			outcome.drafts
		);
	}
	// Not a failure. The work done is kept, and running again after the reset picks up exactly
	// where this stopped, because only missing segments are ever requested.
	if let Some(reason) = &outcome.exhausted {
		println!("stopped: {reason}");
	}
	// Policy findings, not failures: spec/i18n/prose.md's note policies are soft, so these are for a
	// person to judge, and the exit code ignores them.
	for (article, finding) in &outcome.audit {
		println!(
			"audit {article}#{} {}: {}",
			&finding.segment[..finding.segment.len().min(12)],
			finding.locale,
			finding.reason
		);
	}
	// Said out loud rather than left to arithmetic: the site does not render a half-translated
	// page, so one missing body block and a locale nobody can read are the same fact.
	for (article, locale, blocked) in &outcome.blocked_views {
		println!(
			"blocked {article} {locale}: {blocked} body segment(s) missing, so the whole view \
			 falls back to the source article"
		);
	}
	println!(
		"{} translations across {} segments, {} failed; {} incomplete segments ({} missing locale entries)",
		outcome.translated,
		outcome.segments,
		outcome.failed.len(),
		outcome.incomplete_segments,
		outcome.missing_locales,
	);
	if outcome.translated > 0 {
		println!("{} tokens, ${:.2}", outcome.tokens, outcome.usd);
	}
	// A spent allowance is a normal state to stop in, not an error to report as one.
	if outcome.failed.is_empty()
		&& (outcome.incomplete_segments == 0 || limit.is_some() || outcome.exhausted.is_some())
	{
		Ok(ExitCode::SUCCESS)
	} else {
		Ok(ExitCode::FAILURE)
	}
}

/// Materialise the Rust segment ids and source ranges for builds that do not have Rust.
pub(super) fn write_segment_layout() -> anyhow::Result<ExitCode> {
	let root = paths::repo_root()?;
	match i18n::layout::sync(&root) {
		Ok(true) => println!("wrote {}", i18n::layout::FILE),
		Ok(false) => println!("{} unchanged", i18n::layout::FILE),
		Err(error) => {
			eprintln!("could not write {}: {error}", i18n::layout::FILE);
			return Ok(ExitCode::FAILURE);
		}
	}
	Ok(ExitCode::SUCCESS)
}

/// Translate tag labels and image descriptions from their English source text.
pub(super) fn translate_locales(
	model: &ModelArgs,
	force: bool,
	limit: Option<usize>,
) -> anyhow::Result<ExitCode> {
	let runner = model.runner(i18n::runner::DEFAULT_TEXT);
	let model_override = model.overrides(runner).map_err(anyhow::Error::msg)?;

	let root = paths::repo_root()?;
	let runtime = tokio::runtime::Runtime::new().context("could not start a runtime")?;
	let outcome = match runtime.block_on(locale::run(locale::Options {
		repository: &root,
		runner,
		model_override,
		force,
		limit,
		shell: task::registry::Shell::Cli,
		sink: Box::new(task::progress::Terminal::new()),
	})) {
		Ok(outcome) => outcome,
		Err(error) => {
			eprintln!("could not write: {error}");
			return Ok(ExitCode::FAILURE);
		}
	};

	for (id, error) in &outcome.failed {
		eprintln!("fail  {id}: {error}");
	}
	if outcome.claimed_elsewhere > 0 {
		eprintln!("note  {} left to a run already translating them", outcome.claimed_elsewhere);
	}
	if let Some(reason) = &outcome.exhausted {
		println!("stopped: {reason}");
	}
	println!(
		"{} translations across {} sources, {} already present, {} left by --limit, {} failed",
		outcome.translated,
		outcome.sources,
		outcome.skipped,
		outcome.deferred,
		outcome.failed.len()
	);
	if outcome.translated > 0 {
		println!("{} tokens, ${:.2}", outcome.tokens, outcome.usd);
	}
	// Exhaustion is a normal stopping point even if an earlier independent unit failed.
	if outcome.exhausted.is_some() || outcome.failed.is_empty() {
		Ok(ExitCode::SUCCESS)
	} else {
		Ok(ExitCode::FAILURE)
	}
}

/// Give every asset a category and a handful of tags.
pub(super) fn classify_images(
	model: &ModelArgs,
	force: bool,
	limit: Option<usize>,
) -> anyhow::Result<ExitCode> {
	let runner = model.runner(i18n::runner::DEFAULT_VISION);

	let root = paths::repo_root()?;
	let runtime = tokio::runtime::Runtime::new().context("could not start a runtime")?;
	let outcome = match runtime.block_on(classify::run(classify::Options {
		repository: &root,
		runner,
		force,
		limit,
		shell: task::registry::Shell::Cli,
		sink: Box::new(task::progress::Terminal::new()),
	})) {
		Ok(outcome) => outcome,
		Err(error) => {
			eprintln!("could not write: {error}");
			return Ok(ExitCode::FAILURE);
		}
	};

	for (cid, error) in &outcome.failed {
		eprintln!("fail  {cid}: {error}");
	}
	if !outcome.minted.is_empty() {
		println!("new tags: {}", outcome.minted.join(", "));
	}
	if let Some(reason) = &outcome.exhausted {
		println!("stopped: {reason}");
	}
	println!(
		"{} classified, {} already done, {} failed",
		outcome.classified,
		outcome.skipped,
		outcome.failed.len()
	);
	if outcome.classified > 0 {
		println!("{} tokens, ${:.2}", outcome.tokens, outcome.usd);
	}
	if outcome.failed.is_empty() { Ok(ExitCode::SUCCESS) } else { Ok(ExitCode::FAILURE) }
}
