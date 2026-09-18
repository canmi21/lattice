//! The `cms clip` command: describing a video for someone who cannot watch it.
//!
//! Not a branch of `cms alt`. That command hands a runner one file and asks it to look, which is
//! what a picture is; a clip is a series of stills this repository chose, a word budget derived
//! from its length, and a paragraph of background it must not answer with. Three different
//! questions in one function would be three sets of flags nobody could keep straight, and
//! `alt::pending` already leaves clips out for exactly this reason. Same shape as `cms diagram`:
//! one operation, one subject, one prompt. See spec/architecture/video/pipeline.md.
//!
//! The description is stored where a picture's is -- `description` in `data/record/media.yaml`,
//! under the source locale -- so `cms locale` carries it into every language with no branch of its
//! own, and the site reads one field whatever the asset is.

use crate::alt::{PARALLEL, SOURCE_LOCALE, Spend};
use crate::frames::{self, Context, Excerpt};
use crate::i18n::runner::{self, Refusal, Runner};
use crate::image::manifest::{Media, Merged};
use crate::media::{self, Entry};
use crate::task::{Record, claim, progress, registry, writer};
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

#[derive(Debug, Default)]
pub struct Outcome {
	pub spent: Spend,
	pub described: usize,
	/// Clips that already had a description and were not asked about again.
	pub skipped: usize,
	/// Clips that still want one but were held back by `--limit`.
	pub deferred: usize,
	pub failed: Vec<(String, String)>,
	pub claimed_elsewhere: usize,
	/// Clips with no original on hand. A rung would decode, but the frames are read for text and
	/// re-encoding twice is not what to read it from.
	pub unreadable: Vec<String>,
	/// Words asked for across the run, so the budget can be read against what came back.
	pub words: u32,
}

/// Which clips still want describing, paired with the original to sample.
///
/// Clips only, and the mirror image of `alt::pending`: between them every asset in the manifest
/// is somebody's work, and neither counts the other's as skipped.
fn pending(
	merged: &Merged,
	described: &media::Media,
	originals: &Path,
	force: bool,
) -> (Vec<(String, PathBuf)>, Vec<String>) {
	let wanted: Vec<&String> = merged
		.media
		.iter()
		.filter(|(_, media)| media.video().is_some())
		.map(|(cid, _)| cid)
		.filter(|cid| {
			force || described.media.get(*cid).is_none_or(|entry| entry.description.is_empty())
		})
		.collect();
	if wanted.is_empty() {
		return (Vec::new(), Vec::new());
	}

	let by_id = originals_by_id(originals);
	let mut found = Vec::new();
	let mut missing = Vec::new();
	for cid in wanted {
		match by_id.get(cid) {
			Some(path) => found.push((cid.clone(), path.clone())),
			None => missing.push(cid.clone()),
		}
	}
	(found, missing)
}

/// Content id of every original on hand. Hashed rather than matched by name, because the id *is*
/// the hash and `data/source/video` holds whatever the files arrived called.
fn originals_by_id(originals: &Path) -> BTreeMap<String, PathBuf> {
	let Ok(entries) = std::fs::read_dir(originals) else {
		return BTreeMap::new();
	};
	entries
		.filter_map(Result::ok)
		.map(|entry| entry.path())
		.filter(|path| path.is_file() && crate::video::is_video(&path.to_string_lossy()))
		.filter_map(|path| {
			let bytes = std::fs::read(&path).ok()?;
			Some((crate::image::cid(&bytes), path))
		})
		.collect()
}

/// The title of the article each clip appears in, by content id.
///
/// One walk of the corpus rather than one per clip. A clip in no article gets no title, which is
/// correct: the context is what the repository knows, and it knows nothing about where a file
/// imported ahead of its article will land.
fn titles(articles: &Path) -> BTreeMap<String, String> {
	let Ok(scan) = crate::refs::scan(articles) else {
		return BTreeMap::new();
	};
	let mut found = BTreeMap::new();
	let mut read: BTreeMap<PathBuf, Option<String>> = BTreeMap::new();
	for reference in &scan.images {
		let Some((cid, extension)) = reference.resolved() else { continue };
		if extension != crate::video::encode::EXTENSION {
			continue;
		}
		let title = read.entry(reference.file.clone()).or_insert_with(|| {
			let text = std::fs::read_to_string(&reference.file).ok()?;
			let fields = crate::document::fields(&text).ok()?;
			crate::summary::title_of(&fields).map(str::to_owned)
		});
		if let Some(title) = title {
			found.insert(cid.to_owned(), title.clone());
		}
	}
	found
}

