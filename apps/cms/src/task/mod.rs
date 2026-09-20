//! What long-running work exists, declared in one place.
//!
//! Every operation that takes more than an instant is described here and nowhere else: data,
//! not execution, so the catalogue can be complete before a runner exists. See spec/tasks.md,
//! "The catalogue is data, and it is complete before the runner" for why, and for what is
//! deliberately absent from it.

pub mod claim;
pub mod progress;
pub mod registry;
pub mod writer;

use serde::Serialize;

/// A record store a task reads or mutates.
///
/// Named for the record rather than the path, because two tasks conflict when they write the same
/// *records*, and the file layout underneath is free to change without rewriting the catalogue.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum Record {
	/// `contents/**/*.md`. Rewritten by the two import commands, `image` and `video`, each
	/// replacing reference paths in place.
	Articles,
	/// `contents/**/*.i18n.yaml`.
	Translations,
	/// `contents/**/*.summary.yaml`.
	Summaries,
	/// The translation-note table: phrases a translation has to gloss rather than render.
	Notes,
	/// `data/record/media.yaml`: descriptions and categories, which no command can rebuild.
	Media,
	/// `data/record/tags.yaml`.
	Tags,
	/// `data/record/diagram.json`: descriptions of the drawings articles carry as source.
	Diagrams,
	/// `data/build/segments.json`.
	Segments,
	/// Crate and repository facts the articles embed.
	Embeds,
	/// `data/record/metadata.json`: the merged record of every published asset.
	///
	/// The only link from a content id to the objects on disk, so a task that publishes bytes
	/// writes this too, and the sweep rewrites it as it drops what it deletes.
	Manifest,
	/// Published pictures, including a clip's poster.
	///
	/// These five name a kind rather than a directory: objects are filed by content id alone, so
	/// they all land in `data/bucket/objects`. Two writers can only meet on a key when they are
	/// writing identical bytes, and the one task that deletes declares every record, so what these
	/// partition is who writes what. See spec/tasks.md.
	PublicImage,
	/// Published rungs. Not the poster, which is a picture like any other.
	PublicVideo,
	/// Published caption tracks, one cut WebVTT per object.
	PublicCaptions,
	/// `data/bucket/metadata/meta/**`: the record for each published asset, in the other tree.
	PublicMeta,
	/// `data/source/favicon/**`: icons fetched from other people's sites, before publishing.
	PublicFavicon,
	/// Published OpenGraph cards.
	PublicOpengraph,
	/// Published licence texts.
	PublicLicense,
}

