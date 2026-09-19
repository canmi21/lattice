//! The `cms check` command: what the articles ask for that is not there.
//!
//! A report, never a gate. Publishing an article whose picture has not been imported yet is a
//! normal state to be in, and a build that refused it would only teach everyone to skip the
//! check. Severity carries the difference instead: a missing image leaves a hole in the page,
//! while a missing icon leaves a linkcard that still reads correctly.

use crate::refs::{self, Scan};
use crate::{favicon, image};
use std::path::Path;

#[derive(Debug, PartialEq, Eq, Clone, Copy)]
pub enum Level {
	/// The page will render with something visibly absent.
	Warn,
	/// A detail is missing and nothing else is affected.
	Info,
}

#[derive(Debug, PartialEq, Eq, Clone, Copy)]
pub enum Action {
	Image,
	Alt,
	Favicon,
}

impl Action {
	pub fn command(self) -> &'static str {
		match self {
			Self::Image => "image",
			Self::Alt => "alt",
			Self::Favicon => "favicon",
		}
	}
}

impl Level {
	pub fn label(self) -> &'static str {
		match self {
			Self::Warn => "warn",
			Self::Info => "info",
		}
	}
}

#[derive(Debug, PartialEq, Eq)]
pub struct Gap {
	pub level: Level,
	pub what: String,
	pub detail: String,
	pub action: Option<Action>,
}

/// Everything an article references that the published trees cannot answer for.
pub fn report(repo: &Path, articles: &Path) -> std::io::Result<Vec<Gap>> {
	let scan = refs::scan(articles)?;
	let described = crate::media::load(&crate::media::path_for(repo))?;
	// A reference names a resource; the manifest is what turns that into the record and the key
	// everything else here is filed by. Without it this could only count references.
	let merged = image::run::load(&repo.join(image::run::MERGED))?;
	Ok(gaps(
		&scan,
		&merged,
		&crate::paths::favicon_root(repo),
		&crate::paths::metadata_root(repo),
		&described,
	))
}

fn gaps(
	scan: &Scan,
	merged: &crate::image::manifest::Merged,
	icons: &Path,
	metadata: &Path,
	described: &crate::media::Media,
) -> Vec<Gap> {
	let mut found = Vec::new();

	for image in scan.unresolved() {
		found.push(Gap {
			level: Level::Warn,
			what: image.value.clone(),
			detail: "not derived yet".to_owned(),
			action: Some(Action::Image),
		});
	}

	// Reported under what the article writes, which is what somebody would search the corpus
	// for. A reference the manifest cannot resolve has no record and no description either, so
	// it is one gap rather than two.
	for reference in &scan.images {
		let Some(target) = reference.target() else { continue };
		let Some((key, media)) = merged.resolve(&target) else {
			found.push(Gap {
				level: Level::Warn,
				what: reference.value.clone(),
				detail: "nothing in the manifest holds this".to_owned(),
				action: Some(Action::Image),
			});
			continue;
		};
		if !image::store::meta_path(metadata, media.resource.as_str()).is_file() {
			found.push(Gap {
				level: Level::Warn,
				what: reference.value.clone(),
				detail: "referenced but not published".to_owned(),
				action: Some(Action::Image),
			});
		}
		// An image with no description is served correctly and read badly. That is a gap in what
		// the page says rather than in what it can show, so it sits below a missing image.
		if crate::alt::wants_description(described, key) {
			found.push(Gap {
				level: Level::Info,
				what: reference.value.clone(),
				detail: "no description".to_owned(),
				action: Some(Action::Alt),
			});
		}
	}

	for (domain, tone) in scan.icons() {
		if favicon::stored(icons, &domain, tone.as_deref()).is_none() {
			let detail = match &tone {
				Some(tone) => format!("no {tone} icon collected"),
				None => "no icon collected".to_owned(),
			};
			found.push(Gap { level: Level::Info, what: domain, detail, action: Some(Action::Favicon) });
		}
	}

	found
}

#[cfg(test)]
mod tests {
	use super::*;

	/// A directory that removes itself, however the test ends.
	///
	/// `TempDir` deletes on drop, which the hand-rolled predecessor could not: a panicking test
	/// left its directory behind, and the name carried the process id because two tests choosing
	/// the same one would otherwise share a directory. Both problems belonged to the workaround.
	fn temp() -> tempfile::TempDir {
		tempfile::tempdir().expect("temp")
	}