/// What this repository already knows about one clip.
///
/// Every field is authored or derived from something authored -- the publisher from
/// `data/record/media.yaml`, the excerpt from the person who chose the window, the title from the
/// article -- because none of it is in the file. `frames::prompt` is what stops the model
/// answering with it instead of with the frames.
fn context_for(cid: &str, authored: &media::Media, titles: &BTreeMap<String, String>) -> Context {
	let entry = authored.media.get(cid);
	Context {
		// The publisher, never the route. A `cid://` source names an asset here and has no label,
		// which is exactly the case where there is no publisher to tell the model about.
		label: entry.and_then(|entry| entry.source.as_ref()).and_then(|source| source.label.clone()),
		excerpt: entry
			.and_then(|entry| entry.excerpt)
			.map(|excerpt| Excerpt { from: excerpt.from, to: excerpt.to }),
		article: titles.get(cid).cloned(),
	}
}

/// Sample one clip and ask a runner to describe it.
///
/// `frames::prepare` shells out to ffmpeg once per frame -- up to twenty-five times -- so it runs
/// on a blocking thread rather than stalling the reactor every other task is waiting on.
///
/// The `Request` is held across the call and dropped after it: `Frames` deletes its directory on
/// drop, and dropping it any earlier would delete the pictures the runner is being asked about.
async fn describe(
	runner: Runner,
	model_override: Option<&str>,
	path: PathBuf,
	clip: frames::Clip,
	context: Context,
) -> Result<(String, Spend, String, u32), Refusal> {
	let Some(model) = model_override.or_else(|| runner.model_for_vision()) else {
		return Err(Refusal::Failed(format!(
			"{} cannot read a picture; pick a runner that can",
			runner.provider()
		)));
	};

	let request = tokio::task::spawn_blocking(move || frames::prepare(&path, clip, &context))
		.await
		.map_err(|error| Refusal::Failed(error.to_string()))?
		.map_err(|error| Refusal::Failed(error.to_string()))?;

	let paths: Vec<&Path> = request.frames.frames.iter().map(|frame| frame.path.as_path()).collect();
	let answer = runner::ask_vision_many(runner, &request.prompt, model, &paths).await?;

	let text = answer.text.trim().to_owned();
	if text.is_empty() {
		return Err(Refusal::Failed("the model returned nothing".to_owned()));
	}
	let spend =
		Spend { input: answer.tokens, output: 0, cache_read: 0, cache_written: 0, usd: answer.usd };
	Ok((text, spend, answer.model, request.words))
}

pub struct Options<'a> {
	pub repository: &'a Path,
	pub runner: Runner,
	pub model_override: Option<String>,
	pub merged: &'a Merged,
	/// `data/source/video`. The originals, not the rungs.
	pub originals: &'a Path,
	pub articles: &'a Path,
	pub force: bool,
	pub limit: Option<usize>,
	pub shell: registry::Shell,
	pub sink: Box<dyn progress::Sink>,
}

