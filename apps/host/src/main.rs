//! host: the deployment platform on one node. It takes an app's image and declaration, runs
//! exactly one container for it, puts the previous version back when a new one fails, and renders
//! all of Caddy from what it holds. See spec/architecture/host.md and
//! spec/architecture/services.md.

mod api;
mod caddy;
mod config;
mod deploy;
mod engine;
mod http;
mod manifest;
mod store;
mod volume;

use std::sync::Arc;

/// Everything a request handler reaches.
pub struct Host {
	pub config: config::Config,
	pub store: store::Store,
	pub engine: engine::Engine,
	pub volumes: volume::Volumes,
	pub deploying: tokio::sync::Mutex<()>,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
	let config = config::Config::from_env()?;
	if let Some(parent) = config.state.parent() {
		std::fs::create_dir_all(parent)?;
	}
	let host = Arc::new(Host {
		store: store::Store::open(&config.state)?,
		engine: engine::Engine::connect()?,
		volumes: volume::Volumes::new(config.apps_root.clone(), config.snapshots_root.clone()),
		deploying: tokio::sync::Mutex::new(()),
		config,
	});

	// What was running keeps running whatever happens here; these only put Caddy back in step with
	// the state. A failure is reported and serving goes on, since the panel is how it is fixed.
	if let Err(error) = deploy::attach(&host).await {
		eprintln!("host: attaching networks: {error}");
	}
	match deploy::route(&host).await {
		Ok(()) => eprintln!("host: Caddy is in step"),
		Err(error) => eprintln!("host: Caddy was not updated: {error}"),
	}

	let listener = tokio::net::TcpListener::bind(host.config.listen).await?;
	eprintln!("host: node `{}`, listening on {}", host.config.node, host.config.listen);
	axum::serve(listener, api::router(host)).with_graceful_shutdown(stopped()).await?;
	Ok(())
}

/// `docker stop` sends SIGTERM to a process that is PID 1 in its container, which ignores it
/// unless it asks.
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