	fn article(root: &Path, text: &str) {
		std::fs::create_dir_all(root.join("contents")).expect("dir");
		std::fs::write(root.join("contents/a.md"), text).expect("write");
	}

	/// A manifest holding one picture, keyed by `cid` and answering to `resource`.
	///
	/// Without one every reference reads as something the manifest does not hold, which is a
	/// different gap from the ones these tests are about.
	fn manifest(root: &Path, resource: &str, cid: &str) {
		let merged = crate::image::manifest::Merged {
			version: crate::image::manifest::VERSION,
			created: "2026-09-14T00:00:00Z".into(),
			updated: "2026-09-14T00:00:00Z".into(),
			media: std::collections::BTreeMap::from([(
				cid.to_owned(),
				crate::image::manifest::fixture::picture(resource, cid, (10, 10), &[]),
			)]),
		};
		image::store::write(
			&root.join(image::run::MERGED),
			serde_json::to_string(&merged).expect("json").as_bytes(),
		)
		.expect("write");
	}

	#[test]
	fn a_reference_the_manifest_does_not_hold_is_reported_rather_than_passed_over() {
		// The likeliest way to see this is an article written by hand against an id that was
		// never granted. Silence here is a missing image nobody reports.
		let temporary = temp();
		let root = temporary.path();
		article(&root, "![](k7m2x)");
		manifest(&root, "00000", "44b6081deaf0242ca3bf83d62a3b6c95");

		let found = report(&root, &root.join("contents")).expect("report");
		assert_eq!(found.len(), 1);
		assert_eq!(found[0].level, Level::Warn);
		assert!(found[0].detail.contains("manifest"), "{:?}", found[0]);
		std::fs::remove_dir_all(&root).ok();
	}

	#[test]
	fn a_missing_image_outranks_a_missing_icon() {
		// One leaves a hole in the page and the other does not, so they must not be reported
		// at the same level -- a report where everything is urgent is a report nobody reads.
		let temporary = temp();
		let root = temporary.path();
		article(
			&root,
			r#"![](shot.png)
			::linkcard{url="https://a.example"}"#,
		);

		let found = report(&root, &root.join("contents")).expect("report");
		let image = found.iter().find(|gap| gap.what == "shot.png").expect("image");
		let icon = found.iter().find(|gap| gap.what == "a.example").expect("icon");

		assert_eq!(image.level, Level::Warn);
		assert_eq!(icon.level, Level::Info);
		std::fs::remove_dir_all(&root).ok();
	}

	#[test]
	fn a_published_reference_is_not_a_gap() {
		let temporary = temp();
		let root = temporary.path();
		let cid = "44b6081deaf0242ca3bf83d62a3b6c95";
		article(&root, "![](k7m2x)");
		manifest(&root, "k7m2x", cid);
		let meta = image::store::meta_path(&crate::paths::metadata_root(root), "k7m2x");
		std::fs::create_dir_all(meta.parent().expect("parent")).expect("dir");
		std::fs::write(&meta, b"{}").expect("write");

		// One gap remains and should: the bytes are published, but nothing has described them.
		// That is what `cms alt` is for, and it is information rather than a hole in the page.
		let found = report(&root, &root.join("contents")).expect("report");
		assert_eq!(found.len(), 1);
		assert_eq!(found[0].level, Level::Info);
		assert!(found[0].detail.contains("description"));
		std::fs::remove_dir_all(&root).ok();
	}

	#[test]
	fn a_reference_whose_record_is_gone_is_reported() {
		// The article says the work was done, and the bytes disagree. Sweeping too eagerly
		// looks exactly like this, which is the reason to notice it.
		let temporary = temp();
		let root = temporary.path();
		article(&root, "![](k7m2x)");
		manifest(&root, "k7m2x", "44b6081deaf0242ca3bf83d62a3b6c95");

		// Two now: the record is gone, and nothing has described the asset either. Only the
		// first is a warning -- a missing record leaves a hole, a missing description does not.
		let found = report(&root, &root.join("contents")).expect("report");
		assert_eq!(found.len(), 2);
		assert_eq!(found.iter().filter(|gap| gap.level == Level::Warn).count(), 1);
		std::fs::remove_dir_all(&root).ok();
	}
}
