//! The commands that read the corpus and report on it: what assets are missing, which licences
//! the dependencies carry, and what the translator's notes cover.

use super::*;

/// Report what the articles reference and the published trees cannot answer for.
///
/// Always succeeds. This is a report, and a report that can fail a build is a gate wearing a
/// report's name.
pub(super) fn check_assets() -> anyhow::Result<ExitCode> {
	let root = paths::repo_root()?;

	let gaps = match check::report(&root, &root.join("contents")) {
		Ok(gaps) => gaps,
		Err(error) => {
			eprintln!("could not read articles: {error}");
			return Ok(ExitCode::FAILURE);
		}
	};

	if gaps.is_empty() {
		println!("every referenced asset is present");
		return Ok(ExitCode::SUCCESS);
	}

	for gap in &gaps {
		let action =
			gap.action.map(|action| format!(" -- run local {}", action.command())).unwrap_or_default();
		println!("{}  {}: {}{action}", gap.level.label(), gap.what, gap.detail);
	}
	let warnings = gaps.iter().filter(|gap| gap.level == check::Level::Warn).count();
	println!("{} missing, {warnings} of them images", gaps.len());
	Ok(ExitCode::SUCCESS)
}

/// Collect the licence of everything the deployables are built out of.
///
/// See spec/architecture/data.md, "A dependency's licence is an asset like any other" for why
/// this runs locally rather than in CI, and why a package with no declared licence fails it.
pub(super) fn collect_licenses() -> anyhow::Result<ExitCode> {
	let root = paths::repo_root()?;
	let public = paths::objects_root(&root);

	let mut found = licenses::npm::collect(&root).map_err(anyhow::Error::msg)?;
	let npm = found.len();
	found.extend(licenses::cargo::collect(&root).map_err(anyhow::Error::msg)?);
	println!("{npm} npm packages, {} crates", found.len() - npm);

	let assertions = licenses::read_assertions(&root).map_err(anyhow::Error::msg)?;

	let written =
		licenses::write(&public, found, &assertions).context("could not publish licence texts")?;

	let document = licenses::full_document(&public, &written.record)
		.context("could not assemble the full notice")?;
	if let Err(error) = image::store::write(&licenses::full_path(&root), document.as_bytes()) {
		eprintln!("could not write the full notice: {error}");
		return Ok(ExitCode::FAILURE);
	}

	let record_path = licenses::record_path(&root);
	let json =
		serde_json::to_string_pretty(&written.record).context("could not serialise the record")?;
	if let Err(error) = image::store::write(&record_path, format!("{json}\n").as_bytes()) {
		eprintln!("could not write {}: {error}", record_path.display());
		return Ok(ExitCode::FAILURE);
	}

	println!("{} unique texts, {} KiB in the full notice", written.objects, document.len() / 1024);
	for purl in &written.stale {
		println!("stale assertion, the package now declares its own or is gone: {purl}");
	}
	if !written.textless.is_empty() {
		println!("{} packages declare terms but ship no text", written.textless.len());
	}
	println!("wrote data/build/licenses.json");

	if !written.undeclared.is_empty() {
		eprintln!();
		for purl in &written.undeclared {
			eprintln!("no license declared: {purl}");
		}
		eprintln!(
			"{} packages declare no license at all -- decide about each before shipping them",
			written.undeclared.len()
		);
		return Ok(ExitCode::FAILURE);
	}
	Ok(ExitCode::SUCCESS)
}

