//! `probe`: checks the platform on each check's own beat, and writes every round three ways --
//! the archive, the status database, and the ledger for what fails. See
//! spec/architecture/probe.md.

use probe::api::{self, AppState};
use probe::archive::Archive;
use probe::ask::{Context, Network};
use probe::episodes::{self, Episodes};
use probe::round::Round;
use probe::status::{Postgres, Writer};
use probe::{checks, schedule};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tokio::sync::mpsc;

/// musl's allocator is slow under many small allocations, and images are built for speed; see
/// spec/architecture/host.md, "An image is built for speed, and for any node of its architecture".
#[global_allocator]
static ALLOCATOR: mimalloc::MiMalloc = mimalloc::MiMalloc;

/// This service's port, inside its container and everywhere else. `service.toml` states it for
/// host, and the test below holds the two together.
const PORT: u16 = 19770;

/// The status database is written in batches this often. See spec/architecture/probe.md,
/// "Where the results go".
const PASS: Duration = Duration::from_secs(10);

/// A pass that takes longer than this is abandoned and its connection with it.
const PASS_LIMIT: Duration = Duration::from_secs(60);

#[tokio::main]
async fn main() -> anyhow::Result<()> {
	let data = PathBuf::from(std::env::var("PROBE_DATA").unwrap_or_else(|_| "/data".into()));
	let listen = std::env::var("LISTEN").unwrap_or_else(|_| format!("0.0.0.0:{PORT}"));
	// Which placement this probe asks from, as `place` in every table.
	let place = std::env::var("PROBE_PLACE").unwrap_or_else(|_| "home".into());
	let token = std::env::var("PROBE_TOKEN").ok().filter(|token| !token.is_empty());
	let database = std::env::var("SUPABASE_DATABASE_URL").ok().filter(|url| !url.is_empty());

	let declared = checks::parse(checks::DECLARED).map_err(anyhow::Error::msg)?;
	let path = data.join("probe.db");
	let mut writing = Archive::open(&path)?;
	let reading = Arc::new(Mutex::new(Archive::open(&path)?));
	let ledger = ledger::Ledger::start();

	let (to_status, from_rounds) = mpsc::unbounded_channel::<Round>();
	match database {
		Some(url) => {
			let writer = Writer::new(
				Postgres::new(&url).map_err(anyhow::Error::msg)?,
				place.clone(),
				declared.clone(),
			);
			tokio::spawn(write_status(writer, from_rounds, reading.clone()));
		}
		None => {
			eprintln!("probe: SUPABASE_DATABASE_URL is not set; the status database is not written")
		}
	}

	let (rounds, mut received) = mpsc::unbounded_channel::<Round>();
	let by_id: std::collections::HashMap<String, checks::Check> =
		declared.iter().map(|check| (check.id.clone(), check.clone())).collect();
	let recording_place = place.clone();
	tokio::spawn(async move {
		let mut episodes = Episodes::default();
		while let Some(first) = received.recv().await {
			let mut batch = vec![first];
			while let Ok(more) = received.try_recv() {
				batch.push(more);
			}
			// A small transaction on the node's own disk; blocking here is shorter than a hop.
			let kept = tokio::task::block_in_place(|| writing.keep(&recording_place, &batch));
			if let Err(error) = kept {
				eprintln!("probe: the archive: {error}");
			}
			for round in batch {
				if let Some(check) = by_id.get(&round.check) {
					episodes::tell(&ledger, episodes.observe(check, &recording_place, &round));
				}
				let _ = to_status.send(round);
			}
		}
	});

	let context = Context::new(Arc::new(Network::new()), token);
	schedule::start(&declared, context, rounds);

	let state = AppState { checks: Arc::new(declared), place, archive: reading };
	let listener = tokio::net::TcpListener::bind(&listen).await?;
	eprintln!("probe: listening on {listen}, keeping {}", path.display());
	axum::serve(listener, api::routes(state)).with_graceful_shutdown(stopped()).await?;
	Ok(())
}

/// Every ten seconds, what arrived since is queued and a pass is made. Neither an unreachable
/// database nor a slow one holds up checking or archiving, which never wait on this.
async fn write_status(
	mut writer: Writer<Postgres>,
	mut rounds: mpsc::UnboundedReceiver<Round>,
	archive: Arc<Mutex<Archive>>,
) {
	let mut beat = tokio::time::interval(PASS);
	beat.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
	loop {
		beat.tick().await;
		while let Ok(round) = rounds.try_recv() {
			writer.push(round);
		}
		let now = jiff::Timestamp::now().as_millisecond();
		if tokio::time::timeout(PASS_LIMIT, writer.pass(&archive, now)).await.is_err() {
			eprintln!("probe: a pass over the status database took too long");
			writer.abandon();
		}
	}
}

/// `docker stop` sends SIGTERM, and a process that is PID 1 in its container ignores it unless it
/// asks; without this every deploy would wait out Docker's grace period and then be killed.
async fn stopped() {
	let interrupted = async {
		let _ = tokio::signal::ctrl_c().await;
	};
	let terminated = async {
		if let Ok(mut signal) =
			tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
		{
			signal.recv().await;
		}
	};
	tokio::select! {
		() = interrupted => {}
		() = terminated => {}
	}
}

#[cfg(test)]
mod tests {
	#[test]
	fn the_port_is_the_one_the_declaration_states() {
		let declaration = include_str!("../service.toml");
		assert!(declaration.lines().any(|line| line.trim() == format!("port = {}", super::PORT)));
	}
}
