use agent::api::{self, SOCKET, Shared};
use agent::{probe, sampler::Sampler, store::Store};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

/// musl's allocator is slow under many small allocations, and images are built for speed; see
/// spec/architecture/host.md, "An image is built for speed, and for any node of its architecture".
#[global_allocator]
static ALLOCATOR: mimalloc::MiMalloc = mimalloc::MiMalloc;

/// Where the agent keeps its hours and its socket, and whose filesystem it reports as storage.
fn directory() -> PathBuf {
	std::env::var_os("AGENT_DATA").map_or_else(|| "/data".into(), PathBuf::from)
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
	let directory = directory();
	let store = Store::open(&directory.join("hours.db"))?;
	let roots = probe::Roots::system(Some(directory.clone()));
	let shared: Shared = Arc::new(Mutex::new(Sampler::new(roots, store)));

	// Its own thread: a tick is blocking file reads and, once an hour, a SQLite write.
	let ticking = shared.clone();
	std::thread::spawn(move || {
		loop {
			// On the second, so each sample is one second's worth and lands in its own.
			let since = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default();
			let rest = Duration::from_secs(1) - Duration::from_nanos(since.subsec_nanos().into());
			std::thread::sleep(rest);
			if let Err(error) = api::lock(&ticking).tick() {
				eprintln!("agent: {error}");
			}
		}
	});

	// A socket left by a run that did not stop cleanly would refuse the bind.
	let socket = directory.join(SOCKET);
	let _ = std::fs::remove_file(&socket);
	let listener = tokio::net::UnixListener::bind(&socket)?;
	eprintln!("agent: sampling, answering on {}", socket.display());
	axum::serve(listener, api::routes(shared.clone())).with_graceful_shutdown(stopped()).await?;

	api::lock(&shared).stop()?;
	let _ = std::fs::remove_file(&socket);
	Ok(())
}

/// `docker stop` sends SIGTERM, and a process that is PID 1 in its container ignores it unless it
/// asks; the open hour is kept on the way down.
async fn stopped() {
	let terminated = async {
		if let Ok(mut signal) =
			tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
		{
			signal.recv().await;
		}
	};
	tokio::select! {
		_ = tokio::signal::ctrl_c() => {}
		() = terminated => {}
	}
}
