//! ledger: every task any service was asked to do. See spec/architecture/ledger.md.

use ledger_service::api::{self, Shared};
use ledger_service::store::Store;
use std::sync::{Arc, Mutex};

/// musl's allocator is slow under many small allocations, and images are built for speed; see
/// spec/architecture/host.md, "An image is built for speed, and for any node of its architecture".
#[global_allocator]
static ALLOCATOR: mimalloc::MiMalloc = mimalloc::MiMalloc;

/// This service's port, inside its container and everywhere else. `service.toml` states it for
/// host, and the test below holds the two together.
const PORT: u16 = 12010;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
	let data = std::env::var("LEDGER_DATA").unwrap_or_else(|_| "/data".into());
	let listen = std::env::var("LISTEN").unwrap_or_else(|_| format!("0.0.0.0:{PORT}"));

	let store = Store::open(std::path::Path::new(&data).join("ledger.db").as_path())?;
	let shared: Shared = Arc::new(Mutex::new(store));

	let listener = tokio::net::TcpListener::bind(&listen).await?;
	eprintln!("ledger: listening on {listen}, keeping {data}");
	axum::serve(listener, api::routes(shared)).with_graceful_shutdown(stopped()).await?;
	Ok(())
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
