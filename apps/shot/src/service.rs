//! The service's state and the work it does in the background: renderers taking captures off the
//! queue two at a time, a sweep that forgets from memory what the disk answers for, and each change
//! of state told to the ledger.

use crate::asked::Asked;
use crate::queue::{Details, Full, Lane, Made, Queue, View};
use crate::render::{Capture, Events, Render};
use crate::store::{Format, Store};
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::{Duration, Instant};
use tokio::sync::Notify;
use uuid::Uuid;

/// How many captures render at once: a browser page each, on a machine with other work to do.
pub const CONCURRENCY: usize = 2;
/// What a capture may take past its own timeout and delay, for the browser and the pictures, before
/// it is called failed.
pub const MARGIN: Duration = Duration::from_secs(10);
/// How often settled captures are looked over.
const SWEEP: Duration = Duration::from_secs(30);

pub struct Shot<R> {
	queue: Mutex<Queue>,
	pub store: Store,
	/// Rung when a capture is queued, for a renderer waiting on nothing.
	queued: Notify,
	renderer: R,
	/// Where each change of state is told; none in a test. See spec/architecture/ledger.md.
	ledger: Option<ledger::Ledger>,
}

impl<R: Render> Shot<R> {
	pub fn new(store: Store, renderer: R, ledger: Option<ledger::Ledger>) -> Arc<Self> {
		Arc::new(Self {
			queue: Mutex::new(Queue::new(CONCURRENCY)),
			store,
			queued: Notify::new(),
			renderer,
			ledger,
		})
	}

