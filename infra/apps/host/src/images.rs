//! The machine's images, kept track of in the background: scanned once a minute, each one nothing
//! could run again flagged and removed an hour after, and what the panel asks -- remove one now,
//! collect them all -- queued and done here, so no request waits on Docker. See
//! spec/architecture/host.md, "An image is kept while something could run it".

use crate::Host;
use crate::store::Deployed;
use deploy::engine::Image;
use jiff::{SignedDuration, Timestamp};
use serde::Serialize;
use std::collections::{HashSet, VecDeque};
use std::sync::{Arc, Mutex, RwLock};
use std::time::Duration;

/// The repository keeper loads host's images under; they are keeper's to collect, never host's.
const KEEPERS: &str = "host/host:";

/// How often the images are looked at again when nothing asks sooner.
const SCANNING: Duration = Duration::from_secs(60);

/// How long an image nothing needs is kept after it was flagged, for a rollback somebody had not
/// asked for yet.
pub const GRACE: SignedDuration = SignedDuration::from_hours(1);

/// How many finished tasks the panel is shown.
const FINISHED: usize = 20;

/// Why an image stays, or that nothing needs it.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(tag = "kept", rename_all = "lowercase")]
pub enum Kept {
	/// What an app runs now.
	Current { app: String },
	/// What an app goes back to on a rollback.
	Previous { app: String },
	/// A container is made from it, whoever started that container.
	Used,
	/// host's own, which keeper keeps and collects.
	Keeper,
	/// Nothing could run it again: collectable.
	No,
}

#[derive(Debug, Clone, Serialize)]
pub struct Listed {
	#[serde(flatten)]
	pub image: Image,
	#[serde(flatten)]
	pub kept: Kept,
	/// When it was found collectable, and so when it goes.
	#[serde(skip_serializing_if = "Option::is_none")]
	pub flagged_at: Option<Timestamp>,
	#[serde(skip_serializing_if = "Option::is_none")]
	pub removed_at: Option<Timestamp>,
}

/// The images as the last scan found them.
#[derive(Debug, Clone, Serialize)]
pub struct Scan {
	pub at: Timestamp,
	pub images: Vec<Listed>,
	/// Bytes on disk, layers shared between images counted once.
	pub size: Option<u64>,
}

/// What the panel asked for.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum Kind {
	/// One image, now rather than when its hour is up.
	Remove { image: String },
	/// Every image nothing could run again, now.
	Collect,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum State {
	Queued,
	Running,
	Done,
	Failed,
}

#[derive(Debug, Clone, Serialize)]
pub struct Task {
	pub id: u64,
	#[serde(flatten)]
	pub kind: Kind,
	pub state: State,
	pub asked_at: Timestamp,
	#[serde(skip_serializing_if = "Option::is_none")]
	pub finished_at: Option<Timestamp>,
	#[serde(skip_serializing_if = "Option::is_none")]
	pub detail: Option<String>,
}

#[derive(Default)]
struct Tasks {
	next: u64,
	list: VecDeque<Task>,
}

/// What the panel reads: the last scan and the tasks, both answered from memory.
#[derive(Default)]
pub struct Images {
	scan: RwLock<Option<Scan>>,
	tasks: Mutex<Tasks>,
	wake: tokio::sync::Notify,
}

fn finished(task: &Task) -> bool {
	matches!(task.state, State::Done | State::Failed)
}

fn locked<T>(mutex: &Mutex<T>) -> std::sync::MutexGuard<'_, T> {
	mutex.lock().unwrap_or_else(std::sync::PoisonError::into_inner)
}

impl Images {
	pub fn scan(&self) -> Option<Scan> {
		self.scan.read().unwrap_or_else(std::sync::PoisonError::into_inner).clone()
	}

	/// The tasks still to do and the latest done, oldest first.
	pub fn tasks(&self) -> Vec<Task> {
		locked(&self.tasks).list.iter().cloned().collect()
	}

	/// Queue what the panel asked for, and wake the worker to it.
	pub fn ask(&self, kind: Kind) -> Task {
		let mut tasks = locked(&self.tasks);
		tasks.next += 1;
		let task = Task {
			id: tasks.next,
			kind,
			state: State::Queued,
			asked_at: Timestamp::now(),
			finished_at: None,
			detail: None,
		};
		tasks.list.push_back(task.clone());
		drop(tasks);
		self.wake.notify_one();
		task
	}

