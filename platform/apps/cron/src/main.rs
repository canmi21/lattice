//! cron: every scheduled job on a node, in one place. See spec/architecture/cron.md.

use cron::reach::{self, Network};
use cron::scheduler::Cron;
use cron::store::{self, Store};
use cron::table;
use std::path::PathBuf;
use std::sync::Arc;

/// musl's allocator is slow under many small allocations, and images are built for speed; see
/// spec/architecture/host.md, "An image is built for speed, and for any node of its architecture".
#[global_allocator]
static ALLOCATOR: mimalloc::MiMalloc = mimalloc::MiMalloc;

/// This service's port, inside its container and everywhere else. `service.toml` states it for
/// host, and the test below holds the two together.
const PORT: u16 = 12011;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
	let directory =
		std::env::var_os("CRON_DATA").map_or_else(|| PathBuf::from("/data"), PathBuf::from);
	let listen = std::env::var("LISTEN").unwrap_or_else(|_| format!("0.0.0.0:{PORT}"));

	let store = Store::open(&directory.join(store::FILE))?;
	let cron =
		Cron::new(store, ledger::Ledger::start(), Arc::new(Network::new()), reach::origin().to_owned());

	// No table yet is an empty one: host writes it on its next deploy.
	let seen = table::modified(&directory);
	match table::read(&directory) {
		Ok(table) => {
			eprintln!("cron: read {} jobs", table.jobs.len());
			cron.load(table, jiff::Timestamp::now());
		}
		Err(error) => eprintln!("cron: no table yet: {error}"),
	}
	tokio::spawn(cron.clone().drive());
	tokio::spawn(cron.clone().watch(directory.clone(), seen));

	let listener = tokio::net::TcpListener::bind(&listen).await?;
	eprintln!("cron: listening on {listen}, keeping {}", directory.display());
	axum::serve(listener, cron::api::routes(cron)).with_graceful_shutdown(stopped()).await?;
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