	/// The queue; a panic while it was held leaves nothing half-changed worth refusing over.
	pub fn queue(&self) -> MutexGuard<'_, Queue> {
		self.queue.lock().unwrap_or_else(std::sync::PoisonError::into_inner)
	}

	pub fn wake(&self) {
		self.queued.notify_one();
	}

	/// Take an ask, telling the ledger of what it queued and waking a renderer for it.
	pub fn ask(&self, asked: Asked, lane: Lane) -> Result<Uuid, Full> {
		let entered = self.queue().enter(asked, lane)?;
		if entered.queued {
			self.tell(entered.id);
			if let Some(events) = self.events(entered.id) {
				let retry_after = match self.queue().view(entered.id) {
					Some(View::Waiting { retry_after, .. }) => retry_after,
					_ => 0,
				};
				let lane_name = match lane {
					Lane::Ours => "ours",
					Lane::Public => "public",
				};
				events.event(
					"queued",
					ledger::Level::Info,
					format!("queued in the {lane_name} lane"),
					serde_json::json!({ "lane": lane_name, "retry_after": retry_after }),
				);
			}
			self.wake();
		}
		Ok(entered.id)
	}

	pub fn view(&self, id: Uuid) -> Option<View> {
		self.queue().view(id)
	}

	/// How a capture stands, with its story, read at one moment.
	pub fn about(&self, id: Uuid) -> Option<(View, Details)> {
		let queue = self.queue();
		Some((queue.view(id)?, queue.details(id)?))
	}

	/// Start the renderers and the sweep.
	pub fn start(self: &Arc<Self>) {
		for _ in 0..CONCURRENCY {
			let shot = self.clone();
			tokio::spawn(async move { shot.render_forever().await });
		}
		let shot = self.clone();
		tokio::spawn(async move {
			let mut every = tokio::time::interval(SWEEP);
			loop {
				every.tick().await;
				shot.queue().sweep(Instant::now());
			}
		});
	}

	async fn render_forever(&self) {
		loop {
			let next = self.queue().take();
			match next {
				Some((id, asked)) => self.render_one(id, &asked).await,
				None => self.queued.notified().await,
			}
		}
	}

	pub async fn render_one(&self, id: Uuid, asked: &Asked) {
		self.tell(id);
		let events = self.events(id);
		if let Some(events) = &events {
			events.event(
				"started",
				ledger::Level::Info,
				"capture started".to_owned(),
				serde_json::Value::Null,
			);
		}
		let sink: &dyn Events = match &events {
			Some(events) => events,
			None => &(),
		};
		let started = Instant::now();
		let deadline = Duration::from_millis(u64::from(asked.timeout + asked.delay)) + MARGIN;
		let outcome = match tokio::time::timeout(deadline, self.renderer.capture(asked, sink)).await {
			Err(_) => Err(format!("The capture took longer than {} seconds", deadline.as_secs())),
			Ok(outcome) => outcome,
		};
		let finished_at = jiff::Timestamp::now();
		let outcome = self.keep(id, outcome, finished_at).await;
		if let Err(reason) = &outcome
			&& let Some(events) = &events
		{
			events.event("failed", ledger::Level::Error, reason.clone(), serde_json::Value::Null);
		}
		self.queue().finish(id, outcome, started.elapsed(), finished_at);
		self.tell(id);
		// Another renderer may be waiting on a capture queued while this one was busy.
		self.wake();
	}

	/// Write a settled capture to the store -- its pictures and its record, or a failure's record
	/// alone -- before the queue says it is settled, so the disk answers as soon as memory forgets.
	async fn keep(
		&self,
		id: Uuid,
		outcome: Result<Capture, String>,
		finished_at: jiff::Timestamp,
	) -> Result<Made, String> {
		let Some(details) = self.queue().details(id) else {
			// A capture rendering is never forgotten; said all the same rather than assumed.
			return Err("The capture was forgotten while it was taken".to_owned());
		};
		let details = Details { finished_at: Some(finished_at), ..details };
		let capture = match outcome {
			Ok(capture) => capture,
			Err(reason) => {
				self.keep_failure(id, &reason, &details).await;
				return Err(reason);
			}
		};
		let pictures = crate::queue::Pictures {
			width: capture.width,
			height: capture.height,
			png_bytes: capture.png.len() as u64,
			webp_bytes: capture.webp.as_ref().map(|webp| webp.len() as u64),
		};
		let made = Made { pictures, observed: capture.observed.clone() };
		let record = serde_json::to_vec(&crate::record::done(id, &made, &details)).unwrap_or_default();
		match self.write(id, &capture, &record).await {
			Ok(rolled_out) => {
				if let Some(events) = self.events(id) {
					events.event(
						"stored",
						ledger::Level::Info,
						"capture stored".to_owned(),
						serde_json::json!({
							"png_bytes": made.pictures.png_bytes,
							"webp_bytes": made.pictures.webp_bytes,
							"rolled_out": rolled_out.iter().map(Uuid::to_string).collect::<Vec<_>>(),
						}),
					);
				}
				Ok(made)
			}
			Err(error) => {
				eprintln!("shot: keeping {id}: {error}");
				self.store.remove(id).await;
				let reason = "The capture could not be kept";
				self.keep_failure(id, reason, &details).await;
				Err(reason.to_owned())
			}
		}
	}

	async fn write(&self, id: Uuid, capture: &Capture, record: &[u8]) -> std::io::Result<Vec<Uuid>> {
		let bytes = capture.png.len() + capture.webp.as_ref().map_or(0, Vec::len) + record.len();
		let rolled_out = self.make_room(id, bytes).await;
		self.store.write(id, Format::Png, &capture.png).await?;
		if let Some(webp) = &capture.webp {
			self.store.write(id, Format::Webp, webp).await?;
		}
		self.store.write_record(id, record).await?;
		Ok(rolled_out)
	}

	async fn keep_failure(&self, id: Uuid, reason: &str, details: &Details) {
		let record =
			serde_json::to_vec(&crate::record::failed(id, reason, details)).unwrap_or_default();
		self.make_room(id, record.len()).await;
		if let Err(error) = self.store.write_record(id, &record).await {
			eprintln!("shot: keeping {id}'s failure: {error}");
		}
	}

	/// Roll the oldest out of the store for a capture about to be written, and out of memory too, so
	/// neither answers for what the other no longer has; each one rolled out gets an event on its own
	/// task, since its story ends there rather than on this capture's.
	async fn make_room(&self, id: Uuid, bytes: usize) -> Vec<Uuid> {
		let out = self.store.admit(id, bytes as u64).await;
		self.queue().forget(&out);
		if let Some(ledger) = &self.ledger {
			for old in &out {
				ledger.task("shot", old.to_string()).event(
					"rolled_out",
					ledger::Level::Info,
					"rolled out of the store".to_owned(),
					serde_json::Value::Null,
				);
			}
		}
		out
	}

	/// A handle for this task's events, when the ledger is reached at all.
	fn events(&self, id: Uuid) -> Option<ledger::TaskEvents> {
		self.ledger.as_ref().map(|ledger| ledger.task("shot", id.to_string()))
	}

	/// A capture as the ledger keeps it, as it stands now.
	pub fn record(&self, id: Uuid) -> Option<ledger::Record> {
		let (view, details) = self.about(id)?;
		let (state, detail) = match view {
			View::Waiting { rendering: false, .. } => (ledger::State::Queued, None),
			View::Waiting { rendering: true, .. } => (ledger::State::Running, None),
			View::Done { .. } => (ledger::State::Done, None),
			View::Failed { reason } => (ledger::State::Failed, Some(reason)),
		};
		let caller = match details.lane {
			Lane::Public => ledger::Caller::Public,
			Lane::Ours => ledger::Caller::Ours,
		};
		let asked = &details.asked;
		Some(ledger::Record {
			service: "shot".into(),
			id: id.to_string(),
			kind: "capture".into(),
			state,
			caller,
			asked_at: details.asked_at,
			started_at: details.started_at,
			finished_at: details.finished_at,
			summary: serde_json::json!({
				"url": asked.url.as_str(),
				"width": asked.width,
				"height": asked.height,
				"full": asked.full,
			}),
			detail,
		})
	}

	/// Tell the ledger how a capture stands; it returns at once, whether the ledger is up or not.
	fn tell(&self, id: Uuid) {
		if let Some(ledger) = &self.ledger
			&& let Some(record) = self.record(id)
		{
			ledger.record(record);
		}
	}
}

