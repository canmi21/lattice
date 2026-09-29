//! The captures asked for and where each is: waiting in one of two lanes, rendering, done or
//! failed, remembered for thirty minutes from being asked, after which the disk answers for it.
//! Ours go ahead of the public's, always. Nothing here is a picture; those are on disk. See
//! spec/architecture/shot.md, "Two queues, and ours go first" and "Kept on disk, four gigabytes,
//! oldest first".

use crate::asked::Asked;
use std::collections::{HashMap, VecDeque};
use std::time::{Duration, Instant};
use uuid::Uuid;

/// How long the same ask is the capture already made, from when it was asked.
pub const WINDOW: Duration = Duration::from_secs(30 * 60);

/// Whose a capture is: ours -- the LAN, the tailnet, a Worker -- or the public's.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Lane {
	Ours,
	Public,
}

impl Lane {
	/// How many may wait in it before another is refused.
	pub fn capacity(self) -> usize {
		match self {
			Lane::Ours => 50,
			Lane::Public => 30,
		}
	}

	fn index(self) -> usize {
		match self {
			Lane::Ours => 0,
			Lane::Public => 1,
		}
	}
}

/// What a capture made: its size, and each format's bytes; a WebP may be absent.
#[derive(Debug, Clone, PartialEq, serde::Serialize)]
pub struct Pictures {
	pub width: u32,
	pub height: u32,
	pub png_bytes: u64,
	pub webp_bytes: Option<u64>,
}

/// What a capture that worked leaves: its pictures, and what the page did while it was taken.
#[derive(Debug, Clone, PartialEq)]
pub struct Made {
	pub pictures: Pictures,
	pub observed: serde_json::Value,
}

#[derive(Debug, Clone, PartialEq)]
enum State {
	Queued,
	Rendering,
	Done { made: Made },
	Failed { reason: String },
}

#[derive(Debug)]
struct Job {
	asked: Asked,
	lane: Lane,
	state: State,
	/// When it was asked for, which its window runs from.
	since: Instant,
	/// When it was asked for, taken by a browser, and done with, as a caller is told them.
	asked_at: jiff::Timestamp,
	started_at: Option<jiff::Timestamp>,
	finished_at: Option<jiff::Timestamp>,
	/// Whether this capture was made by a `fresh` ask rather than a plain one. Not part of `Asked`,
	/// since it is not part of what makes two asks one; told alongside the rest of the story.
	fresh: bool,
}

/// A capture's own story, told alongside its state: what was asked, and when each thing happened.
#[derive(Debug, Clone, PartialEq)]
pub struct Details {
	pub asked: Asked,
	pub lane: Lane,
	pub asked_at: jiff::Timestamp,
	pub started_at: Option<jiff::Timestamp>,
	pub finished_at: Option<jiff::Timestamp>,
	pub fresh: bool,
}

/// A capture as a caller is told about it.
#[derive(Debug, Clone, PartialEq)]
pub enum View {
	/// Not done yet: `rendering` once a browser has it, and when to ask again, in seconds.
	Waiting {
		rendering: bool,
		retry_after: u32,
	},
	Done {
		made: Made,
	},
	Failed {
		reason: String,
	},
}

#[derive(Debug, PartialEq)]
pub struct Full;

/// An ask taken: the capture it is, and whether it was queued by this ask, new or tried again.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Entered {
	pub id: Uuid,
	pub queued: bool,
}

#[derive(Debug)]
pub struct Queue {
	jobs: HashMap<Uuid, Job>,
	/// The capture each distinct ask is, while it is remembered.
	by_asked: HashMap<Asked, Uuid>,
	waiting: [VecDeque<Uuid>; 2],
	/// How many render at once.
	concurrency: usize,
	/// Seconds a capture has lately taken, as a moving average.
	average: f64,
}

/// What a capture is guessed to take before any has been timed.
const FIRST_GUESS: f64 = 5.0;

impl Queue {
	pub fn new(concurrency: usize) -> Self {
		Self {
			jobs: HashMap::new(),
			by_asked: HashMap::new(),
			waiting: [VecDeque::new(), VecDeque::new()],
			concurrency: concurrency.max(1),
			average: FIRST_GUESS,
		}
	}

	/// Take an ask: the capture it already is, or a new one in `lane`. A failed one is tried again,
	/// since the page may be back; one of ours asked for what the public is waiting on moves it up.
	pub fn ask(&mut self, asked: Asked, lane: Lane) -> Result<Uuid, Full> {
		self.enter(asked, lane, false).map(|entered| entered.id)
	}

