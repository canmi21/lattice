//! Collecting favicons as a task, below both shells.
//!
//! The first operation to run on the task substrate, and it was chosen for what it costs to get
//! wrong: no model is asked, nothing is overwritten that cannot be fetched again, and a domain
//! that fails leaves the others alone. See spec/tasks.md.
//!
//! The shape every later migration copies:
//!
//! - publish a registry entry, so a second CMS can see this run before starting its own
//! - claim each item, and **skip** what somebody else already holds rather than waiting
//! - fetch outside any lock, because that is the slow part
//! - hand the write to the record's writer, which is the only thing that touches the record

use std::collections::BTreeSet;
use std::path::Path;

use crate::image::manifest::Merged;
use crate::image::run::MERGED;
use crate::image::store;
use crate::refs::Wanted;
use crate::resource::{self, ResourceId};
use crate::task::{Record, claim, progress, registry, writer};

#[derive(Debug, Default, PartialEq, Eq)]
pub struct Outcome {
	pub collected: usize,
	/// Already present, and this was not a forced run.
	pub skipped: usize,
	/// Domain and why, one line each. A dead site must not end the run.
	pub failed: Vec<(String, String)>,
	/// Items another live process was already collecting.
	pub claimed_elsewhere: Vec<String>,
	/// Domains that gained a resource id, with the id they were granted.
	///
	/// **Separate from `collected`, because fetching and recording are separate questions.** A
	/// domain whose icons were already on disk is skipped by the fetch and still recorded here,
	/// which is how a corpus collected before rids existed gains them without being re-fetched
	/// from a site that may have redrawn its mark since.
	pub granted: Vec<(String, ResourceId)>,
	/// Domains whose record was rewritten because their files had changed under it.
	pub rerecorded: usize,
}

pub struct Options<'a> {
	pub repository: &'a Path,
	pub wanted: &'a [Wanted],
	pub force: bool,
	pub shell: registry::Shell,
	/// Where to report progress. The CLI passes a terminal bar; the desktop passes its own.
	pub sink: Box<dyn progress::Sink>,
}

pub fn from_articles(
	repository: &Path,
	force: bool,
	shell: registry::Shell,
	sink: Box<dyn progress::Sink>,
) -> std::io::Result<Outcome> {
	let wanted = crate::refs::scan(&repository.join("contents"))?.wanted();
	run(Options { repository, wanted: &wanted, force, shell, sink })
}

