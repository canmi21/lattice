//! The ordered segment layout consumed by the site build.
//!
//! Rust alone decides segment boundaries and ids. The committed artifact carries only the byte
//! ranges and fingerprints of translatable spans, so the TypeScript build can assemble
//! translations without learning how segmentation works or requiring Rust in CI.

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

pub const FILE: &str = "data/build/segments.json";
pub const VERSION: u8 = 5;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Span {
	pub id: String,
	pub start: usize,
	pub end: usize,
	pub fingerprint: String,
	/// `frontmatter` and `body` are spans of the article, substituted in place. `display` is not:
	/// it addresses a stored string that was asked for rather than written, so it has no bytes of
	/// its own and the assembler steps over it. Its range is the full form it was written from,
	/// which is what has to change for it to go stale.
	pub region: String,
	/// Which drawn field this is, for the spans that are one. Absent for body prose.
	#[serde(skip_serializing_if = "Option::is_none")]
	pub field: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Layout {
	pub version: u8,
	pub articles: BTreeMap<String, Vec<Span>>,
	/// How long each article is, per view, in words -- the figure the article page draws beside
	/// its date and the home card sums.
	///
	/// Recorded here rather than counted by the site because the rule has to be one rule. What a
	/// word is across scripts took five libraries and a table of cases to settle (see
	/// [`crate::words`]), and a second implementation in TypeScript would be a second answer --
	/// which is exactly how the page came to disagree with the card in the first place. The site
	/// already requires this file and already reads it per article, so this costs it a lookup.
	///
	/// Keyed by view code, the same nine `cms og` draws. A separate map rather than a field on
	/// each article's entry, so the array of spans keeps the shape every existing reader expects.
	#[serde(default)]
	pub words: BTreeMap<String, BTreeMap<String, usize>>,
}

pub fn path_for(root: &Path) -> PathBuf {
	root.join(FILE)
}

pub fn build(root: &Path) -> std::io::Result<Layout> {
	let contents = root.join("contents");
	let mut articles = BTreeMap::new();
	let mut words = BTreeMap::new();
	for path in crate::refs::markdown_under(&contents)? {
		let article = std::fs::read_to_string(&path)?;
		let live = super::segment::translatable(&article).map_err(|error| {
			std::io::Error::new(std::io::ErrorKind::InvalidData, format!("{}: {error}", path.display()))
		})?;
		let sidecar_path = super::store::path_for(&path);
		let sidecar = super::store::load_checked(&sidecar_path)?;
		if let Some(sidecar) = &sidecar {
			super::validate::sidecar(&sidecar_path, &live, sidecar)?;
		}
		let relative = path
			.strip_prefix(&contents)
			.map_err(|error| std::io::Error::other(error.to_string()))?
			.to_string_lossy()
			.replace('\\', "/")
			.trim_start_matches('/')
			.to_owned();
		let spans = super::segment::split(&article)
			.map_err(|error| {
				std::io::Error::new(std::io::ErrorKind::InvalidData, format!("{}: {error}", path.display()))
			})?
			.into_iter()
			.filter(|segment| segment.kind.translatable())
			.map(|segment| {
				let bytes = &article.as_bytes()[segment.start..segment.end];
				let short = matches!(
					segment.display,
					Some(super::segment::Display::ShortTitle | super::segment::Display::ShortSubtitle)
				);
				Span {
					id: segment.id,
					start: segment.start,
					end: segment.end,
					fingerprint: fingerprint(bytes),
					region: if short {
						"display"
					} else {
						match segment.region {
							super::segment::Region::Frontmatter => "frontmatter",
							super::segment::Region::Body => "body",
						}
					}
					.to_owned(),
					field: segment.display.map(|field| field.name().to_owned()),
				}
			})
			.collect();
		words.insert(relative.clone(), words_per_view(&article, sidecar.as_ref()));
		articles.insert(relative, spans);
	}
	Ok(Layout { version: VERSION, articles, words })
}

/// The prose of one article counted once per view, in the language that view serves.
///
/// **Body prose and what is inside it, and nothing else.** A code block is not writing; neither is
/// a directive, a thematic break, or any of the objects a directive stands for -- a picture's
/// description, a linkcard's title, a diagram's caption, an embedded post. Those are components,
/// and a reader counting the length of an article does not mean them. Inline code and quotations
/// stay: they are inside the sentence, and a word processor would count them. What decides it is
/// `segment::Kind::translatable` over body spans, which already answers this question for the
/// translator, so there is no second list of what counts.
///
/// A view with no translation for a segment gets the source, because that is what the page
/// renders there.
pub fn words_per_view(
	article: &str,
	sidecar: Option<&super::store::Sidecar>,
) -> BTreeMap<String, usize> {
	let Ok(segments) = super::segment::split(article) else {
		return BTreeMap::new();
	};
	let mut counts = BTreeMap::new();
	for view in &crate::opengraph::locale::VIEWS {
		// `mw` has no tag and counts the source, because the source is what that view serves. Its
		// number is a hybrid of Han characters and Latin words, which is coherent for one article
		// -- the incoherence only appears when articles in different languages are summed, and
		// that is the home card's problem rather than this file's. `opengraph::census` makes its
		// own choice there, and says why.
		let tag = view.tag;
		let mut total = 0;
		for segment in &segments {
			if segment.region != super::segment::Region::Body || !segment.kind.translatable() {
				continue;
			}
			let text = tag
				.and_then(|tag| sidecar?.segments.get(&segment.id)?.get(tag))
				.map_or(segment.source.as_str(), |translation| translation.text.as_str());
			total += crate::words::count(text);
		}
		counts.insert(view.code.to_owned(), total);
	}
	counts
}

/// FNV-1a over the exact source bytes. This detects stale offsets; it is not an address.
///
/// Shared with `diagram`, which needs the same few lines for the same reason: the site has to be
/// able to recompute it, and the real hash is deliberately not reimplemented in TypeScript.
pub(crate) fn fingerprint(bytes: &[u8]) -> String {
	let mut checksum = 0x811c_9dc5_u32;
	for byte in bytes {
		checksum ^= u32::from(*byte);
		checksum = checksum.wrapping_mul(0x0100_0193);
	}
	format!("{checksum:08x}")
}

#[cfg(test)]
pub fn load(path: &Path) -> std::io::Result<Layout> {
	let text = std::fs::read_to_string(path)?;
	serde_json::from_str(&text).map_err(|error| std::io::Error::other(error.to_string()))
}

/// Rewrite only when the derived record changed, returning whether anything was written.
pub fn sync(root: &Path) -> std::io::Result<bool> {
	let path = path_for(root);
	let mut text = serde_json::to_string_pretty(&build(root)?)
		.map_err(|error| std::io::Error::other(error.to_string()))?;
	text.push('\n');
	if std::fs::read_to_string(&path).is_ok_and(|existing| existing == text) {
		return Ok(false);
	}
	if let Some(parent) = path.parent() {
		std::fs::create_dir_all(parent)?;
	}
	std::fs::write(path, text)?;
	Ok(true)
}

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn the_committed_layout_matches_the_rust_splitter() {
		let root = crate::paths::repo_root().expect("repository root");
		let committed = load(&path_for(&root)).expect("run `cms segments` to create the layout");
		let current = build(&root).expect("derive current layout");
		assert_eq!(
			committed, current,
			"article segmentation changed; run `cms segments` and commit the result"
		);
	}
}