	/// `ask`, saying whether the ask queued anything. `fresh` skips the capture already kept for
	/// `asked` and makes a new one, whose id the next plain ask of the same parameters is answered
	/// with; the one it passed over is untouched, readable by its own id until its window or the
	/// store's takes it. See spec/architecture/shot.md, "`fresh=true` captures anew even so".
	pub fn enter(&mut self, asked: Asked, lane: Lane, fresh: bool) -> Result<Entered, Full> {
		if !fresh && let Some(&id) = self.by_asked.get(&asked) {
			let job = self.jobs.get_mut(&id).expect("an ask names a job it holds");
			match job.state {
				State::Queued if lane == Lane::Ours && job.lane == Lane::Public => {
					self.waiting[Lane::Public.index()].retain(|waiting| *waiting != id);
					job.lane = Lane::Ours;
					self.waiting[Lane::Ours.index()].push_back(id);
				}
				State::Failed { .. } => {
					if self.waiting[lane.index()].len() >= lane.capacity() {
						return Err(Full);
					}
					job.state = State::Queued;
					job.lane = lane;
					job.since = Instant::now();
					job.asked_at = jiff::Timestamp::now();
					job.started_at = None;
					job.finished_at = None;
					self.waiting[lane.index()].push_back(id);
					return Ok(Entered { id, queued: true });
				}
				_ => {}
			}
			return Ok(Entered { id, queued: false });
		}
		if self.waiting[lane.index()].len() >= lane.capacity() {
			return Err(Full);
		}
		let id = Uuid::new_v4();
		self.by_asked.insert(asked.clone(), id);
		let job = Job {
			asked,
			lane,
			state: State::Queued,
			since: Instant::now(),
			asked_at: jiff::Timestamp::now(),
			started_at: None,
			finished_at: None,
			fresh,
		};
		self.jobs.insert(id, job);
		self.waiting[lane.index()].push_back(id);
		Ok(Entered { id, queued: true })
	}

	/// The next capture to render, ours first, marked as rendering.
	pub fn take(&mut self) -> Option<(Uuid, Asked)> {
		let id = self.waiting.iter_mut().find_map(VecDeque::pop_front)?;
		let job = self.jobs.get_mut(&id)?;
		job.state = State::Rendering;
		job.started_at = Some(jiff::Timestamp::now());
		Some((id, job.asked.clone()))
	}

	/// A capture is over: `Ok` with what it made, or why it failed, how long it took, and when.
	pub fn finish(
		&mut self,
		id: Uuid,
		outcome: Result<Made, String>,
		took: Duration,
		finished_at: jiff::Timestamp,
	) {
		self.average = self.average * 0.7 + took.as_secs_f64() * 0.3;
		if let Some(job) = self.jobs.get_mut(&id) {
			job.state = match outcome {
				Ok(made) => State::Done { made },
				Err(reason) => State::Failed { reason },
			};
			job.finished_at = Some(finished_at);
		}
	}

	pub fn view(&self, id: Uuid) -> Option<View> {
		let job = self.jobs.get(&id)?;
		Some(match &job.state {
			State::Queued => View::Waiting { rendering: false, retry_after: self.estimate(id, job.lane) },
			// Half a capture on average is left of one already rendering.
			State::Rendering => {
				View::Waiting { rendering: true, retry_after: seconds(self.average / 2.0) }
			}
			State::Done { made } => View::Done { made: made.clone() },
			State::Failed { reason } => View::Failed { reason: reason.clone() },
		})
	}

	pub fn details(&self, id: Uuid) -> Option<Details> {
		let job = self.jobs.get(&id)?;
		Some(Details {
			asked: job.asked.clone(),
			lane: job.lane,
			asked_at: job.asked_at,
			started_at: job.started_at,
			finished_at: job.finished_at,
			fresh: job.fresh,
		})
	}

	/// Seconds until a waiting capture is likely done: what is ahead of it, over how many render at
	/// once, plus its own turn, at the recent pace. Never where it stands, which is not the caller's.
	fn estimate(&self, id: Uuid, lane: Lane) -> u32 {
		let own = self.waiting[lane.index()].iter().position(|waiting| *waiting == id).unwrap_or(0);
		let ahead = own + if lane == Lane::Public { self.waiting[Lane::Ours.index()].len() } else { 0 };
		seconds((ahead as f64 / self.concurrency as f64 + 1.0) * self.average)
	}