	/// Look again now rather than on the next beat.
	pub fn rescan(&self) {
		self.wake.notify_one();
	}

	fn next(&self) -> Option<Task> {
		let mut tasks = locked(&self.tasks);
		let task = tasks.list.iter_mut().find(|task| task.state == State::Queued)?;
		task.state = State::Running;
		Some(task.clone())
	}

	fn finish(&self, id: u64, outcome: Result<String, String>) {
		let mut tasks = locked(&self.tasks);
		if let Some(task) = tasks.list.iter_mut().find(|task| task.id == id) {
			task.finished_at = Some(Timestamp::now());
			(task.state, task.detail) = match outcome {
				Ok(detail) => (State::Done, Some(detail)),
				Err(detail) => (State::Failed, Some(detail)),
			};
		}
		// The oldest finished go first, once more than the panel is shown have finished.
		while tasks.list.iter().filter(|task| finished(task)).count() > FINISHED {
			let Some(oldest) = tasks.list.iter().position(finished) else { break };
			tasks.list.remove(oldest);
		}
	}

	fn publish(&self, scan: Scan) {
		*self.scan.write().unwrap_or_else(std::sync::PoisonError::into_inner) = Some(scan);
	}
}

pub fn kept(image: &Image, used: &HashSet<String>, apps: &[Deployed]) -> Kept {
	if let Some(app) = apps.iter().find(|app| app.image == image.id) {
		return Kept::Current { app: app.manifest.name.clone() };
	}
	let previous = apps.iter().find(|app| app.previous.as_ref().is_some_and(|p| p.image == image.id));
	if let Some(app) = previous {
		return Kept::Previous { app: app.manifest.name.clone() };
	}
	if used.contains(&image.id) {
		return Kept::Used;
	}
	if image.tags.iter().any(|tag| tag.starts_with(KEEPERS)) {
		return Kept::Keeper;
	}
	Kept::No
}

/// Every image, newest first, with why it stays.
async fn classified(host: &Host) -> anyhow::Result<Vec<(Image, Kept)>> {
	let apps = host.store.apps()?;
	let used = host.engine.images_in_use().await?;
	let mut images = host.engine.images().await?;
	images.sort_by(|a, b| b.created.cmp(&a.created));
	Ok(
		images
			.into_iter()
			.map(|image| {
				let kept = kept(&image, &used, &apps);
				(image, kept)
			})
			.collect(),
	)
}

/// The work the background does for one task. Under the deploy lock, so an image a deploy has
/// loaded and not yet run is never taken for one nothing needs.
async fn perform(host: &Host, kind: &Kind) -> Result<String, String> {
	let _one = host.deploying.lock().await;
	let images = classified(host).await.map_err(|error| error.to_string())?;
	match kind {
		Kind::Remove { image } => {
			let (_, kept) = images
				.iter()
				.find(|(listed, _)| &listed.id == image)
				.ok_or_else(|| "no image has this id".to_owned())?;
			if *kept != Kept::No {
				return Err(format!("still kept: {}", serde_json::to_string(kept).unwrap_or_default()));
			}
			host.engine.remove_image(image).await.map_err(|error| error.to_string())?;
			let _ = host.store.unflag(image);
			Ok("removed".into())
		}
		Kind::Collect => {
			let mut removed = 0;
			for (image, _) in images.iter().filter(|(_, kept)| *kept == Kept::No) {
				match host.engine.remove_image(&image.id).await {
					Ok(()) => {
						removed += 1;
						let _ = host.store.unflag(&image.id);
					}
					Err(error) => eprintln!("host: collecting {}: {error}", image.id),
				}
			}
			Ok(format!("removed {removed}"))
		}
	}
}