/// One long-running operation.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Spec {
	/// The `cms` subcommand, and the id everything else addresses this task by.
	pub id: &'static str,
	pub name: &'static str,
	pub detail: &'static str,
	/// Whether a run asks a model, and therefore spends money. Shown before anything offers it.
	pub paid: bool,
	/// Whether the operation fans out internally, so a run has many items rather than one.
	///
	/// This decides whether contention can be resolved per item. A task with one indivisible
	/// item can only be skipped whole; a task with many can hand off the ones already claimed
	/// and keep the rest.
	pub items: Items,
	pub reads: &'static [Record],
	pub writes: &'static [Record],
	/// Tasks whose output this one consumes. Declared, not yet enforced -- see the module note.
	pub after: &'static [&'static str],
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum Items {
	/// One unit of work that cannot be divided; a second runner can only stand aside.
	Whole,
	/// Many independently claimable units, described by what one unit is keyed on.
	Many(&'static str),
}

impl Spec {
	/// Whether two tasks can be in flight at once.
	///
	/// Reading the same record is not a conflict, and neither is writing a record another task
	/// only reads -- a reader that wants a consistent view takes it at the moment it reads.
	/// What cannot overlap is two tasks writing the same record, and even that is a statement
	/// about their *mutations*, which the writer serialises. This answers the coarser question
	/// an interface asks first: may these two be offered together.
	pub fn conflicts_with(&self, other: &Spec) -> bool {
		self.writes.iter().any(|record| other.writes.contains(record))
	}
}

/// Every long-running operation, in no significant order.
///
/// `overview`, `articles`, `derived`, `check`, `port`, `tasks` and `runs` are absent on purpose:
/// they read and return, and calling them tasks would put seven entries in every list that can
/// never be waited on, watched, or scheduled.
pub const CATALOG: &[Spec] = &[
	Spec {
		id: "image",
		name: "Derive images",
		detail: "Import what the articles reference, derive variants, then rewrite the references.",
		paid: false,
		items: Items::Many("image reference"),
		reads: &[Record::Articles, Record::Manifest],
		// One of the two tasks that edit article text, `video` being the other. Everything
		// reading `Articles` is downstream of it, which is why so many entries below name it in
		// `after`. `PublicMeta` and `Manifest` are the record beside the bytes and the index over
		// all of them, both rewritten for every picture derived.
		writes: &[Record::Articles, Record::PublicImage, Record::PublicMeta, Record::Manifest],
		after: &[],
	},
	Spec {
		id: "video",
		name: "Encode clips",
		detail: "Encode what the articles reference into a ladder, then rewrite the references.",
		paid: false,
		items: Items::Many("video reference"),
		reads: &[Record::Articles, Record::Media, Record::Manifest],
		// `Media` because a poster with no source is given the clip's, and the whole of
		// `data/record/media.yaml` is rewritten to record it -- so a description landing mid-run would
		// be lost. `PublicImage` is the poster's own variants, which are pictures like any other.
		writes: &[
			Record::Articles,
			Record::PublicVideo,
			Record::PublicImage,
			Record::PublicMeta,
			Record::Media,
			Record::Manifest,
		],
		after: &[],
	},
	Spec {
		id: "captions",
		name: "Attach a caption track",
		detail: "Cut one subtitle track to a clip's excerpt and record it against that clip.",
		paid: false,
		// `Whole` rather than `Many`: a person names one clip and one track, so a run is a single
		// indivisible unit and a second runner can only stand aside. Catalogued in spite of taking
		// arguments, because `PublicCaptions`, `PublicMeta` and `Manifest` are all written by the
		// sweep as well, and nothing could see that while it had no entry. See spec/tasks.md.
		items: Items::Whole,
		reads: &[Record::Media, Record::Manifest],
		writes: &[Record::PublicCaptions, Record::PublicMeta, Record::Manifest],
		after: &["video"],
	},
	Spec {
		id: "favicon",
		name: "Collect favicons",
		detail: "Fetch the icon each linkcard draws, one per site an article links to.",
		paid: false,
		items: Items::Many("domain"),
		reads: &[Record::Articles, Record::Manifest],
		// An icon is a resource, so collecting one writes everything importing a picture writes:
		// the source file, the bytes hashed into the objects tree, the published record, and the
		// manifest that is the register every id is allocated against.
		writes: &[Record::PublicFavicon, Record::PublicImage, Record::PublicMeta, Record::Manifest],
		after: &[],
	},
	Spec {
		id: "segments",
		name: "Write segment layout",
		detail: "Record each article's segment ids and their source ranges.",
		paid: false,
		items: Items::Whole,
		reads: &[Record::Articles],
		writes: &[Record::Segments],
		after: &["image"],
	},
	Spec {
		id: "alt",
		name: "Describe images",
		detail: "Ask a model for an accessible description of every picture that has none.",
		paid: true,
		items: Items::Many("content id"),
		reads: &[Record::Articles, Record::PublicImage],
		writes: &[Record::Media],
		after: &["image"],
	},
	Spec {
		id: "clip",
		name: "Describe clips",
		detail: "Ask a model to describe every video, from stills this repository samples.",
		paid: true,
		items: Items::Many("content id"),
		reads: &[Record::Articles, Record::Media],
		writes: &[Record::Media],
		after: &[],
	},
	Spec {
		id: "tag",
		name: "Classify images",
		detail: "Give each picture a category and tags.",
		paid: true,
		items: Items::Many("content id"),
		reads: &[Record::PublicImage],
		writes: &[Record::Media, Record::Tags],
		after: &["image"],
	},
	Spec {
		id: "tn",
		name: "Find translation notes",
		detail: "Suggest passages a translation would have to gloss rather than render.",
		paid: true,
		items: Items::Many("article"),
		reads: &[Record::Articles],
		writes: &[Record::Notes],
		after: &["segments"],
	},
	Spec {
		id: "i18n",
		name: "Translate articles",
		detail: "Carry every article segment into every locale.",
		paid: true,
		items: Items::Many("article, segment and locale"),
		reads: &[Record::Articles, Record::Notes],
		writes: &[Record::Translations],
		after: &["segments", "tn"],
	},
	Spec {
		id: "summary",
		name: "Write summaries",
		detail: "Write a reader-facing summary into each article, in the article's own language.",
		paid: true,
		items: Items::Many("article"),
		reads: &[Record::Articles],
		writes: &[Record::Summaries],
		after: &[],
	},
	Spec {
		id: "diagram",
		name: "Describe diagrams",
		detail: "Describe each drawing an article carries as source, in English.",
		paid: true,
		items: Items::Many("diagram"),
		reads: &[Record::Articles],
		writes: &[Record::Diagrams],
		after: &[],
	},
	Spec {
		id: "locale",
		name: "Translate labels and descriptions",
		detail: "Carry tag labels, image and diagram descriptions and summaries into every locale.",
		paid: true,
		items: Items::Many("record and locale"),
		reads: &[Record::Media, Record::Tags, Record::Summaries, Record::Diagrams],
		writes: &[Record::Media, Record::Tags, Record::Summaries, Record::Diagrams],
		after: &["alt", "clip", "tag", "summary", "diagram"],
	},
	Spec {
		id: "embed",
		name: "Fetch embedded data",
		detail: "Collect the crate and repository facts the articles embed.",
		paid: false,
		items: Items::Many("crate or repository"),
		reads: &[Record::Articles],
		writes: &[Record::Embeds],
		after: &[],
	},
	Spec {
		id: "og",
		name: "Render OpenGraph cards",
		detail: "Draw one card per page per language.",
		paid: false,
		items: Items::Many("page and locale"),
		reads: &[Record::Articles, Record::Translations],
		writes: &[Record::PublicOpengraph],
		after: &["i18n"],
	},
	Spec {
		id: "licenses",
		name: "Record licences",
		detail: "Record the licence of every dependency the apps ship.",
		paid: false,
		items: Items::Whole,
		reads: &[],
		writes: &[Record::PublicLicense],
		after: &[],
	},
	Spec {
		id: "gc",
		name: "Collect garbage",
		detail: "Drop published assets no article asks for.",
		paid: false,
		items: Items::Many("published asset"),
		reads: &[Record::Articles, Record::Manifest],
		// Deleting is writing. It is listed last and depends on everything that publishes,
		// because running it before those have caught up removes what they were about to claim.
		// Every tree the sweep walks is named here, and `Translations` is the second sweep behind
		// `--segments`: a tree this list forgets is one nothing can be held away from it.
		writes: &[
			Record::PublicImage,
			Record::PublicVideo,
			Record::PublicCaptions,
			Record::PublicMeta,
			Record::PublicFavicon,
			Record::PublicOpengraph,
			Record::PublicLicense,
			Record::Manifest,
			Record::Translations,
		],
		after: &["image", "video", "captions", "favicon", "og", "licenses", "i18n"],
	},
];

/// The task with this id, if the catalogue has one.
pub fn find(id: &str) -> Option<&'static Spec> {
	CATALOG.iter().find(|spec| spec.id == id)
}

