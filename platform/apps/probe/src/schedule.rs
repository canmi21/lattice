//! Each check on its own beat, and every round handed to what keeps it. See
//! spec/architecture/probe.md, "What is checked, and how often".

use crate::ask::{self, Context};
use crate::checks::Check;
use crate::round::Round;
use std::time::Duration;
use tokio::sync::mpsc;
use tokio::time::MissedTickBehavior;

/// Start every check. Each runs apart, a round at a time: a round slower than the interval
/// skips the beats it overran rather than piling up. Starts are spread over the first second so
/// every check does not ask at once.
pub fn start(checks: &[Check], context: Context, rounds: mpsc::UnboundedSender<Round>) {
	let count = checks.len().max(1) as u32;
	for (index, check) in checks.iter().enumerate() {
		let check = check.clone();
		let context = context.clone();
		let rounds = rounds.clone();
		let offset = Duration::from_secs(1) * index as u32 / count;
		tokio::spawn(async move {
			tokio::time::sleep(offset).await;
			let mut beat = tokio::time::interval(check.interval);
			beat.set_missed_tick_behavior(MissedTickBehavior::Skip);
			loop {
				beat.tick().await;
				let round = once(&check, &context).await;
				if rounds.send(round).is_err() {
					return;
				}
			}
		});
	}
}

/// One round of one check, stamped with when it started and how long it took.
pub async fn once(check: &Check, context: &Context) -> Round {
	let at = jiff::Timestamp::now().as_millisecond();
	let started = std::time::Instant::now();
	let outcome = ask::run(check, context).await;
	let duration_ms = u32::try_from(started.elapsed().as_millis()).unwrap_or(u32::MAX);
	Round { check: check.id.clone(), at, ok: outcome.ok, duration_ms, detail: outcome.detail }
}
