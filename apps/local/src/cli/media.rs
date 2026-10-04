//! The commands that make or fetch bytes: processing pictures and clips, attaching captions,
//! rendering the cards, and fetching favicons, embeds and tweets.

use super::*;

/// Collect the icons the articles' linkcards need.
///
/// With no arguments this follows the articles, which is the normal way to run it: every
/// linkcard names a site, and a `favicon` attribute names where that site's icon should come
/// from. Nothing is rewritten afterwards -- the attribute is an instruction to this command,
/// while the page always draws `/favicon/{domain}`. Explicit domains remain accepted for
/// collecting one ahead of the article that will link to it.
pub(super) fn fetch_favicons(force: bool, domains: &[String]) -> anyhow::Result<ExitCode> {
	let inputs: Vec<&str> = domains.iter().map(String::as_str).collect();

	let root = paths::repo_root()?;

	let wanted: Vec<refs::Wanted> = if inputs.is_empty() {
		match refs::scan(&root.join("contents")) {
			Ok(scan) => scan.wanted(),
			Err(error) => {
				eprintln!("could not read articles: {error}");
				return Ok(ExitCode::FAILURE);
			}
		}
	} else {
		favicon::host::normalise(inputs)
			.into_iter()
			.map(|domain| refs::Wanted { domain, source: None, tone: None })
			.collect()
	};

	if wanted.is_empty() {
		println!("no linkcards ask for an icon");
		return Ok(ExitCode::SUCCESS);
	}

	let outcome = match favicon::collect::run(favicon::collect::Options {
		repository: &root,
		wanted: &wanted,
		force,
		shell: task::registry::Shell::Cli,
		sink: Box::new(task::progress::Terminal::new()),
	}) {
		Ok(outcome) => outcome,
		Err(error) => {
			eprintln!("could not collect icons: {error}");
			return Ok(ExitCode::FAILURE);
		}
	};

	for (domain, reason) in &outcome.failed {
		eprintln!("fail  {domain}: {reason}");
	}
	// Named rather than counted: "three were somebody else's" is a different thing from "three
	// failed", and a person deciding whether to rerun needs to know which domains to expect.
	for domain in &outcome.claimed_elsewhere {
		println!("held  {domain} (another run has it)");
	}
	// Named rather than counted for the same reason: a rid goes into a record every article
	// linking to that site now resolves through, and it is the one thing here that cannot be
	// undone by running the command again.
	for (domain, resource) in &outcome.granted {
		println!("grant {resource} {domain}");
	}
	println!(
		"{} collected, {} already present, {} failed, {} held elsewhere, \
		 {} granted an id, {} record(s) rewritten",
		outcome.collected,
		outcome.skipped,
		outcome.failed.len(),
		outcome.claimed_elsewhere.len(),
		outcome.granted.len(),
		outcome.rerecorded
	);
	Ok(ExitCode::SUCCESS)
}

/// Render one OpenGraph card per article.
///
/// Nothing references these: the page emits `/opengraph/{slug}.png` and no article writes the
/// URL down, so there is no reference to rewrite and the slug is the name.
pub(super) fn render_cards(force: bool) -> anyhow::Result<ExitCode> {
	let root = paths::repo_root()?;

	// The site name, the author and their role all come from the file the pages read them
	// from, so a card and the page it belongs to cannot introduce the site differently.
	let outcome =
		match opengraph::run(&root, &paths::objects_root(&root), &root.join("contents"), force) {
			Ok(outcome) => outcome,
			Err(error) => {
				eprintln!("{error}");
				return Ok(ExitCode::FAILURE);
			}
		};

	for (slug, error) in &outcome.failed {
		eprintln!("fail  {slug}: {error}");
	}
	println!(
		"{} rendered, {} already present, {} removed, {} failed",
		outcome.rendered,
		outcome.skipped,
		outcome.removed,
		outcome.failed.len()
	);
	if outcome.failed.is_empty() { Ok(ExitCode::SUCCESS) } else { Ok(ExitCode::FAILURE) }
}

/// Derive and publish every image the articles ask for, then rewrite what they say.
///
/// With no file arguments this follows the articles. Named files are imported ahead of the
/// article that will use them, which is how `--original` gets attached to a photograph before
/// anything references it.
pub(super) fn process_images(
	force: bool,
	keep_original: bool,
	files: &[std::path::PathBuf],
) -> anyhow::Result<ExitCode> {
	let only = files.to_vec();

	let root = paths::repo_root()?;
	let originals = crate::paths::image_originals(&root);
	let public = paths::objects_root(&root);
	let articles = root.join("contents");

	let options = image::run::Options { force, keep_original, only: &only };
	let outcome =
		image::run::run(&root, &originals, &public, &articles, &options).context("could not write")?;

	for (path, error) in &outcome.failed {
		eprintln!("fail  {}: {error}", path.display());
	}
	// Reported, not fatal. An article may be written before its picture is dropped in, and
	// `local check` is where the whole list lives.
	for value in &outcome.missing {
		eprintln!("warn  no original for {value}");
	}
	println!(
		"{} derived, {} sidecars rewritten, {} unchanged, {} failed, {} references rewritten",
		outcome.processed,
		outcome.migrated,
		outcome.skipped,
		outcome.failed.len(),
		outcome.rewritten
	);

	if outcome.failed.is_empty() { Ok(ExitCode::SUCCESS) } else { Ok(ExitCode::FAILURE) }
}