/// Collect every icon in `wanted` that this process can claim.
pub fn run(options: Options<'_>) -> std::io::Result<Outcome> {
	let Options { repository, wanted, force, shell, sink } = options;
	// Icons are fetched from other people's sites, into a source tree rather than a published
	// one. What publishes them is the record below: an icon is a resource now, so the bytes are
	// hashed into the objects tree here and the root names nothing. See
	// spec/architecture/resource.md, "The catalogue".
	let icon_root = crate::paths::favicon_root(repository);

	let progress = crate::task::start(repository, "favicon", shell, wanted.len() as u64, sink)?;
	let writer = writer::Writer::start(repository, Record::PublicFavicon)?;

	// The register every allocation is checked against, read once. Held in memory across the run
	// and written at the end, for the reason `cms migrate` writes it first: two domains granted
	// the same id is the one damage this command must not do, and the register is this file.
	let mut merged = crate::image::run::load(&repository.join(MERGED))?;

	let mut outcome = Outcome::default();
	for icon in wanted {
		let domain = icon.domain.clone();
		progress.set_message(domain.clone());

		// Taken for the length of this domain only. Holding one claim for the whole run would
		// make two processes with overlapping lists do nothing in parallel.
		let claim = match claim::take(repository, "favicon", &domain) {
			Ok(claim) => claim,
			Err(claim::Denied::Taken(_)) => {
				outcome.claimed_elsewhere.push(domain);
				progress.inc(1);
				continue;
			}
			Err(claim::Denied::Io(error)) => return Err(error),
		};

		// Re-read now that the claim is held. Another run may have collected this domain between
		// the list being built and this item being reached -- claims stop two runs doing an item
		// at the same time, not one run doing what another already finished. Measured with two
		// concurrent processes over five domains: one was fetched twice without this. A forced
		// run has nothing to re-read, since `--force` means redo it. See spec/tasks.md.
		let collected = !force && icon_root.join(&domain).is_dir();
		if collected {
			outcome.skipped += 1;
		} else {
			// Outside the writer, deliberately: this is seconds of somebody else's server, and the
			// record must not be held across it.
			let fetched = match &icon.source {
				Some(url) => {
					crate::favicon::fetch_named(&icon_root, &domain, url, icon.tone.as_deref(), force)
				}
				None => crate::favicon::fetch_for(&icon_root, &domain, force),
			};
			match fetched {
				Ok(Some(icons)) => {
					let root_for_write = icon_root.clone();
					let domain_for_write = domain.clone();
					let applied = writer.apply(move || {
						crate::favicon::write_fetched(&root_for_write, &domain_for_write, &icons)
							.map(|_| ())
							.map_err(std::io::Error::other)
					});
					match applied {
						Ok(()) => outcome.collected += 1,
						Err(error) => {
							outcome.failed.push((domain, error.to_string()));
							progress.inc(1);
							continue;
						}
					}
				}
				// Nothing fetched and nothing wrong: another run finished this domain between the
				// directory check above and here.
				Ok(None) => outcome.skipped += 1,
				Err(error) => {
					outcome.failed.push((domain, error.to_string()));
					progress.inc(1);
					continue;
				}
			}
		}

		// **Recorded whether or not anything was fetched.** A domain whose icons are already on
		// disk is skipped by the fetch and still belongs in the manifest, which is the whole of
		// what a corpus collected before rids existed needs -- no site is asked again for a mark
		// it may have redrawn since.
		if let Err(error) = record(repository, &icon_root, &domain, &mut merged, &mut outcome) {
			outcome.failed.push((domain, error));
		}

		// Released here rather than at the end of the loop body's scope, to say that the claim
		// covers fetching, writing and recording this domain and nothing after.
		drop(claim);
		progress.inc(1);
	}

	if !outcome.granted.is_empty() || outcome.rerecorded > 0 {
		let json = serde_json::to_string_pretty(&merged).map_err(std::io::Error::other)?;
		store::write(&repository.join(MERGED), format!("{json}\n").as_bytes())?;
	}

	progress.finish_and_clear();
	Ok(outcome)
}

