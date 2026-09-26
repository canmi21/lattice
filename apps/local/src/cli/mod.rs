//! The command-line adapter for the operations both shells share. See spec/architecture/local.md.
//!
//! What it accepts is declared in [args], so an argument nothing names is refused rather than
//! ignored. The functions here take the parsed values and do no parsing of their own.

mod args;
mod corpus;
mod media;
mod model;

use crate::{
	alt, articles, captions, check, classify, clip, derived, diagram, document, embed, favicon, gc,
	i18n, image, licenses, locale, migrate, opengraph, overview, paths, port, refs, summary, task,
	twitter, video,
};
use anyhow::Context as _;
use args::{Cli, Command, ModelArgs, TwitterCommand};
use clap::Parser;
use corpus::{check_assets, collect_licenses, scan_notes};
use media::{
	attach_captions, fetch_embeds, fetch_favicons, process_images, process_videos, render_cards,
	twitter_command,
};
use model::{
	I18nArgs, classify_images, describe_clips, describe_diagrams, describe_images,
	invalidate_translations, summarise_articles, translate_articles, translate_locales,
	write_segment_layout,
};
use std::process::ExitCode;

pub fn run() -> ExitCode {
	let cli = match Cli::try_parse() {
		Ok(cli) => cli,
		// clap has already written the message -- a help request, a version, or a rejection that
		// names what was wrong. Its own exit code carries which of those it was.
		Err(error) => {
			let _ = error.print();
			return if error.use_stderr() { ExitCode::FAILURE } else { ExitCode::SUCCESS };
		}
	};

	match dispatch(cli.command) {
		Ok(code) => code,
		// `{:#}` is anyhow's flattened form: the failure and every context it collected on the way
		// up, on one line. Nothing above this point printed anything, so this is the only place a
		// person is told what went wrong -- and the only place the chain stops being a chain. See
		// spec/code.md.
		Err(error) => {
			eprintln!("{error:#}");
			ExitCode::FAILURE
		}
	}
}

/// Run one command.
///
/// `Err` means the command could not run. `Ok(ExitCode::FAILURE)` means it ran and has something
/// to report -- items that failed inside a batch that otherwise finished. Collapsing the two would
/// make `local alt` where one description failed indistinguishable from `local alt` in a
/// directory that is not a repository.
fn dispatch(command: Command) -> anyhow::Result<ExitCode> {
	match command {
		Command::Overview => print_overview(),
		Command::Articles => print_articles(),
		Command::Derived => print_derived(),
		Command::Tasks => print_tasks(),
		Command::Runs => print_runs(),
		Command::Port => print_port(),
		Command::Serve => serve(),
		Command::Segments => write_segment_layout(),
		Command::Check => check_assets(),
		Command::Licenses => collect_licenses(),
		Command::Favicon { force, domains } => fetch_favicons(force, &domains),
		Command::Image { force, original, files } => process_images(force, original, &files),
		Command::Video { force, files } => process_videos(force, &files),
		Command::Captions { clip, track, language, kind, force } => {
			attach_captions(&clip, &track, &language, kind, force)
		}
		Command::Og { force } => render_cards(force),
		Command::Alt { model, force, limit } => describe_images(&model, force, limit),
		Command::Tag { model, force, limit } => classify_images(&model, force, limit),
		Command::Clip { model, force, limit } => describe_clips(&model, force, limit),
		Command::Diagram { model, force, limit } => describe_diagrams(&model, force, limit),
		Command::Summary { model, force, limit } => summarise_articles(&model, force, limit),
		Command::I18n { model, force, check, frontmatter, limit, parallel, locale, articles } => {
			translate_articles(I18nArgs {
				model: &model,
				force,
				check,
				frontmatter,
				limit,
				parallel,
				locale: &locale,
				articles: &articles,
			})
		}
		Command::Tn { model, force, articles } => scan_notes(&model, force, &articles),
		Command::Embed { force } => fetch_embeds(force),
		Command::Locale { model, force, limit } => translate_locales(&model, force, limit),
		Command::Invalidate { live, segment, containing, translation_containing, locale, articles } => {
			invalidate_translations(
				live,
				&i18n::invalidate::Selection {
					segments: &segment,
					containing: &containing,
					translation_containing: &translation_containing,
					locales: &locale,
				},
				&articles,
			)
		}
		Command::Migrate { live } => grant_resource_ids(live),
		Command::Gc { live, segments, article } => {
			if segments || !article.is_empty() {
				collect_segments(live, &article)
			} else {
				collect_garbage(live)
			}
		}
		Command::Twitter { command } => twitter_command(command),
	}
}

