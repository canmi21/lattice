//! A deploy as host sees it: admit the declaration, replace the container through the shared
//! procedure, then record the new version, route it and collect what is no longer needed. See
//! spec/architecture/host.md.

use crate::store::Deployed;
use crate::{Host, caddy, store};
use deploy::manifest::{Invalid, Manifest};
use deploy::replace::{self, replace};
use deploy::{Shape, Version, engine};
use std::collections::HashSet;

#[derive(Debug, thiserror::Error)]
pub enum Error {
	#[error(transparent)]
	Invalid(#[from] Invalid),
	#[error("port {port} is already `{holder}`'s")]
	PortTaken { port: u16, holder: String },
	#[error(transparent)]
	Store(#[from] store::Error),
	#[error(transparent)]
	Replace(#[from] replace::Error),
	#[error(transparent)]
	Engine(#[from] engine::Error),
	#[error("the node's environment at {path}: {source}")]
	Environment { path: String, source: std::io::Error },
}

#[derive(Debug, serde::Serialize)]
pub struct Outcome {
	pub name: String,
	pub image: String,
	/// Whether Caddy took the new configuration. A deploy that ran but could not be routed is
	/// still a deploy; this says which half is missing.
	pub routed: Result<(), String>,
}

/// Refuse what could not be run before anything is stopped. keeper is the one reserved name host
/// deploys; host itself is keeper's to deploy.
pub fn admit(host: &Host, requested: &str, manifest: &Manifest) -> Result<(), Error> {
	if requested == "keeper" {
		manifest.check_platform(requested, &host.config.node)?;
	} else {
		manifest.check(requested, &host.config.node)?;
	}
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
	let shape = if name == "keeper" {
		let path = &host.config.platform_env;
		let env = deploy::read_env(path)
			.map_err(|source| Error::Environment { path: path.display().to_string(), source })?;
		Shape::Platform { env }
	} else {
		Shape::Sandboxed
	};
	let current = host
		.store
		.app(&name)?
		.map(|current| Version { manifest: current.manifest, image: current.image });
	let next = Version { manifest, image };
	let members = [host.config.own_container.as_str(), host.config.caddy.container.as_str()];
	replace(&host.engine, &host.volumes, &members, &shape, &next, current.as_ref()).await?;

	let deployed_at = jiff::Timestamp::now().to_string();
	let image = next.image.clone();
	host.store.put_app(&Deployed { manifest: next.manifest, image: next.image, previous: current, deployed_at })?;
	let routed = route(host).await.map_err(|error| error.to_string());
	collect(host).await?;
	Ok(Outcome { name, image, routed })
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

/// Keep what every app runs and what each would go back to; the rest of their images go. host's
/// own images are keeper's to collect, so they are not among the names asked about here.
async fn collect(host: &Host) -> Result<(), Error> {
	let apps = host.store.apps()?;
	let names: Vec<&str> = apps.iter().map(|app| app.manifest.name.as_str()).collect();
	let mut keep = HashSet::new();
	for app in &apps {
		keep.insert(app.image.clone());
		keep.extend(app.previous.as_ref().map(|previous| previous.image.clone()));
	}
	host.engine.collect(&names, &keep).await?;
	Ok(())
}
