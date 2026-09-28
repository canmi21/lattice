use shot::browser::{Chromium, Proxies};
use shot::resolve::{Doh, Reach};
use shot::service::Shot;
use shot::store::Store;
use std::path::PathBuf;
use std::sync::Arc;

/// musl's allocator is slow under many small allocations, and images are built for speed; see
/// spec/architecture/host.md, "An image is built for speed, and for any node of its architecture".
#[global_allocator]
static ALLOCATOR: mimalloc::MiMalloc = mimalloc::MiMalloc;

/// This service's port, inside its container and everywhere else. `service.toml` states it for
/// host, and the test below holds the two together.
const PORT: u16 = 19200;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
	let data = PathBuf::from(std::env::var("SHOT_DATA").unwrap_or_else(|_| "/data".into()));
	let listen = std::env::var("LISTEN").unwrap_or_else(|_| format!("0.0.0.0:{PORT}"));
	// The image's own Chromium unless told otherwise, as on a machine where Chrome is elsewhere.
	let executable = std::env::var_os("SHOT_BROWSER").map(PathBuf::from);
	// The browser's scratch: its profile, and wherever HOME and TMPDIR point, which the image sets
	// inside the service's directory because its root is read-only.
	for scratch in ["HOME", "TMPDIR"].iter().filter_map(std::env::var_os) {
		std::fs::create_dir_all(scratch)?;
	}
	let profile = std::env::temp_dir().join("shot-chromium");

	let resolver = Arc::new(Doh::new());
	let proxies = Proxies {
		public: shot::proxy::start(resolver.clone(), Reach::Public).await?,
		internal: shot::proxy::start(resolver.clone(), Reach::Internal).await?,
	};
	let browser = Chromium::new(executable, profile, proxies, resolver);
	if let Err(error) = browser.warm().await {
		eprintln!("shot: {error}; it is tried again with the first capture");
	}
	let shot = Shot::new(Store::open(&data)?, browser);
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