	/// Forget every settled capture whose window has passed, the disk answering for it from then;
	/// answers which were forgotten.
	pub fn sweep(&mut self, now: Instant) -> Vec<Uuid> {
		let passed: Vec<Uuid> = self
			.jobs
			.iter()
			.filter(|(_, job)| now.duration_since(job.since) >= WINDOW)
			.map(|(id, _)| *id)
			.collect();
		self.forget(&passed);
		passed.into_iter().filter(|id| !self.jobs.contains_key(id)).collect()
	}

	/// Forget these captures, the settled among them: rolled out of the store, or past their window.
	pub fn forget(&mut self, ids: &[Uuid]) {
		for id in ids {
			let settled = self
				.jobs
				.get(id)
				.is_some_and(|job| matches!(job.state, State::Done { .. } | State::Failed { .. }));
			if settled && let Some(job) = self.jobs.remove(id) {
				self.by_asked.remove(&job.asked);
			}
		}
	}
}

/// Whole seconds, rounded up, between one and a minute.
fn seconds(estimate: f64) -> u32 {
	(estimate.ceil() as u32).clamp(1, 60)
}

#[cfg(test)]
mod tests {
	use super::*;
	use url::Url;

	fn asked(page: &str) -> Asked {
		Asked {
			url: Url::parse(&format!("https://{page}.test/")).unwrap(),
			width: 1280,
			height: 800,
			full: false,
			internal: false,
			insecure: false,
			javascript: true,
			timeout: 15_000,
			delay: 210,
		}
	}

	fn made() -> Made {
		let pictures = Pictures { width: 1280, height: 800, png_bytes: 3, webp_bytes: None };
		Made { pictures, observed: serde_json::Value::Null }
	}

	#[test]
	fn the_same_ask_is_one_capture() {
		let mut queue = Queue::new(2);
		let first = queue.ask(asked("a"), Lane::Public).unwrap();
		assert_eq!(queue.ask(asked("a"), Lane::Public), Ok(first));
		assert_ne!(queue.ask(asked("b"), Lane::Public), Ok(first));
		let other_size = Asked { width: 390, ..asked("a") };
		assert_ne!(queue.ask(other_size, Lane::Public), Ok(first));
	}

	#[test]
	fn ours_go_first_and_move_up_what_the_public_asked() {
		let mut queue = Queue::new(1);
		let public = queue.ask(asked("p"), Lane::Public).unwrap();
		let shared = queue.ask(asked("s"), Lane::Public).unwrap();
		let ours = queue.ask(asked("o"), Lane::Ours).unwrap();
		assert_eq!(queue.ask(asked("s"), Lane::Ours), Ok(shared));
		let order: Vec<Uuid> = std::iter::from_fn(|| queue.take().map(|(id, _)| id)).collect();
		assert_eq!(order, [ours, shared, public]);
	}

	#[test]
	fn a_full_lane_refuses_and_the_other_does_not() {
		let mut queue = Queue::new(2);
		for n in 0..Lane::Public.capacity() {
			queue.ask(asked(&format!("p{n}")), Lane::Public).unwrap();
		}
		assert_eq!(queue.ask(asked("one-more"), Lane::Public), Err(Full));
		assert!(queue.ask(asked("ours"), Lane::Ours).is_ok());
		// What is already waiting is still answered, full or not.
		assert!(queue.ask(asked("p0"), Lane::Public).is_ok());
	}

	#[test]
	fn estimates_by_what_is_ahead_and_the_recent_pace() {
		let mut queue = Queue::new(2);
		let ours = queue.ask(asked("o"), Lane::Ours).unwrap();
		let public: Vec<Uuid> =
			(0..4).map(|n| queue.ask(asked(&format!("p{n}")), Lane::Public).unwrap()).collect();
		let wait = |queue: &Queue, id| match queue.view(id) {
			Some(View::Waiting { retry_after, .. }) => retry_after,
			other => panic!("{other:?}"),
		};
		// First in its lane: its own turn, at the first guess of five seconds.
		assert_eq!(wait(&queue, ours), 5);
		// The public's fourth has ours and three of its own ahead: (4 / 2 + 1) * 5.
		assert_eq!(wait(&queue, public[3]), 15);
		// Quick captures pull the pace down, to the floor of one second.
		while let Some((id, _)) = queue.take() {
			queue.finish(id, Ok(made()), Duration::from_millis(500), jiff::Timestamp::now());
		}
		for _ in 0..10 {
			queue.finish(ours, Ok(made()), Duration::from_millis(500), jiff::Timestamp::now());
		}
		let late = queue.ask(asked("late"), Lane::Public).unwrap();
		assert_eq!(wait(&queue, late), 1);
	}

