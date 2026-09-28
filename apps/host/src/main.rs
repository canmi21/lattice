//! host: the deployment platform on one node. It takes an app's image and declaration, runs
//! exactly one container for it, puts the previous version back when a new one fails, and renders
//! all of Caddy from what it holds. See spec/architecture/host.md and
//! spec/architecture/services.md.

mod api;
mod caddy;
mod config;
mod environment;
mod images;
mod node;
mod rollout;
mod store;

use std::sync::Arc;

/// musl's allocator is slow under many small allocations, and images are built for speed; see
/// spec/architecture/host.md, "An image is built for speed, and for any node of its architecture".
#[global_allocator]
static ALLOCATOR: mimalloc::MiMalloc = mimalloc::MiMalloc;

/// Everything a request handler reaches.
pub struct Host {
	pub config: config::Config,
	pub store: store::Store,
	pub engine: deploy::Engine,
	pub volumes: deploy::Volumes,
	pub deploying: tokio::sync::Mutex<()>,
	/// Absent without a GITHUB_ACTIONS_TOKEN, and then CI's notices are refused.
	pub github: Option<deploy::github::GitHub>,
	/// The runs a notice has been taken for.
	pub notices: std::sync::Mutex<std::collections::HashSet<u64>>,
	/// The images as the background last found them, and what the panel asked of them.
	pub images: images::Images,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
	let config = config::Config::from_env()?;
	deploy::clear_arrivals(&config.incoming)?;
	let host = Arc::new(Host {
		store: store::Store::open(&config.state)?,
		engine: deploy::Engine::connect()?,
		volumes: deploy::Volumes::new(
			config.apps_root.clone(),
			config.snapshots_root.clone(),
			config.logs_root.clone(),
		),
		deploying: tokio::sync::Mutex::new(()),
		github: std::env::var("GITHUB_ACTIONS_TOKEN")
			.ok()
			.filter(|token| !token.is_empty())
			.map(deploy::github::GitHub::new),
		notices: std::sync::Mutex::default(),
		images: images::Images::default(),
		config,
	});

	// What was running keeps running whatever happens here; these only put Caddy back in step with
	// the state. A failure is reported and serving goes on, since the panel is how it is fixed.
	if let Err(error) = rollout::attach(&host).await {
		eprintln!("host: attaching networks: {error}");
	}
	match rollout::route(&host).await {
		Ok(()) => eprintln!("host: Caddy is in step"),
		Err(error) => eprintln!("host: Caddy was not updated: {error}"),
	}

	tokio::spawn(images::run(host.clone()));

	let telling = host.clone();
	tokio::spawn(async move {
		loop {
			let directory = telling.volumes.data("meter");
			if let Err(error) = node::tell(&telling.engine, &directory).await {
				eprintln!("host: telling the meter which container is which: {error}");
			}
			tokio::time::sleep(node::TELLING).await;
		}
	});

	// On the node, only on host's own network, which the panel and keeper share and Caddy does not:
	// every app's network host joins to check health leaves its port unreachable from there. See
	// spec/architecture/host.md, "The panel is an app of its own".
	let mut listen = host.config.listen;
	if std::env::var_os("LISTEN").is_none() {
		let network = deploy::engine::network_of(&host.config.own_container);
		match host.engine.address_on(&host.config.own_container, &network).await {
			Ok(Some(address)) => listen.set_ip(address),
			Ok(None) => eprintln!("host: on no network of its own; answering on every one"),
			Err(error) => eprintln!("host: reading its own address: {error}"),
		}
	}
	let listener = tokio::net::TcpListener::bind(listen).await?;
	eprintln!("host: node `{}`, listening on {listen}", host.config.node);
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