/// Describe every clip that has no description yet, and record what came back.
pub async fn run(options: Options<'_>) -> std::io::Result<Outcome> {
	let Options {
		repository,
		runner,
		model_override,
		merged,
		originals,
		articles,
		force,
		limit,
		shell,
		sink,
	} = options;
	let described_path = media::path_for(repository);
	let described = media::load(&described_path)?;

	let (mut todo, unreadable) = pending(merged, &described, originals, force);
	let wanted = todo.len();
	if let Some(limit) = limit {
		todo.truncate(limit);
	}
	let clips = merged.media.values().filter(|media| media.video().is_some()).count();
	let mut outcome = Outcome {
		skipped: clips - wanted - unreadable.len(),
		deferred: wanted - todo.len(),
		unreadable,
		..Outcome::default()
	};

	let titles = titles(articles);
	let progress = crate::task::start(repository, "clip", shell, todo.len() as u64, sink)?;
	let writer = writer::Writer::start(repository, Record::Media)?;

	let mut queue = todo.into_iter();
	let mut running = Vec::new();
	let mut held: std::collections::HashMap<String, claim::Claim> = std::collections::HashMap::new();

	loop {
		while running.len() < PARALLEL {
			let Some((cid, path)) = queue.next() else {
				break;
			};
			// The numbers the sampling needs, taken from the record rather than probed again: the
			// import already measured them off this same file.
			let Some(video) = merged.media.get(&cid).and_then(Media::video) else {
				continue;
			};
			let clip =
				frames::Clip { duration: video.source.duration, frame_rate: video.source.frame_rate };
			let context = context_for(&cid, &described, &titles);
			let pinned = model_override.clone();

			// Claimed before anything is spent, the same as `cms alt`: sampling a clip is a minute
			// of ffmpeg and the call after it is somebody's money.
			match claim::take(repository, "clip", &cid) {
				Ok(claim) => {
					held.insert(cid.clone(), claim);
				}
				Err(claim::Denied::Taken(_)) => {
					outcome.claimed_elsewhere += 1;
					progress.inc(1);
					continue;
				}
				Err(claim::Denied::Io(error)) => return Err(error),
			}
			running.push(tokio::spawn(async move {
				(cid, describe(runner, pinned.as_deref(), path, clip, context).await)
			}));
		}
		if running.is_empty() {
			break;
		}

		let finished = running.remove(0);
		let (cid, result) = match finished.await {
			Ok(result) => result,
			Err(error) => (String::new(), Err(Refusal::Failed(error.to_string()))),
		};

		match result {
			Ok((text, spend, model, words)) => {
				outcome.spent.add(spend);
				outcome.words += words;
				let entry = crate::i18n::store::Translation {
					text,
					provider: runner.provider().to_owned(),
					model,
					at: crate::image::manifest::now(),
					seconds: 0.0,
					tokens: spend.total_in() + spend.output,
					review: false,
				};
				// Applied as it arrives and re-read inside the writer, for the reasons `cms alt`
				// does both: this was paid for, and another run may have written a different
				// asset since this one started.
				let path = described_path.clone();
				let key = cid.clone();
				let applied = writer.apply(move || {
					let mut current = media::load(&path)?;
					current
						.media
						.entry(key)
						.or_insert_with(Entry::default)
						.description
						.insert(SOURCE_LOCALE.to_owned(), entry);
					media::save(&path, &current)
				});
				match applied {
					Ok(()) => outcome.described += 1,
					Err(error) => outcome.failed.push((cid.clone(), error.to_string())),
				}
			}
			Err(error) => outcome.failed.push((cid.clone(), error.to_string())),
		}

		held.remove(&cid);
		progress.inc(1);
	}
	progress.finish_and_clear();
	Ok(outcome)
}

#[cfg(test)]
mod tests {
	use super::*;
	use crate::image::manifest::{Body, Video, VideoSource};

	fn clip_record() -> crate::image::manifest::Media {
		crate::image::manifest::Media {
			created: "2026-09-01T00:00:00Z".into(),
			updated: "2026-09-01T00:00:00Z".into(),
			blake3: String::new(),
			body: Body::Video(Video {
				source: VideoSource {
					mime: "video/mp4".into(),
					width: 1920,
					height: 1080,
					ratio: "16:9".into(),
					bytes: 1,
					duration: 24.0,
					frame_rate: 30.0,
					frames: 720,
					audio: true,
					loudness: None,
					peak: None,
				},
				poster: "poster".into(),
				variants: BTreeMap::new(),
				captions: BTreeMap::new(),
			}),
		}
	}

	fn merged_with(cid: &str) -> Merged {
		Merged {
			version: crate::image::manifest::VERSION,
			created: "2026-09-01T00:00:00Z".into(),
			updated: "2026-09-01T00:00:00Z".into(),
			media: BTreeMap::from([(cid.to_owned(), clip_record())]),
		}
	}