/// The `local tn` command: which passages a translation must keep and explain, judged from the
/// whole article rather than one block at a time -- block-at-a-time missed every note, on four
/// articles, until this was split out. See spec/i18n/prose.md.
///
/// FIXME: this is the operation, not an adapter for one, contrary to spec/architecture/local.md's
/// one-operation-plus-two-adapters rule. It stays here until the desktop shell offers `local tn`,
/// when it moves in the same edit as the GUI adapter.
pub(super) fn scan_notes(
	model: &ModelArgs,
	force: bool,
	articles: &[std::path::PathBuf],
) -> anyhow::Result<ExitCode> {
	let only = articles.to_vec();
	let runner = model.runner(i18n::runner::DEFAULT_VISION);
	let model_override = model.overrides(runner).map_err(anyhow::Error::msg)?;

	let root = paths::repo_root()?;
	let runtime = tokio::runtime::Runtime::new().context("could not start a runtime")?;

	let contents = root.join("contents");
	let path = i18n::tn::path_for(&root);
	let mut table = match i18n::tn::load(&path) {
		Ok(table) => table,
		Err(error) => {
			eprintln!("could not read {}: {error}", path.display());
			return Ok(ExitCode::FAILURE);
		}
	};
	// Pages without `lang` are not articles. Keep them out of both new scans and the durable
	// registry, including records written by older versions of this command.
	let recorded = table.articles.len();
	table.articles.retain(|key, _| {
		std::fs::read_to_string(contents.join(key))
			.map(|source| {
				crate::document::fields(&source).is_ok_and(|fields| summary::lang_of(&fields).is_some())
			})
			// A missing source cannot prove the record belongs to a page. Preserve paid history
			// until a source file exists that positively identifies itself as one.
			.unwrap_or(true)
	});
	if table.articles.len() != recorded
		&& let Err(error) = i18n::tn::save(&path, &table)
	{
		eprintln!("could not write {}: {error}", path.display());
		return Ok(ExitCode::FAILURE);
	}

	// Named articles, or every one not yet read. An article scanned and found to need nothing
	// still counts as read, which is the distinction the table records so that a rerun does not
	// pay to learn the same nothing twice.
	let wanted: Vec<std::path::PathBuf> = if only.is_empty() {
		match refs::markdown_under(&contents) {
			// Drafts leave the sweep. Scanning one costs a model call and records that it was
			// read, and the text it was read from is going to change again -- the same argument
			// `local i18n` makes, and the same escape: naming an article still reaches it.
			Ok(all) => all
				.into_iter()
				.filter(|path| std::fs::read_to_string(path).is_ok_and(|text| !document::is_draft(&text)))
				.collect::<Vec<_>>(),
			Err(error) => {
				eprintln!("could not read {}: {error}", contents.display());
				return Ok(ExitCode::FAILURE);
			}
		}
	} else {
		only.into_iter().map(|item| if item.is_absolute() { item } else { root.join(item) }).collect()
	}
	.into_iter()
	.filter(|article| {
		std::fs::read_to_string(article)
			.ok()
			.and_then(|source| crate::document::fields(&source).ok())
			.is_some_and(|fields| summary::lang_of(&fields).is_some())
	})
	.collect();

	let mut suggested = 0usize;
	let mut spent = 0u64;
	let mut read = 0usize;

	// Counted over everything named, including articles already read: a bar that shrank as it
	// skipped would report a total that had never been true.
	let progress = task::progress::Progress::new_terminal(wanted.len() as u64);
	for article in &wanted {
		let key =
			article.strip_prefix(&contents).unwrap_or(article).to_string_lossy().replace('\\', "/");
		progress.set_message(key.clone());
		if !force && table.scanned(&key) {
			progress.inc(1);
			continue;
		}
		let text = match std::fs::read_to_string(article) {
			Ok(text) => text,
			Err(error) => {
				progress.suspend(|| eprintln!("fail  {key}: {error}"));
				progress.inc(1);
				continue;
			}
		};
		let (found, model, tokens) =
			match runtime.block_on(i18n::tn::scan(&text, runner, model_override.as_deref())) {
				Ok(result) => result,
				Err(error) => {
					progress.suspend(|| eprintln!("fail  {key}: {error}"));
					progress.inc(1);
					continue;
				}
			};
		spent += tokens;
		read += 1;

		let segments = match i18n::segment::split(&text) {
			Ok(segments) => segments,
			Err(error) => {
				eprintln!("{}: {error}", path.display());
				return Ok(ExitCode::FAILURE);
			}
		};
		let attached = i18n::tn::attach(&segments, &found);
		let mut entries = std::collections::BTreeMap::new();
		progress.suspend(|| {
			println!("{key}");
			if attached.is_empty() {
				println!("  nothing worth a note");
			}
			for (id, _, spans) in &attached {
				println!("  {}", &id[..12.min(id.len())]);
				for span in spans {
					println!("    {}  --  {}", span.phrase, span.guidance);
				}
			}
		});
		for (id, source, spans) in attached {
			suggested += spans.len();
			entries.insert(id, i18n::tn::Entry { source, spans });
		}
		// Recorded on sight, findings or none. The scan is paid for either way, so printing
		// without writing would mean reading the article twice to act on it once. Review is
		// deleting an entry you disagree with, which costs nothing; re-scanning does not.
		table.articles.insert(
			key,
			i18n::tn::Article {
				provider: runner.provider().to_owned(),
				model: i18n::model::normalise(&model),
				at: image::manifest::now(),
				tokens,
				segments: entries,
			},
		);
		// Written after each article rather than once at the end. An interrupted run otherwise
		// discards every article it had already paid to read, which this repository has been
		// bitten by before: a paid result is a purchase, not an intermediate.
		if let Err(error) = i18n::tn::save(&path, &table) {
			progress.suspend(|| eprintln!("could not write {}: {error}", path.display()));
			return Ok(ExitCode::FAILURE);
		}
		progress.inc(1);
	}
	progress.finish_and_clear();

	if read == 0 {
		println!("every article already read; pass --force to read one again");
		return Ok(ExitCode::SUCCESS);
	}
	println!(
		"{read} read, {suggested} suggestions in data/record/tn.yaml; delete any you disagree with"
	);
	println!("{spent} tokens");
	Ok(ExitCode::SUCCESS)
}
