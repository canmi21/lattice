//! See spec/architecture/apt.md.

use apt::api::{self, AppState, SOCKET};
use apt::bus::{Bus, SystemBus};
use std::path::PathBuf;
use std::sync::Arc;

/// musl's allocator is slow under many small allocations, and images are built for speed; see
/// spec/architecture/host.md, "An image is built for speed, and for any node of its architecture".
#[global_allocator]
static ALLOCATOR: mimalloc::MiMalloc = mimalloc::MiMalloc;

/// Where this service keeps its socket.
fn directory() -> PathBuf {
	std::env::var_os("APT_DATA").map_or_else(|| "/data".into(), PathBuf::from)
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
	let directory = directory();
	let bus: Arc<dyn Bus> = Arc::new(SystemBus::connect().await?);
	let ledger = Some(ledger::Ledger::start());
	let state = AppState { bus, ledger };

	// A socket left by a run that did not stop cleanly would refuse the bind.
	let socket = directory.join(SOCKET);
	let _ = std::fs::remove_file(&socket);
	let listener = tokio::net::UnixListener::bind(&socket)?;
	// Made by root, it would refuse `cron`, which runs as nobody; the mount is the door. See
	// spec/architecture/apt.md, "The door".
	std::fs::set_permissions(&socket, std::os::unix::fs::PermissionsExt::from_mode(0o666))?;
	eprintln!("apt: answering on {}", socket.display());
	axum::serve(listener, api::routes(state)).with_graceful_shutdown(stopped()).await?;

	let _ = std::fs::remove_file(&socket);
	Ok(())
}

/// `docker stop` sends SIGTERM, and a process that is PID 1 in its container ignores it unless it
/// asks.
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