#[cfg(test)]
mod tests {
	use super::*;
	use url::Url;

	struct Refuses;

	impl Render for Refuses {
		async fn capture(&self, _: &Asked, _: &dyn Events) -> Result<Capture, String> {
			Err("net::ERR_CONNECTION_REFUSED".into())
		}
	}

	#[tokio::test]
	async fn each_state_reads_as_a_ledger_record() {
		let root = tempfile::tempdir().unwrap();
		let store = Store::open(root.path(), crate::store::CAPACITY).unwrap();
		// A ledger nobody answers at: records are handed over and nothing waits on them.
		let dead = ledger::Ledger::to("http://localhost:9".into());
		let shot = Shot::new(store, Refuses, Some(dead));
		let asked = Asked {
			url: Url::parse("https://example.test/").unwrap(),
			width: 1280,
			height: 800,
			full: true,
			internal: false,
			insecure: false,
			javascript: true,
			timeout: 15_000,
			delay: 210,
		};
		let id = shot.ask(asked, Lane::Public).unwrap();
		let queued = shot.record(id).unwrap();
		assert_eq!((queued.state, queued.caller), (ledger::State::Queued, ledger::Caller::Public));
		assert_eq!((queued.service.as_str(), queued.kind.as_str()), ("shot", "capture"));
		assert_eq!(queued.id, id.to_string());
		assert_eq!(
			queued.summary,
			serde_json::json!({ "url": "https://example.test/", "width": 1280, "height": 800, "full": true })
		);
		let (_, asked) = shot.queue().take().unwrap();
		assert_eq!(shot.record(id).unwrap().state, ledger::State::Running);
		shot.render_one(id, &asked).await;
		let failed = shot.record(id).unwrap();
		assert_eq!(failed.state, ledger::State::Failed);
		assert_eq!(failed.detail.as_deref(), Some("net::ERR_CONNECTION_REFUSED"));
		assert!(failed.started_at.is_some() && failed.finished_at >= failed.started_at);
	}
}
