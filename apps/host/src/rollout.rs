//! A deploy as host sees it: admit the declaration, replace the container through the shared
//! procedure, then record the new version, route it and collect what is no longer needed. See
//! spec/architecture/host.md.

use crate::store::Deployed;
use crate::{Host, caddy, store};
use deploy::manifest::{Invalid, Manifest};
use deploy::replace::{self, replace};
use deploy::{Shape, Version, engine};
use std::collections::HashSet;
use std::path::Path;
use std::sync::Arc;

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
	#[error("the archive: {0}")]
	Archive(std::io::Error),
	/// Docker would not load the archive: it is the upload that is wrong, not the node.
	#[error("the archive did not load: {0}")]
	Load(engine::Error),
}

#[derive(Debug, serde::Serialize)]
pub struct Outcome {
	pub name: String,
	pub image: String,
	/// Whether Caddy took the new configuration. A deploy that ran but could not be routed is
	/// still a deploy; this says which half is missing.
	pub routed: Result<(), String>,
}

/// Whether host takes a deploy under this name at all: any app's, and keeper, the one reserved
/// name it deploys. host itself is keeper's to deploy.
pub fn deployable(name: &str) -> Result<(), Invalid> {
	if name == "keeper" { Ok(()) } else { deploy::manifest::check_name(name) }
}

/// Refuse what could not be run before anything is stopped.
pub fn admit(host: &Host, requested: &str, manifest: &Manifest) -> Result<(), Error> {
	deployable(requested)?;
	if requested == "keeper" {
		manifest.check_platform(requested, &host.config.node)?;
	} else {
		manifest.check(requested, &host.config.node)?;
	}
	let Some(port) = manifest.container.as_ref().map(|container| container.port) else {
		return Err(deploy::manifest::Invalid::NoContainer(manifest.name.clone()).into());
	};
	let holder = host.store.apps()?.into_iter().find(|app| {
		app.manifest.name != manifest.name
			&& app.manifest.container.as_ref().map(|container| container.port) == Some(port)
	});
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
	host.store.put_app(&Deployed {
		manifest: next.manifest,
		image: next.image,
		previous: current,
		deployed_at,
	})?;
	let routed = route(host).await.map_err(|error| error.to_string());
	collect(host).await?;
	Ok(Outcome { name, image, routed })
}

/// Load an image archive and deploy it, as an upload or a notice brings one. The archive is gone
/// afterwards whatever happened, so a refused one does not wait on disk for the next.
pub async fn from_archive(
	host: &Host,
	name: &str,
	manifest: Manifest,
	archive: &Path,
) -> Result<Outcome, Error> {
	let deployed = async {
		admit(host, name, &manifest)?;
		// One deploy at a time on a node: two would snapshot, stop and route over each other.
		let _one = host.deploying.lock().await;
		let file = tokio::fs::File::open(archive).await.map_err(Error::Archive)?;
		let loaded = host.engine.load(name, tokio_util::io::ReaderStream::new(file)).await;
		let image = loaded.map_err(Error::Load)?;
		deploy(host, manifest, image).await
	}
	.await;
	let _ = tokio::fs::remove_file(archive).await;
	deployed
}

/// Deploy what a CI run built for this node, once GitHub's record of the run says it may be.
/// host's own image is keeper's to deploy and is left to it. True when everything went, so a
/// notice that failed on the way can be taken again when GitHub delivers it again.
///
/// A run that built host is keeper's first: keeper replaces host and then passes the run on with
/// `host_done`, and only that notice is acted on here. Were both to act at once, each would stop
/// the other mid-deploy. See spec/architecture/host.md, "keeper has its own intake".
pub async fn from_run(host: Arc<Host>, run: u64, host_done: bool) -> bool {
	let Some(github) = host.github.as_ref() else {
		eprintln!("host: run {run}: this node has no GITHUB_ACTIONS_TOKEN");
		return false;
	};
	let artifacts = match github.artifacts(run).await {
		Ok(artifacts) => artifacts,
		Err(error) => {
			eprintln!("host: run {run}: {error}");
			return false;
		}
	};
	if !host_done && artifacts.iter().any(|artifact| artifact.app == "host") {
		eprintln!("host: run {run}: it built host, so keeper goes first and passes it back");
		// Not taken, so the notice keeper sends afterwards is.
		return false;
	}
	let mut whole = true;
	for artifact in artifacts.iter().filter(|artifact| artifact.app != "host") {
		let fetched = match github.fetch(artifact, &host.config.incoming).await {
			Ok(fetched) => fetched,
			Err(error) => {
				eprintln!("host: run {run}: {}: {error}", artifact.app);
				whole = false;
				continue;
			}
		};
		let manifest = match Manifest::parse(&fetched.declaration) {
			Ok(manifest) => manifest,
			Err(error) => {
				eprintln!("host: run {run}: {}: {error}", artifact.app);
				let _ = tokio::fs::remove_file(&fetched.image).await;
				continue;
			}
		};
		// Built for every node; deployed only where it is placed.
		if !manifest.placements.iter().any(|placement| placement == &host.config.node) {
			let _ = tokio::fs::remove_file(&fetched.image).await;
			continue;
		}
		match from_archive(&host, &artifact.app, manifest, &fetched.image).await {
			Ok(outcome) => eprintln!("host: run {run}: {} is {}", outcome.name, outcome.image),
			Err(error) => {
				eprintln!("host: run {run}: {}: {error}", artifact.app);
				whole = false;
			}
		}
	}
	whole
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

#[cfg(test)]
mod tests {
	use super::deployable;
	use deploy::manifest::Invalid;

	#[test]
	fn host_takes_keeper_and_any_app_but_not_itself() {
		assert!(deployable("geo").is_ok());
		// keeper is reserved for every app and still deployable by host, which is the whole of how
		// keeper arrives on a node; turning it away here once stopped the first one arriving.
		assert!(deployable("keeper").is_ok());
		assert_eq!(deployable("host"), Err(Invalid::Reserved("host".into())));
		assert_eq!(deployable("api"), Err(Invalid::Reserved("api".into())));
	}
}
