//! One deploy, start to finish: stop, snapshot, start, check, and on a failed check put back both
//! the directory and the version before. See spec/architecture/host.md, "One version runs, and a
//! failed deploy puts the last one back".

use crate::manifest::{Invalid, Manifest};
use crate::store::{Deployed, Version};
use crate::{Host, caddy, engine, store, volume};
use std::collections::HashSet;
use std::time::Duration;

/// How long a new version has to answer its health check when its declaration does not say.
const DEFAULT_DEADLINE: Duration = Duration::from_secs(60);

#[derive(Debug, thiserror::Error)]
pub enum Error {
	#[error(transparent)]
	Invalid(#[from] Invalid),
	#[error("port {port} is already `{holder}`'s")]
	PortTaken { port: u16, holder: String },
	#[error(transparent)]
	Store(#[from] store::Error),
	#[error(transparent)]
	Engine(#[from] engine::Error),
	#[error(transparent)]
	Volume(#[from] volume::Error),
	/// The new version did not become healthy, and the one before it is running again on the
	/// data as it was.
	#[error("{reason}; the previous version is back, with its data as it was\n{logs}")]
	Unhealthy { reason: String, logs: String },
	/// Nothing ran before, so there was nothing to put back.
	#[error("{reason}; there was no previous version to put back\n{logs}")]
	FirstFailed { reason: String, logs: String },
}

#[derive(Debug, serde::Serialize)]
pub struct Outcome {
	pub name: String,
	pub image: String,
	/// Whether Caddy took the new configuration. A deploy that ran but could not be routed is
	/// still a deploy; this says which half is missing.
	pub routed: Result<(), String>,
}

/// Refuse what could not be run before anything is stopped.
pub fn admit(host: &Host, requested: &str, manifest: &Manifest) -> Result<(), Error> {
	manifest.check(requested, &host.config.node)?;
	let port = manifest.container.port;
	let holder = host
		.store
		.apps()?
		.into_iter()
		.find(|app| app.manifest.name != manifest.name && app.manifest.container.port == port);
	if let Some(holder) = holder {
		return Err(Error::PortTaken { port, holder: holder.manifest.name });
	}
	Ok(())
}

pub async fn deploy(host: &Host, manifest: Manifest, image: String) -> Result<Outcome, Error> {
	let name = manifest.name.clone();
	let own = host.config.own_container.as_str();
	let caddy_container = host.config.caddy.container.as_str();

	host.engine.network(&name, &[own, caddy_container]).await?;
	host.volumes.ensure(&name).await?;
	let current = host.store.app(&name)?;

	host.engine.remove(&name).await?;
	let snapshot = host.volumes.snapshot(&name).await?;
	let started = host.engine.run(&manifest, &image, &host.volumes.data(&name)).await;
	let checked = match started {
		Ok(()) => healthy(host, &manifest).await,
		Err(error) => Err(error.to_string()),
	};

	if let Err(reason) = checked {
		let logs = host.engine.tail(&name).await;
		host.engine.remove(&name).await?;
		host.volumes.restore(&name, &snapshot).await?;
		let Some(current) = current else {
			return Err(Error::FirstFailed { reason, logs });
		};
		host.engine.run(&current.manifest, &current.image, &host.volumes.data(&name)).await?;
		return Err(Error::Unhealthy { reason, logs });
	}

	let previous =
		current.map(|current| Version { manifest: current.manifest, image: current.image });
	let deployed_at = jiff::Timestamp::now().to_string();
	host.store.put_app(&Deployed { manifest, image: image.clone(), previous, deployed_at })?;
	host.volumes.prune(&name).await?;
	let routed = route(host).await.map_err(|error| error.to_string());
	collect(host).await?;
	Ok(Outcome { name, image, routed })
}

/// Poll the declared path until it answers 2xx, the container exits, or the deadline passes.
async fn healthy(host: &Host, manifest: &Manifest) -> Result<(), String> {
	let deadline = manifest.container.health_timeout.map_or(DEFAULT_DEADLINE, Duration::from_secs);
	let address = format!("{}:{}", manifest.name, manifest.container.port);
	let started = tokio::time::Instant::now();
	let mut last = String::from("no answer yet");
	while started.elapsed() < deadline {
		if !host.engine.running(&manifest.name).await.map_err(|e| e.to_string())? {
			return Err("the container exited during its health check".into());
		}
		match crate::http::status(&address, &manifest.container.health).await {
			Ok(status) if (200..300).contains(&status) => return Ok(()),
			Ok(status) => last = format!("{} answered {status}", manifest.container.health),
			Err(error) => last = error.to_string(),
		}
		tokio::time::sleep(Duration::from_secs(1)).await;
	}
	Err(format!("not healthy within {} seconds: {last}", deadline.as_secs()))
}

#[derive(Debug, thiserror::Error)]
pub enum RouteError {
	#[error(transparent)]
	Store(#[from] store::Error),
	#[error(transparent)]
	Caddy(#[from] caddy::Error),
	#[error(transparent)]
	Engine(#[from] engine::Error),
}

/// Render Caddy from the state as it now is, and apply it. A state that cannot be read is an
/// error and never an empty list: rendering nothing would take every route down.
pub async fn route(host: &Host) -> Result<(), RouteError> {
	let rendered = render(host)?;
	caddy::apply(&host.config.caddy, &rendered).await?;
	Ok(())
}

pub fn render(host: &Host) -> Result<serde_json::Value, store::Error> {
	Ok(caddy::render(
		&host.config.caddy,
		&host.config.own_container,
		&host.store.apps()?,
		&host.store.routes()?,
	))
}

/// Attach Caddy and host to every app's network again. A Caddy container that was recreated
/// rather than restarted comes back attached to none of them.
pub async fn attach(host: &Host) -> Result<(), RouteError> {
	let members = [host.config.own_container.as_str(), host.config.caddy.container.as_str()];
	host.engine.network("host", &members).await?;
	for app in host.store.apps()? {
		host.engine.network(&app.manifest.name, &members).await?;
	}
	Ok(())
}

/// Keep what every app runs and what each would go back to; the rest of host's images go.
async fn collect(host: &Host) -> Result<(), Error> {
	let mut keep = HashSet::new();
	for app in host.store.apps()? {
		keep.insert(app.image);
		keep.extend(app.previous.map(|previous| previous.image));
	}
	host.engine.collect(&keep).await?;
	Ok(())
}