/// The `local video` command: what the articles reference, encoded and published.
///
/// The same shape as `process_images` and deliberately not folded into it. The two commands read
/// one manifest and write one published tree, but they answer different questions -- what to
/// re-derive, what a rung is, what an extension means -- and the one place they were briefly
/// shared produced a clip looked for at `image/{cid}.avif`. See
/// spec/architecture/video/pipeline.md.
pub(super) fn process_videos(
	force: bool,
	files: &[std::path::PathBuf],
) -> anyhow::Result<ExitCode> {
	let only = files.to_vec();

	let root = paths::repo_root()?;
	let originals = crate::paths::video_originals(&root);
	let public = paths::objects_root(&root);
	let articles = root.join("contents");

	let options = video::run::Options { force, only: &only };
	let outcome =
		video::run::run(&root, &originals, &public, &articles, &options).context("could not write")?;

	for (path, error) in &outcome.failed {
		eprintln!("fail  {}: {error}", path.display());
	}
	// Reported, not fatal, for the reason `local image` reports rather than stops: an article may
	// be written before its clip is dropped in.
	for value in &outcome.missing {
		eprintln!("warn  no original for {value}");
	}
	if outcome.levelled > 0 {
		println!("{} clip(s) measured for loudness without re-encoding", outcome.levelled);
	}
	println!(
		"{} encoded, {} unchanged, {} failed, {} references rewritten, {} posters sourced",
		outcome.processed,
		outcome.skipped,
		outcome.failed.len(),
		outcome.rewritten,
		outcome.sourced
	);

	if outcome.failed.is_empty() { Ok(ExitCode::SUCCESS) } else { Ok(ExitCode::FAILURE) }
}

/// `local captions`: one track, one clip, and a length that has to agree.
///
/// Not folded into `local video` because a clip and its track do not arrive on the same day, and
/// often the track never arrives at all. See the note at the top of [`captions::run`].
pub(super) fn attach_captions(
	clip: &str,
	track: &std::path::Path,
	language: &str,
	kind: Option<captions::Kind>,
	force: bool,
) -> anyhow::Result<ExitCode> {
	let root = paths::repo_root()?;
	let public = paths::objects_root(&root);

	let options = captions::run::Options { language, kind, force };
	let outcome = captions::run::run(&root, &public, clip, track, &options)?;

	if let Some(replaced) = &outcome.replaced {
		println!("replaced {replaced}");
	}
	// Coverage is reported rather than judged: people stop talking, so a window with a gap in it
	// is ordinary, and only the person who chose the window can say whether this gap is.
	println!(
		"{} {} attached to {}: {} cues over {:.1}s of {:.1}s, {} bytes, as {}",
		outcome.kind.as_str(),
		options.language,
		outcome.clip,
		outcome.summary.cues,
		outcome.summary.covered,
		outcome.duration,
		outcome.bytes,
		outcome.track,
	);
	// The last line, and the only check for the thing no rule can reach: whether these words
	// belong to this clip. Nothing in a WebVTT file says which recording it transcribes, so this
	// is read by the person who typed the command or it is not read at all.
	if let Some(opening) = &outcome.summary.opening {
		println!("opens  {opening}");
	}
	Ok(ExitCode::SUCCESS)
}