/// Flag what nothing needs, unflag what is needed again, remove what has been flagged an hour, and
/// publish what is left.
async fn sweep(host: &Host) -> anyhow::Result<()> {
	let now = Timestamp::now();
	let images = {
		let _one = host.deploying.lock().await;
		let mut flagged = host.store.flagged()?;
		let mut images = classified(host).await?;
		let present: HashSet<&str> = images.iter().map(|(image, _)| image.id.as_str()).collect();
		for gone in flagged.keys().filter(|id| !present.contains(id.as_str())) {
			host.store.unflag(gone)?;
		}
		let mut removed = false;
		for (image, kept) in &images {
			match (kept, flagged.get(&image.id)) {
				(Kept::No, None) => {
					host.store.flag(&image.id, now)?;
					flagged.insert(image.id.clone(), now);
				}
				(Kept::No, Some(since)) if now.duration_since(*since) >= GRACE => {
					match host.engine.remove_image(&image.id).await {
						Ok(()) => {
							host.store.unflag(&image.id)?;
							removed = true;
						}
						Err(error) => eprintln!("host: removing {} after its hour: {error}", image.id),
					}
				}
				(Kept::No, Some(_)) => {}
				(_, Some(_)) => {
					host.store.unflag(&image.id)?;
					flagged.remove(&image.id);
				}
				(_, None) => {}
			}
		}
		if removed {
			images = classified(host).await?;
		}
		images
			.into_iter()
			.map(|(image, kept)| {
				let flagged_at = (kept == Kept::No).then(|| flagged.get(&image.id).copied()).flatten();
				let removed_at = flagged_at.and_then(|at| at.checked_add(GRACE).ok());
				Listed { image, kept, flagged_at, removed_at }
			})
			.collect()
	};
	// Docker's measure of its images is the slow part, and needs no lock.
	let size = host.engine.images_size().await.ok().flatten();
	host.images.publish(Scan { at: now, images, size });
	Ok(())
}

/// The one loop: every task queued, then a sweep; then wait for the next beat or the next ask.
pub async fn run(host: Arc<Host>) {
	loop {
		while let Some(task) = host.images.next() {
			let outcome = perform(&host, &task.kind).await;
			host.images.finish(task.id, outcome);
		}
		if let Err(error) = sweep(&host).await {
			eprintln!("host: looking at the images: {error}");
		}
		tokio::select! {
			() = tokio::time::sleep(SCANNING) => {}
			() = host.images.wake.notified() => {}
		}
	}
}

#[cfg(test)]
mod tests {
	use super::*;
	use deploy::{Manifest, Version};

	fn image(id: &str, tags: &[&str]) -> Image {
		Image {
			id: id.into(),
			tags: tags.iter().map(|tag| (*tag).into()).collect(),
			size: 1,
			created: 0,
		}
	}

	#[test]
	fn keeps_what_runs_what_a_rollback_needs_and_keepers_own() {
		let manifest = Manifest::parse(include_str!("../../../../apps/geo/service.toml")).unwrap();
		let geo = Deployed {
			manifest: manifest.clone(),
			image: "sha256:now".into(),
			previous: Some(Version { manifest, image: "sha256:before".into() }),
			deployed_at: String::new(),
			held: false,
		};
		let used = HashSet::from(["sha256:gemini".to_owned()]);
		let apps = [geo];
		let geo = || "geo".to_owned();
		assert_eq!(kept(&image("sha256:now", &[]), &used, &apps), Kept::Current { app: geo() });
		assert_eq!(kept(&image("sha256:before", &[]), &used, &apps), Kept::Previous { app: geo() });
		assert_eq!(kept(&image("sha256:gemini", &[]), &used, &apps), Kept::Used);
		assert_eq!(kept(&image("sha256:h", &["host/host:7b124ca8a7b7"]), &used, &apps), Kept::Keeper);
		for collectable in [image("sha256:old", &["host/geo:0f939c217676"]), image("sha256:d", &[])] {
			assert_eq!(kept(&collectable, &used, &apps), Kept::No);
		}
	}

	#[test]
	fn queues_tasks_in_order_and_keeps_only_the_latest_finished() {
		let images = Images::default();
		let first = images.ask(Kind::Collect);
		let second = images.ask(Kind::Remove { image: "sha256:a".into() });
		assert_eq!(images.next().map(|task| task.id), Some(first.id));
		assert_eq!(images.tasks()[0].state, State::Running);
		images.finish(first.id, Ok("removed 2".into()));
		assert_eq!(images.next().map(|task| task.id), Some(second.id));
		images.finish(second.id, Err("still kept".into()));
		assert!(images.next().is_none());
		for _ in 0..FINISHED + 5 {
			let task = images.ask(Kind::Collect);
			images.next();
			images.finish(task.id, Ok(String::new()));
		}
		assert_eq!(images.tasks().len(), FINISHED);
	}
}