fn print_overview() -> anyhow::Result<ExitCode> {
	match overview::snapshot() {
		Ok(snapshot) => match serde_json::to_string_pretty(&snapshot) {
			Ok(json) => {
				println!("{json}");
				Ok(ExitCode::SUCCESS)
			}
			Err(error) => {
				eprintln!("could not encode overview: {error}");
				Ok(ExitCode::FAILURE)
			}
		},
		Err(error) => {
			eprintln!("could not read overview: {error}");
			Ok(ExitCode::FAILURE)
		}
	}
}

fn print_articles() -> anyhow::Result<ExitCode> {
	match articles::listing() {
		Ok(listing) => match serde_json::to_string_pretty(&listing) {
			Ok(json) => {
				println!("{json}");
				Ok(ExitCode::SUCCESS)
			}
			Err(error) => {
				eprintln!("could not encode the article listing: {error}");
				Ok(ExitCode::FAILURE)
			}
		},
		Err(error) => {
			eprintln!("could not read the article listing: {error}");
			Ok(ExitCode::FAILURE)
		}
	}
}

fn print_derived() -> anyhow::Result<ExitCode> {
	match derived::report() {
		Ok(report) => match serde_json::to_string_pretty(&report) {
			Ok(json) => {
				println!("{json}");
				Ok(ExitCode::SUCCESS)
			}
			Err(error) => {
				eprintln!("could not encode the derived report: {error}");
				Ok(ExitCode::FAILURE)
			}
		},
		Err(error) => {
			eprintln!("could not read the derived report: {error}");
			Ok(ExitCode::FAILURE)
		}
	}
}

fn print_tasks() -> anyhow::Result<ExitCode> {
	match serde_json::to_string_pretty(task::CATALOG) {
		Ok(json) => {
			println!("{json}");
			Ok(ExitCode::SUCCESS)
		}
		Err(error) => {
			eprintln!("could not encode the task catalogue: {error}");
			Ok(ExitCode::FAILURE)
		}
	}
}

/// `local serve`: bind the pinned port and keep the collection half alive behind it.
///
/// The child is spawned here rather than left to a second task, because a service that answers
/// for half of itself is two services wearing one name. It dies with this process: the socket is
/// removed on the way in, so a stale one from a crash is not mistaken for a running half.
fn serve() -> anyhow::Result<ExitCode> {
	let repository = paths::repo_root()?;
	let port = port::from_env().map_err(|error| anyhow::anyhow!("{error}"))?;
	let runtime = tokio::runtime::Runtime::new().context("could not start a runtime")?;
	runtime.block_on(crate::serve::run(&repository, port))?;
	Ok(ExitCode::SUCCESS)
}

fn print_port() -> anyhow::Result<ExitCode> {
	match port::from_env() {
		Ok(port) => {
			println!("{port}");
			Ok(ExitCode::SUCCESS)
		}
		Err(error) => {
			eprintln!("{error}");
			Ok(ExitCode::FAILURE)
		}
	}
}

/// What is running anywhere on this machine for this repository.
fn print_runs() -> anyhow::Result<ExitCode> {
	let root = paths::repo_root()?;
	let runs = task::registry::live(&root).context("could not read the run registry")?;
	match serde_json::to_string_pretty(&runs) {
		Ok(json) => {
			println!("{json}");
			Ok(ExitCode::SUCCESS)
		}
		Err(error) => {
			eprintln!("could not encode the run registry: {error}");
			Ok(ExitCode::FAILURE)
		}
	}
}

/// Drop translations for paragraphs an article no longer has.
///
/// A separate sweep from `collect_garbage` below rather than part of it: the two collect
/// unrelated rubbish, and a person asking about one is not asking about the other. Scoped by
/// `--article`, the same operation the desktop client calls with the rows somebody ticked.
fn collect_segments(live: bool, scope: &[String]) -> anyhow::Result<ExitCode> {
	let root = paths::repo_root()?;
	let contents = root.join("contents");
	let sweep = gc::segments::plan(&contents, scope).context("could not plan")?;

	if sweep.is_empty() {
		println!("nothing to collect");
		return Ok(ExitCode::SUCCESS);
	}

	for stale in &sweep.articles {
		println!("drop  {} stale segments in {}", stale.ids.len(), stale.article);
	}
	println!("{} segments across {} articles", sweep.total(), sweep.articles.len());

	if !live {
		println!("dry run -- pass --live to delete");
		return Ok(ExitCode::SUCCESS);
	}
	match gc::segments::apply(&root, &contents, &sweep) {
		Ok(dropped) => {
			println!("collected {dropped} segments");
			Ok(ExitCode::SUCCESS)
		}
		Err(error) => {
			eprintln!("could not delete: {error}");
			Ok(ExitCode::FAILURE)
		}
	}
}