/// The `local embed` command: the crate trees and repository facts the articles show.
///
/// See spec/architecture/data.md, "A CI build compiles the site, and no longer compiles the
/// corpus" for why this is fetched here rather than in the browser and stored under `data/build/`.
///
/// FIXME: this is the operation, not an adapter for one, contrary to spec/architecture/local.md's
/// one-operation-plus-two-adapters rule. It stays here until a second shell offers `local
/// embed`, when it moves in the same edit as the GUI adapter.
pub(super) fn fetch_embeds(force: bool) -> anyhow::Result<ExitCode> {
	let root = paths::repo_root()?;

	let mut crates = embed::Crates::default();
	let mut repos = embed::Repos::default();
	if !force {
		if let Ok(text) = std::fs::read_to_string(embed::crates_path(&root)) {
			crates = serde_json::from_str(&text).unwrap_or_default();
		}
		if let Ok(text) = std::fs::read_to_string(embed::repos_path(&root)) {
			repos = serde_json::from_str(&text).unwrap_or_default();
		}
	}

	let articles = refs::markdown_under(&root.join("contents")).context("could not read contents")?;
	let mut want = embed::Wanted::default();
	for path in &articles {
		if let Ok(text) = std::fs::read_to_string(path) {
			let found = embed::wanted(&text);
			want.crates.extend(found.crates);
			want.repos.extend(found.repos);
		}
	}
	want.crates.sort();
	want.crates.dedup();
	want.repos.sort();
	want.repos.dedup();

	let todo: Vec<&String> =
		want.crates.iter().filter(|name| !crates.crates.contains_key(*name)).collect();
	let todo_repos: Vec<&String> =
		want.repos.iter().filter(|name| !repos.repos.contains_key(*name)).collect();

	let progress = task::progress::Progress::new_terminal((todo.len() + todo_repos.len()) as u64);
	let mut failed = 0usize;
	for name in todo {
		progress.set_message(name.clone());
		match embed::fetch::krate(name) {
			Some(resolved) => {
				progress.suspend(|| {
					println!("  {name} {} -- {} deps", resolved.version, resolved.deps.len());
				});
				crates.crates.insert(name.clone(), resolved);
			}
			None => {
				failed += 1;
				progress.suspend(|| eprintln!("fail  {name}: not on the index"));
			}
		}
		progress.inc(1);
	}
	for name in todo_repos {
		progress.set_message(name.clone());
		match embed::fetch::repo(name) {
			Some(found) => {
				progress.suspend(|| println!("  {name} -- {} stars", found.stars));
				repos.repos.insert(name.clone(), found);
			}
			None => {
				failed += 1;
				progress.suspend(|| eprintln!("fail  {name}: GitHub did not answer"));
			}
		}
		progress.inc(1);
	}
	progress.finish_and_clear();

	if let Err(error) = image::store::write(
		&embed::crates_path(&root),
		serde_json::to_string_pretty(&crates).unwrap_or_default().as_bytes(),
	) {
		eprintln!("could not write crates.json: {error}");
		return Ok(ExitCode::FAILURE);
	}
	if let Err(error) = image::store::write(
		&embed::repos_path(&root),
		serde_json::to_string_pretty(&repos).unwrap_or_default().as_bytes(),
	) {
		eprintln!("could not write repos.json: {error}");
		return Ok(ExitCode::FAILURE);
	}

	println!("{} crates, {} repositories, {failed} failed", crates.crates.len(), repos.repos.len());
	Ok(ExitCode::SUCCESS)
}

pub(super) fn twitter_command(command: TwitterCommand) -> anyhow::Result<ExitCode> {
	match command {
		TwitterCommand::User { query, count } => {
			let query = query.join(" ");
			run_lookup(twitter::users(&query, count.unwrap_or(twitter::DEFAULT_COUNT)), "user search")
		}
		TwitterCommand::Keyword { query, limit, mode } => {
			let mode = match mode.as_deref().map(twitter::Mode::parse) {
				None => twitter::Mode::default(),
				Some(Some(mode)) => mode,
				Some(None) => {
					eprintln!("--mode takes Top or Latest");
					return Ok(ExitCode::FAILURE);
				}
			};
			let query = query.join(" ");
			run_lookup(
				twitter::keyword(&query, limit.unwrap_or(twitter::DEFAULT_LIMIT), mode),
				"keyword search",
			)
		}
		TwitterCommand::Thread { id } => run_lookup(twitter::thread(&id), "thread"),
		TwitterCommand::Semantic { query, limit, from, to, user, exclude_user, min_score } => {
			let mut options = twitter::Semantic::new(query.join(" "));
			if let Some(limit) = limit {
				options.limit = limit;
			}
			options.from_date = from;
			options.to_date = to;
			options.usernames = user;
			options.exclude_usernames = exclude_user;
			if let Some(score) = min_score {
				options.min_score = score;
			}
			run_lookup(twitter::semantic(options), "semantic search")
		}
	}
}

pub(super) fn run_lookup<F, T>(work: F, what: &str) -> anyhow::Result<ExitCode>
where
	F: std::future::Future<Output = Result<T, twitter::Error>>,
	T: serde::Serialize,
{
	let runtime = tokio::runtime::Runtime::new().context("could not start a runtime")?;
	match runtime.block_on(work) {
		Ok(value) => match serde_json::to_string_pretty(&value) {
			Ok(json) => {
				println!("{json}");
				Ok(ExitCode::SUCCESS)
			}
			Err(error) => {
				eprintln!("could not encode {what}: {error}");
				Ok(ExitCode::FAILURE)
			}
		},
		Err(error) => {
			eprintln!("{error}");
			Ok(ExitCode::FAILURE)
		}
	}
}