	#[test]
	fn settles_and_is_forgotten_thirty_minutes_after_it_was_asked() {
		let mut queue = Queue::new(2);
		let done = queue.ask(asked("d"), Lane::Ours).unwrap();
		let failed = queue.ask(asked("f"), Lane::Ours).unwrap();
		let waiting = queue.ask(asked("w"), Lane::Public).unwrap();
		queue.take();
		assert!(matches!(queue.view(done), Some(View::Waiting { rendering: true, .. })));
		queue.take();
		let at = Instant::now();
		let now = jiff::Timestamp::now();
		queue.finish(done, Ok(made()), Duration::from_secs(2), now);
		queue.finish(failed, Err("net::ERR_NAME_NOT_RESOLVED".into()), Duration::from_secs(2), now);
		assert_eq!(queue.view(done), Some(View::Done { made: made() }));
		let details = queue.details(done).unwrap();
		assert!(Some(details.asked_at) <= details.started_at);
		assert!(details.started_at <= details.finished_at);
		assert!(queue.details(waiting).unwrap().started_at.is_none());
		assert!(matches!(queue.view(failed), Some(View::Failed { .. })));

		// Within the window the same ask is the capture already made.
		assert!(queue.sweep(at + WINDOW - Duration::from_secs(60)).is_empty());
		assert_eq!(queue.ask(asked("d"), Lane::Public), Ok(done));
		let mut forgotten = queue.sweep(at + WINDOW);
		forgotten.sort();
		let mut expected = vec![done, failed];
		expected.sort();
		assert_eq!(forgotten, expected);
		assert_eq!(queue.view(done), None);
		// Unsettled, it stays however long it waits; and past its window an ask is a new capture.
		assert!(queue.view(waiting).is_some());
		assert_ne!(queue.ask(asked("d"), Lane::Ours), Ok(done));
	}

	#[test]
	fn forgets_only_what_is_settled() {
		let mut queue = Queue::new(1);
		let done = queue.ask(asked("d"), Lane::Ours).unwrap();
		let waiting = queue.ask(asked("w"), Lane::Ours).unwrap();
		queue.take();
		queue.finish(done, Ok(made()), Duration::from_secs(1), jiff::Timestamp::now());
		queue.forget(&[done, waiting]);
		assert_eq!(queue.view(done), None);
		assert!(queue.view(waiting).is_some());
		assert_eq!(queue.ask(asked("w"), Lane::Ours), Ok(waiting));
	}

	#[test]
	fn a_failure_is_tried_again_when_asked_again() {
		let mut queue = Queue::new(1);
		let id = queue.ask(asked("f"), Lane::Public).unwrap();
		queue.take();
		queue.finish(id, Err("timed out".into()), Duration::from_secs(20), jiff::Timestamp::now());
		assert_eq!(queue.enter(asked("f"), Lane::Public, false), Ok(Entered { id, queued: true }));
		assert_eq!(queue.enter(asked("f"), Lane::Public, false), Ok(Entered { id, queued: false }));
		assert!(matches!(queue.view(id), Some(View::Waiting { rendering: false, .. })));
		assert_eq!(queue.take().map(|(next, _)| next), Some(id));
	}

	#[test]
	fn fresh_makes_a_new_id_and_the_index_points_at_it() {
		let mut queue = Queue::new(2);
		let old = queue.ask(asked("f"), Lane::Ours).unwrap();
		queue.take();
		queue.finish(old, Ok(made()), Duration::from_secs(1), jiff::Timestamp::now());

		let entered = queue.enter(asked("f"), Lane::Ours, true).unwrap();
		assert!(entered.queued && entered.id != old);
		// The kept capture is not what a fresh ask answers with.
		assert!(matches!(queue.view(entered.id), Some(View::Waiting { rendering: false, .. })));
		// The next plain ask of the same parameters is answered with the fresh id.
		assert_eq!(queue.ask(asked("f"), Lane::Ours), Ok(entered.id));
		// The one it passed over stays readable by its own id.
		assert_eq!(queue.view(old), Some(View::Done { made: made() }));
	}

	#[test]
	fn fresh_on_a_first_ask_still_queues_one_capture() {
		let mut queue = Queue::new(2);
		let entered = queue.enter(asked("f"), Lane::Ours, true).unwrap();
		assert!(entered.queued);
		assert_eq!(queue.ask(asked("f"), Lane::Ours), Ok(entered.id));
	}
}
