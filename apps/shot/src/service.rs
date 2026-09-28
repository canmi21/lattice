//! The service's state and the work it does in the background: renderers taking captures off the
//! queue two at a time, and a sweep that forgets what has been kept long enough.

use crate::queue::{Queue, View};
use crate::render::Render;
use crate::store::{Format, Store};
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::{Duration, Instant};
use tokio::sync::Notify;

/// How many captures render at once: a browser page each, on a machine with other work to do.
pub const CONCURRENCY: usize = 2;
/// The longest one capture may take before it is called failed.
pub const DEADLINE: Duration = Duration::from_secs(30);
/// How often settled captures are looked over.
const SWEEP: Duration = Duration::from_secs(30);

pub struct Shot<R> {
	queue: Mutex<Queue>,
	pub store: Store,
	/// Rung when a capture is queued, for a renderer waiting on nothing.
	queued: Notify,
	renderer: R,
}

impl<R: Render> Shot<R> {
	pub fn new(store: Store, renderer: R) -> Arc<Self> {
		Arc::new(Self {
			queue: Mutex::new(Queue::new(CONCURRENCY)),
			store,
			queued: Notify::new(),
			renderer,
		})
	}

	/// The queue; a panic while it was held leaves nothing half-changed worth refusing over.
	pub fn queue(&self) -> MutexGuard<'_, Queue> {
		self.queue.lock().unwrap_or_else(std::sync::PoisonError::into_inner)
	}

	pub fn wake(&self) {
		self.queued.notify_one();
	}

	pub fn view(&self, id: uuid::Uuid) -> Option<View> {
		self.queue().view(id)
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
				shot.sweep(Instant::now()).await;
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

	pub async fn render_one(&self, id: uuid::Uuid, asked: &crate::asked::Asked) {
		let started = Instant::now();
		let outcome = match tokio::time::timeout(DEADLINE, self.renderer.capture(asked)).await {
			Err(_) => Err(format!("The page took longer than {} seconds", DEADLINE.as_secs())),
			Ok(Err(reason)) => Err(reason),
			Ok(Ok(capture)) => self.keep(id, capture).await,
		};
		self.queue().finish(id, outcome, started.elapsed(), Instant::now());
		// Another renderer may be waiting on a capture queued while this one was busy.
		self.wake();
	}

	async fn keep(&self, id: uuid::Uuid, capture: crate::render::Capture) -> Result<bool, String> {
		let stored = |error: std::io::Error| {
			eprintln!("shot: keeping {id}: {error}");
			"The capture could not be kept".to_owned()
		};
		self.store.write(id, Format::Png, &capture.png).await.map_err(stored)?;
		match capture.webp {
			Some(webp) => self.store.write(id, Format::Webp, &webp).await.map(|()| true).map_err(stored),
			None => Ok(false),
		}
	}

	pub async fn sweep(&self, now: Instant) {
		let expired = self.queue().sweep(now);
		for id in expired {
			self.store.remove(id).await;
		}
	}
}
