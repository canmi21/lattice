use shot::asked::Asked;
use shot::render::{Capture, Render};
use shot::service::Shot;
use shot::store::Store;
use std::path::PathBuf;

/// musl's allocator is slow under many small allocations, and images are built for speed; see
/// spec/architecture/host.md, "An image is built for speed, and for any node of its architecture".
#[global_allocator]
static ALLOCATOR: mimalloc::MiMalloc = mimalloc::MiMalloc;

/// This service's port, inside its container and everywhere else. `service.toml` states it for
/// host, and the test below holds the two together.
const PORT: u16 = 19200;

/// Until a browser is wired in, every capture fails and says why.
struct NoBrowser;

impl Render for NoBrowser {
	async fn capture(&self, _: &Asked) -> Result<Capture, String> {
		Err("No browser is running in this build".into())
	}
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
	let data = PathBuf::from(std::env::var("SHOT_DATA").unwrap_or_else(|_| "/data".into()));
	let listen = std::env::var("LISTEN").unwrap_or_else(|_| format!("0.0.0.0:{PORT}"));
	let shot = Shot::new(Store::open(&data)?, NoBrowser);
	shot.start();
	let listener = tokio::net::TcpListener::bind(&listen).await?;
	eprintln!("shot: listening on {listen}, keeping captures in {}", data.display());
	axum::serve(listener, shot::api::routes(shot)).with_graceful_shutdown(stopped()).await?;
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

#[cfg(test)]
mod tests {
	#[test]
	fn the_port_is_the_one_the_declaration_states() {
		let declaration = include_str!("../service.toml");
		assert!(declaration.lines().any(|line| line.trim() == format!("port = {}", super::PORT)));
	}
}