/// Publish a run and hand back the progress it reports through.
///
/// One call rather than three: skipping `registry::publish` left a run invisible to `cms runs`
/// and the desktop Activity view even though it looked finished to whoever started it -- four
/// operations had drifted into that shape. The bar cannot be obtained without the run being
/// published first, so the mistake is unavailable by construction, and published before any
/// work so a second process asking mid-run gets yes rather than a gap. See spec/tasks.md.
pub fn start(
	repository: &std::path::Path,
	task: &str,
	shell: registry::Shell,
	total: u64,
	sink: Box<dyn progress::Sink>,
) -> std::io::Result<progress::Progress> {
	let entry = registry::publish(repository, task, shell, total)?;
	Ok(progress::Progress::new(
		total,
		Box::new(Both { first: sink, second: Box::new(registry::Published::new(entry)) }),
	))
}

/// Reports to two sinks. A run is watched by whoever started it and by the registry at once.
struct Both {
	first: Box<dyn progress::Sink>,
	second: Box<dyn progress::Sink>,
}

impl progress::Sink for Both {
	fn started(&self, total: u64) {
		self.first.started(total);
		self.second.started(total);
	}

	fn advanced(&self, done: u64, total: u64, message: &str) {
		self.first.advanced(done, total, message);
		self.second.advanced(done, total, message);
	}