/// `local migrate`: the one pass that grants resource ids, dry by default.
///
/// Dry the same way `local gc` is, and for a sharper reason: this rewrites the committed manifest
/// and every article that names an asset, and neither can be regenerated. The listing is the
/// review and `--live` is the answer to it.
fn grant_resource_ids(live: bool) -> anyhow::Result<ExitCode> {
	let root = paths::repo_root()?;
	let articles = root.join("contents");
	let plan = migrate::plan(&root, &articles).context("could not plan")?;

	if plan.is_empty() {
		// Successfully, because a corpus already migrated is the state this command exists to
		// reach. Reporting it as a failure would make the second run of a pair look like a problem.
		println!("every record holds a resource id and says what it means -- nothing to migrate");
		return Ok(ExitCode::SUCCESS);
	}

	for grant in &plan.grants {
		println!("grant {} {}  {}", grant.resource, grant.kind, &grant.key[..grant.key.len().min(12)]);
	}
	for declared in &plan.declared {
		println!("mean  {} {}", declared.resource, declared.canonical);
	}
	for (from, to) in &plan.rewrites {
		println!("point {from} -> {to}");
	}
	println!(
		"{} id(s), {} canonical(s), {} reference(s), {} sidecar(s) to move, {} picture(s) \
		 become frames",
		plan.grants.len(),
		plan.declared.len(),
		plan.rewrites.len(),
		plan.sidecars.len(),
		plan.frames.len()
	);

	if !live {
		println!("dry run -- pass --live to write");
		return Ok(ExitCode::SUCCESS);
	}
	match migrate::apply(&root, &articles, &plan) {
		Ok(rewritten) => {
			println!(
				"granted {} ids, declared {} canonical(s), rewrote {rewritten} reference(s)",
				plan.grants.len(),
				plan.declared.len()
			);
			// Rewriting a reference moves every byte after it, and the segment layout is a set of
			// byte spans over these files. Said here because the alternative is finding out from a
			// failing test, and a view spliced from a stale layout is wrong silently.
			if rewritten > 0 {
				println!("run `local segments`: rewriting references moved the spans it records");
			}
			Ok(ExitCode::SUCCESS)
		}
		Err(error) => {
			eprintln!("could not migrate: {error}");
			Ok(ExitCode::FAILURE)
		}
	}
}

/// Dry by default. The listing is the review, and `--live` is the answer to it.
fn collect_garbage(live: bool) -> anyhow::Result<ExitCode> {
	let root = paths::repo_root()?;
	let public = paths::objects_root(&root);

	let sweep = gc::plan(&root, &public, &paths::metadata_root(&root), &root.join("contents"))
		.context("could not plan")?;

	if sweep.orphans.is_empty() && sweep.entries.is_empty() {
		// What was written down is reported, because a first run collects nothing by design and a
		// bare "nothing to collect" would read as "nothing is unnamed" -- the two are different
		// answers and only one of them means the next run will delete. See
		// spec/architecture/artifacts.md, "An object is swept an hour after nothing names it".
		match gc::pending(&root) {
			0 => println!("nothing to collect"),
			waiting => {
				println!("nothing to collect yet -- {waiting} waiting out the hour before they can be")
			}
		}
		return Ok(ExitCode::SUCCESS);
	}

	for path in &sweep.orphans {
		let shown = path.strip_prefix(&root).unwrap_or(path);
		println!("drop  {}", shown.display());
	}
	for cid in &sweep.entries {
		println!("drop  {} from metadata.json", cid);
	}
	println!(
		"{} objects, {} manifest entries, {:.1} MiB",
		sweep.orphans.len(),
		sweep.entries.len(),
		sweep.bytes as f64 / (1024.0 * 1024.0)
	);

	if !live {
		println!("dry run -- pass --live to delete");
		return Ok(ExitCode::SUCCESS);
	}
	if let Err(error) = gc::apply(&root, &sweep) {
		eprintln!("could not delete: {error}");
		return Ok(ExitCode::FAILURE);
	}
	println!("collected");
	Ok(ExitCode::SUCCESS)
}
