//! The captures asked for and where each is: waiting in one of two lanes, rendering, done or
//! failed, until it is five minutes settled. Ours go ahead of the public's, always. Nothing here is
//! a picture; those are on disk. See spec/architecture/shot.md, "Two queues, and ours go first".

use crate::asked::Asked;
use std::collections::{HashMap, VecDeque};
use std::time::{Duration, Instant};
use uuid::Uuid;

/// How long a settled capture is kept, done or failed.
pub const KEPT: Duration = Duration::from_secs(5 * 60);

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

#[derive(Debug, Clone, PartialEq)]
enum State {
	Queued,
	Rendering,
	/// Whether a WebP was made beside the PNG.
	Done {
		webp: bool,
	},
	Failed {
		reason: String,
	},
}

#[derive(Debug)]
struct Job {
	asked: Asked,
	lane: Lane,
	state: State,
	/// When it was done or failed.
	settled: Option<Instant>,
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
		webp: bool,
	},
	Failed {
		reason: String,
	},
}

#[derive(Debug, PartialEq)]
pub struct Full;

#[derive(Debug)]
pub struct Queue {
	jobs: HashMap<Uuid, Job>,
	/// The capture each distinct ask is, while it is kept.
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
		if let Some(&id) = self.by_asked.get(&asked) {
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
					job.settled = None;
					self.waiting[lane.index()].push_back(id);
				}
				_ => {}
			}
			return Ok(id);
		}
		if self.waiting[lane.index()].len() >= lane.capacity() {
			return Err(Full);
		}
		let id = Uuid::new_v4();
		self.by_asked.insert(asked.clone(), id);
		self.jobs.insert(id, Job { asked, lane, state: State::Queued, settled: None });
		self.waiting[lane.index()].push_back(id);
		Ok(id)
	}

	/// The next capture to render, ours first, marked as rendering.
	pub fn take(&mut self) -> Option<(Uuid, Asked)> {
		let id = self.waiting.iter_mut().find_map(VecDeque::pop_front)?;
		let job = self.jobs.get_mut(&id)?;
		job.state = State::Rendering;
		Some((id, job.asked.clone()))
	}

	/// A capture is over: `Ok` with whether a WebP was made, or why it failed, and how long it took.
	pub fn finish(&mut self, id: Uuid, outcome: Result<bool, String>, took: Duration, now: Instant) {
		self.average = self.average * 0.7 + took.as_secs_f64() * 0.3;
		if let Some(job) = self.jobs.get_mut(&id) {
			job.state = match outcome {
				Ok(webp) => State::Done { webp },
				Err(reason) => State::Failed { reason },
			};
			job.settled = Some(now);
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
			State::Done { webp } => View::Done { webp: *webp },
			State::Failed { reason } => View::Failed { reason: reason.clone() },
		})
	}

	/// Seconds until a waiting capture is likely done: what is ahead of it, over how many render at
	/// once, plus its own turn, at the recent pace. Never where it stands, which is not the caller's.
	fn estimate(&self, id: Uuid, lane: Lane) -> u32 {
		let own = self.waiting[lane.index()].iter().position(|waiting| *waiting == id).unwrap_or(0);
		let ahead = own + if lane == Lane::Public { self.waiting[Lane::Ours.index()].len() } else { 0 };
		seconds((ahead as f64 / self.concurrency as f64 + 1.0) * self.average)
	}

	/// Forget every capture settled longer ago than it is kept; answers them, for their files to go.
	pub fn sweep(&mut self, now: Instant) -> Vec<Uuid> {
		let expired: Vec<Uuid> = self
			.jobs
			.iter()
			.filter(|(_, job)| job.settled.is_some_and(|at| now.duration_since(at) >= KEPT))
			.map(|(id, _)| *id)
			.collect();
		for id in &expired {
			if let Some(job) = self.jobs.remove(id) {
				self.by_asked.remove(&job.asked);
			}
		}
		expired
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
			timeout: 15_000,
			delay: 210,
		}
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
			queue.finish(id, Ok(true), Duration::from_millis(500), Instant::now());
		}
		for _ in 0..10 {
			queue.finish(ours, Ok(true), Duration::from_millis(500), Instant::now());
		}
		let late = queue.ask(asked("late"), Lane::Public).unwrap();
		assert_eq!(wait(&queue, late), 1);
	}

	#[test]
	fn settles_and_is_forgotten_five_minutes_after() {
		let mut queue = Queue::new(2);
		let done = queue.ask(asked("d"), Lane::Ours).unwrap();
		let failed = queue.ask(asked("f"), Lane::Ours).unwrap();
		let waiting = queue.ask(asked("w"), Lane::Public).unwrap();
		queue.take();
		assert!(matches!(queue.view(done), Some(View::Waiting { rendering: true, .. })));
		queue.take();
		let at = Instant::now();
		queue.finish(done, Ok(false), Duration::from_secs(2), at);
		queue.finish(failed, Err("net::ERR_NAME_NOT_RESOLVED".into()), Duration::from_secs(2), at);
		assert_eq!(queue.view(done), Some(View::Done { webp: false }));
		assert!(matches!(queue.view(failed), Some(View::Failed { .. })));

		assert!(queue.sweep(at + KEPT - Duration::from_secs(1)).is_empty());
		let mut expired = queue.sweep(at + KEPT);
		expired.sort();
		let mut expected = vec![done, failed];
		expected.sort();
		assert_eq!(expired, expected);
		assert_eq!(queue.view(done), None);
		// Unsettled, it stays however long it waits; and a forgotten ask is a new capture.
		assert!(queue.view(waiting).is_some());
		assert_ne!(queue.ask(asked("d"), Lane::Ours), Ok(done));
	}

	#[test]
	fn a_failure_is_tried_again_when_asked_again() {
		let mut queue = Queue::new(1);
		let id = queue.ask(asked("f"), Lane::Public).unwrap();
		queue.take();
		queue.finish(id, Err("timed out".into()), Duration::from_secs(20), Instant::now());
		assert_eq!(queue.ask(asked("f"), Lane::Public), Ok(id));
		assert!(matches!(queue.view(id), Some(View::Waiting { rendering: false, .. })));
		assert_eq!(queue.take().map(|(next, _)| next), Some(id));
	}
}