	#[test]
	fn a_picture_is_not_this_commands_work() {
		// The mirror of `alt::pending`, which leaves clips out. Between them every asset is
		// somebody's, and neither reports the other's as skipped.
		let temporary = tempfile::tempdir().expect("temp");
		let mut merged = merged_with("clip");
		merged.media.insert("picture".to_owned(), picture_record());
		let (todo, missing) = pending(&merged, &media::Media::default(), temporary.path(), false);
		assert!(todo.is_empty(), "no original is on hand");
		assert_eq!(missing, vec!["clip".to_owned()]);
	}

	#[test]
	fn the_original_is_found_by_its_hash_and_not_by_its_name() {
		let temporary = tempfile::tempdir().expect("temp");
		let bytes = b"not really an mp4, but it hashes".to_vec();
		// A name nothing could have guessed from the id.
		std::fs::write(temporary.path().join("whatever-it-arrived-as.mp4"), &bytes).expect("write");
		let id = crate::image::cid(&bytes);

		let (todo, missing) =
			pending(&merged_with(&id), &media::Media::default(), temporary.path(), false);
		assert!(missing.is_empty());
		assert_eq!(todo.len(), 1);
		assert_eq!(todo[0].0, id);
	}

	#[test]
	fn a_clip_already_described_is_left_alone_unless_forced() {
		let temporary = tempfile::tempdir().expect("temp");
		let bytes = b"not really an mp4, but it hashes".to_vec();
		std::fs::write(temporary.path().join("a.mp4"), &bytes).expect("write");
		let id = crate::image::cid(&bytes);

		let mut described = media::Media::default();
		described.media.insert(
			id.clone(),
			Entry {
				description: BTreeMap::from([(
					SOURCE_LOCALE.to_owned(),
					crate::i18n::store::Translation {
						text: "Already written.".into(),
						provider: "anthropic".into(),
						model: "claude".into(),
						at: "2026-09-01T00:00:00Z".into(),
						seconds: 0.0,
						tokens: 0,
						review: false,
					},
				)]),
				..Entry::default()
			},
		);

		let merged = merged_with(&id);
		assert!(pending(&merged, &described, temporary.path(), false).0.is_empty());
		assert_eq!(pending(&merged, &described, temporary.path(), true).0.len(), 1);
	}

	#[test]
	fn the_context_carries_the_publisher_and_the_window_but_never_the_route() {
		// A `cid://` source has no label by construction -- it names an asset here -- and that is
		// exactly the case where there is no publisher to tell the model about.
		let mut authored = media::Media::default();
		authored.media.insert(
			"clip".to_owned(),
			Entry {
				source: Some(media::Source {
					url: "https://example.invalid/archive/2019/film".into(),
					label: Some("Apple".into()),
				}),
				excerpt: Some(media::Excerpt { from: 2340.0, to: 2365.0 }),
				..Entry::default()
			},
		);
		let titles = BTreeMap::from([("clip".to_owned(), "Except Me".to_owned())]);

		let context = context_for("clip", &authored, &titles);
		assert_eq!(context.label.as_deref(), Some("Apple"));
		assert_eq!(context.article.as_deref(), Some("Except Me"));
		let excerpt = context.excerpt.expect("the window");
		assert_eq!((excerpt.from, excerpt.to), (2340.0, 2365.0));

		// Nothing authored, nothing claimed.
		let empty = context_for("unknown", &authored, &titles);
		assert!(empty.label.is_none() && empty.excerpt.is_none() && empty.article.is_none());
	}

	fn picture_record() -> crate::image::manifest::Media {
		crate::image::manifest::Media {
			created: "2026-09-01T00:00:00Z".into(),
			updated: "2026-09-01T00:00:00Z".into(),
			blake3: String::new(),
			body: Body::Image(crate::image::manifest::Image {
				thumbhash: String::new(),
				source: crate::image::manifest::Source {
					mime: "image/png".into(),
					width: 10,
					height: 10,
					ratio: "1:1".into(),
					bytes: 1,
				},
				metadata: None,
				variants: BTreeMap::new(),
			}),
		}
	}
}