	fn finished(&self) {
		self.first.finished();
		self.second.finished();
	}

	/// Only the first sink can be drawing on a terminal; the registry writes to a file and has
	/// nothing to move out of the way.
	fn suspend(&self, body: &mut dyn FnMut()) {
		self.first.suspend(body);
	}
}

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn every_id_is_unique() {
		let mut seen: Vec<&str> = CATALOG.iter().map(|spec| spec.id).collect();
		let count = seen.len();
		seen.sort_unstable();
		seen.dedup();
		assert_eq!(seen.len(), count, "two tasks share an id");
	}

	/// A dependency naming a task that does not exist is a scheduler that deadlocks or silently
	/// skips, and the mistake is invisible until something reads `after` -- which nothing does
	/// yet. Checking it here is what makes declaring the edges early safe.
	#[test]
	fn every_dependency_names_a_task_in_the_catalogue() {
		for spec in CATALOG {
			for dependency in spec.after {
				assert!(
					find(dependency).is_some(),
					"{} depends on {dependency}, which is not a task",
					spec.id
				);
			}
		}
	}

	#[test]
	fn no_task_depends_on_itself() {
		for spec in CATALOG {
			assert!(!spec.after.contains(&spec.id), "{} depends on itself", spec.id);
		}
	}

	/// The pair that motivated per-item claiming rather than per-file leases: both spend minutes
	/// asking a model and both touch `data/record/media.yaml` for milliseconds at the end.
	#[test]
	fn describing_and_classifying_contend_over_the_same_record() {
		let alt = find("alt").expect("alt");
		let tag = find("tag").expect("tag");
		assert!(alt.conflicts_with(tag));
		assert!(tag.conflicts_with(alt));
	}

	#[test]
	fn tasks_writing_unrelated_records_do_not_contend() {
		let favicon = find("favicon").expect("favicon");
		let i18n = find("i18n").expect("i18n");
		assert!(!favicon.conflicts_with(i18n));
	}

	/// Rewriting article text is confined to the two import commands, and to those alone: each
	/// turns a name an author typed into the content id it became. A third writer of `Articles`
	/// is a compatibility path nobody argued for. See spec/tasks.md.
	#[test]
	fn only_the_import_commands_rewrite_article_text() {
		let writers: Vec<&str> = CATALOG
			.iter()
			.filter(|spec| spec.writes.contains(&Record::Articles))
			.map(|spec| spec.id)
			.collect();
		assert_eq!(writers, vec!["image", "video"]);
	}

	/// Deleting is writing, so anything the sweep can remove is something it has to come after.
	///
	/// Stated as an invariant rather than as a list, because the pairs that were missing --
	/// `licenses` and `i18n` -- were missing exactly because nobody re-read the list after adding
	/// a kind to the sweep. See spec/tasks.md, "A published kind has one record".
	#[test]
	fn the_sweep_comes_after_everything_whose_output_it_can_delete() {
		let gc = find("gc").expect("gc");
		for spec in CATALOG.iter().filter(|spec| spec.id != "gc") {
			if spec.conflicts_with(gc) {
				assert!(
					gc.after.contains(&spec.id),
					"gc can delete what {} writes but does not come after it",
					spec.id
				);
			}
		}
	}

	/// The three the survey found: a licence text, a caption track and a translation entry are all
	/// published bytes the sweep removes, and none of the three could be seen from the catalogue.
	#[test]
	fn the_sweep_contends_with_the_runs_that_publish_what_it_removes() {
		let gc = find("gc").expect("gc");
		for id in ["licenses", "i18n", "video"] {
			let spec = find(id).expect("spec");
			assert!(gc.conflicts_with(spec), "gc does not contend with {id}");
			assert!(spec.conflicts_with(gc), "{id} does not contend with gc");
		}
	}

	/// The race the entry was added to make visible: both rewrite `contents/**/*.md`, and while
	/// `video` had no entry the mechanism that keeps them apart could not see it.
	#[test]
	fn the_two_import_commands_contend_over_article_text() {
		let image = find("image").expect("image");
		let video = find("video").expect("video");
		assert!(image.conflicts_with(video));
		assert!(video.conflicts_with(image));
	}
}