/// Make this domain's collected files the resource they are, if they are not already.
///
/// An id is granted only where there is none, and the record is rewritten only where it has
/// actually changed: a rerun over an unchanged corpus writes nothing, which is what makes this
/// safe to run on every collection. The id is allocated against the whole manifest, because the
/// register is one and a second icon drawing from a shorter list would eventually collide.
fn record(
	repository: &Path,
	icon_root: &Path,
	domain: &str,
	merged: &mut Merged,
	outcome: &mut Outcome,
) -> Result<(), String> {
	let previous = merged.by_icon_domain(domain).map(|(_, media)| media.clone());
	let register: BTreeSet<ResourceId> = merged.media.values().map(|media| media.resource).collect();
	let granted = previous.as_ref().map_or_else(|| resource::allocate(&register), |m| m.resource);

	let prepared = super::record::prepare(icon_root, domain, previous.as_ref(), granted)
		.map_err(|error| error.to_string())?;
	let Some(prepared) = prepared else { return Ok(()) };
	// `updated` moves on every pass, so comparing whole records would rewrite the manifest every
	// run. What decides is the layers: the files, the domain and the box they add up to.
	if previous.as_ref().is_some_and(|held| held.layers == prepared.media.layers) {
		return Ok(());
	}

	super::record::publish(repository, &prepared, merged).map_err(|error| error.to_string())?;
	match previous {
		Some(_) => outcome.rerecorded += 1,
		None => outcome.granted.push((domain.to_owned(), prepared.media.resource)),
	}
	Ok(())
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

	fn wanted(domain: &str) -> Wanted {
		Wanted { domain: domain.to_owned(), source: None, tone: None }
	}

	/// A domain already collected is skipped without reaching the network, which is what makes a
	/// rerun cheap. Creating the directory is how this repository records "asked already".
	#[test]
	fn an_already_collected_domain_is_skipped() {
		let temporary = temp();
		let root = temporary.path();
		std::fs::create_dir_all(crate::paths::favicon_root(root).join("example.com")).expect("dir");
		let outcome = run(Options {
			repository: &root,
			wanted: &[wanted("example.com")],
			force: false,
			shell: registry::Shell::Cli,
			sink: Box::new(progress::Silent),
		})
		.expect("run");
		assert_eq!(outcome.skipped, 1);
		assert_eq!(outcome.collected, 0);
		assert!(outcome.failed.is_empty());
		std::fs::remove_dir_all(root).ok();
	}

	/// The contention case, without a second process: a claim held by this test stands in for one
	/// held by another CMS. The item is reported as somebody else's and the run continues.
	#[test]
	fn an_item_claimed_elsewhere_is_left_alone() {
		let temporary = temp();
		let root = temporary.path();
		std::fs::create_dir_all(crate::paths::favicon_root(root).join("free.example")).expect("dir");
		let held = claim::take(&root, "favicon", "taken.example").expect("claim");

		let outcome = run(Options {
			repository: &root,
			wanted: &[wanted("taken.example"), wanted("free.example")],
			force: false,
			shell: registry::Shell::Cli,
			sink: Box::new(progress::Silent),
		})
		.expect("run");

		assert_eq!(outcome.claimed_elsewhere, vec!["taken.example".to_owned()]);
		// The rest of the list still ran.
		assert_eq!(outcome.skipped, 1);
		drop(held);
		std::fs::remove_dir_all(root).ok();
	}

	/// The run is visible to another reader while it happens, and gone afterwards.
	#[test]
	fn the_run_publishes_itself_and_cleans_up() {
		let temporary = temp();
		let root = temporary.path();
		std::fs::create_dir_all(crate::paths::favicon_root(root).join("example.com")).expect("dir");
		assert!(registry::running(&root, "favicon").expect("before").is_none());
		run(Options {
			repository: &root,
			wanted: &[wanted("example.com")],
			force: false,
			shell: registry::Shell::Desktop,
			sink: Box::new(progress::Silent),
		})
		.expect("run");
		assert!(registry::running(&root, "favicon").expect("after").is_none());
		std::fs::remove_dir_all(root).ok();
	}

	/// The gap two concurrent processes exposed: an item finished by somebody else after the list
	/// was built must be dropped once the claim is held, or the work is simply done twice. The
	/// directory appearing mid-run stands in for the other process having collected it.
	#[test]
	fn an_item_finished_by_someone_else_is_dropped_after_claiming() {
		let temporary = temp();
		let root = temporary.path();
		let collected = crate::paths::favicon_root(root).join("late.example");
		std::fs::create_dir_all(&collected).expect("dir");

		let outcome = run(Options {
			repository: &root,
			wanted: &[wanted("late.example")],
			force: false,
			shell: registry::Shell::Cli,
			sink: Box::new(progress::Silent),
		})
		.expect("run");

		// Never reached the network: no failure, and nothing collected.
		assert_eq!(outcome.skipped, 1);
		assert_eq!(outcome.collected, 0);
		assert!(outcome.failed.is_empty());
		std::fs::remove_dir_all(root).ok();
	}

	/// A claim taken for one domain is released before the run ends, so a second run can take it.
	#[test]
	fn claims_do_not_outlive_the_item() {
		let temporary = temp();
		let root = temporary.path();
		std::fs::create_dir_all(crate::paths::favicon_root(root).join("example.com")).expect("dir");
		run(Options {
			repository: &root,
			wanted: &[wanted("example.com")],
			force: false,
			shell: registry::Shell::Cli,
			sink: Box::new(progress::Silent),
		})
		.expect("run");
		assert!(claim::live(&root).expect("live").is_empty());
		std::fs::remove_dir_all(root).ok();
	}
}
