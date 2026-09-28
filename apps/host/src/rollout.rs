//! A deploy as host sees it: admit the declaration, replace the container through the shared
//! procedure, then record the new version, route it and collect what is no longer needed. See
//! spec/architecture/host.md.

use crate::store::{Action, Deployed, Source};
use crate::{Host, caddy, store};
use deploy::manifest::{Invalid, Manifest};
use deploy::replace::{self, replace};
use deploy::{Shape, Version, engine};
use std::collections::HashSet;
use std::path::{Path, PathBuf};
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
	#[error("host does not act on itself; keeper replaces it")]
	Itself,
	#[error("`{0}` is the platform's own: it is restarted, never stopped")]
	Platform(String),
	#[error("`{0}` is not an app this node runs")]
	NoSuchApp(String),
	#[error("`{0}` has no previous version to go back to")]
	NoPrevious(String),
	#[error("the snapshot from before `{0}`'s version was deployed is no longer kept")]
	NoSnapshot(String),
	#[error("only start, stop and restart act on a container as it is")]
	NotAnAct,
	#[error("the app's environment: {0}")]
	AppEnvironment(#[from] crate::environment::Error),
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

/// Whether host takes a deploy under this name at all: any app's, and keeper, the agent and Caddy,
/// the reserved names it deploys. host itself is keeper's to deploy.
pub fn deployable(name: &str) -> Result<(), Invalid> {
	if TAKEN.contains(&name) { Ok(()) } else { deploy::manifest::check_name(name) }
}

/// The platform's own that host deploys, each in the shape its name gives it.
const TAKEN: [&str; 3] = ["keeper", "agent", "caddy"];

/// Refuse what could not be run before anything is stopped.
pub fn admit(host: &Host, requested: &str, manifest: &Manifest) -> Result<(), Error> {
	deployable(requested)?;
	if TAKEN.contains(&requested) {
		manifest.check_own(requested, &host.config.node)?;
	} else {
		manifest.check(requested, &host.config.node)?;
	}
	let Some(container) = manifest.container.as_ref() else {
		return Err(deploy::manifest::Invalid::NoContainer(manifest.name.clone()).into());
	};
	// An app on a socket holds no port.
	let Some(port) = container.port else { return Ok(()) };
	let holder = host.store.apps()?.into_iter().find(|app| {
		app.manifest.name != manifest.name
			&& app.manifest.container.as_ref().and_then(|container| container.port) == Some(port)
	});
	if let Some(holder) = holder {
		return Err(Error::PortTaken { port, holder: holder.manifest.name });
	}
	Ok(())
}

/// How the node runs an app: keeper in the platform's shape, the agent as an observer, Caddy on the
/// edge, and every other app sandboxed. The last three read their own environment.
fn shape_of(host: &Host, name: &str) -> Result<Shape, Error> {
	if name == "keeper" {
		let path = &host.config.platform_env;
		let env = deploy::read_env(path)
			.map_err(|source| Error::Environment { path: path.display().to_string(), source })?;
		return Ok(Shape::Platform { env });
	}
	let env = crate::environment::variables(&host.volumes.root(name))?;
	Ok(match name {
		"agent" => Shape::Observer { env },
		"caddy" => Shape::Edge { env },
		_ => Shape::Sandboxed { env },
	})
}

/// The one step every action that runs a version shares: replace what runs with `next`, restoring
/// `restore` first, and answer with the snapshot taken before `next` started.
async fn run_version(
	host: &Host,
	next: &Version,
	current: Option<&Version>,
	restore: Option<&Path>,
) -> Result<PathBuf, Error> {
	let shape = shape_of(host, &next.manifest.name)?;
	let members = [host.config.own_container.as_str(), host.config.caddy.container.as_str()];
	let snapshot =
		replace(&host.engine, &host.volumes, &members, &shape, next, current, restore).await?;
	// A new Caddy is a new container, on none of the apps' networks yet.
	if next.manifest.name == host.config.caddy.container
		&& let Err(error) = attach(host).await
	{
		eprintln!("host: attaching the new Caddy: {error}");
	}
	Ok(snapshot)
}

/// Close event `id` with how `result` went, keeping the snapshot a success took.
fn close<T>(host: &Host, id: i64, result: &Result<(T, PathBuf), Error>) {
	let closed = match result {
		Ok((_, snapshot)) => {
			let snapshot = snapshot.display().to_string();
			host.store.finish(id, store::Outcome::Succeeded, Some(&snapshot), None)
		}
		Err(error) => host.store.finish(id, store::Outcome::Failed, None, Some(&error.to_string())),
	};
	if let Err(error) = closed {
		eprintln!("host: recording event {id}: {error}");
	}
}

/// Caddy follows the state, and images no version needs go.
async fn settle(host: &Host, name: String, image: String) -> Result<Outcome, Error> {
	let routed = route(host).await.map_err(|error| error.to_string());
	collect(host).await?;
	Ok(Outcome { name, image, routed })
}

/// Deploy a new version, as an upload or a CI run brings one. Explicit, so it ends a hold.
pub async fn deploy(
	host: &Host,
	manifest: Manifest,
	image: String,
	source: &Source,
) -> Result<Outcome, Error> {
	let name = manifest.name.clone();
	let id =
		host.store.record(&name, Action::Deploy, source, Some(&image), store::Outcome::Running)?;
	let result = async {
		let current = host
			.store
			.app(&name)?
			.map(|current| Version { manifest: current.manifest, image: current.image });
		let next = Version { manifest, image };
		let snapshot = run_version(host, &next, current.as_ref(), None).await?;
		host.store.put_app(&Deployed {
			manifest: next.manifest,
			image: next.image.clone(),
			previous: current,
			deployed_at: jiff::Timestamp::now().to_string(),
			held: false,
		})?;
		host.store.hold(&name, false)?;
		Ok((next.image, snapshot))
	}
	.await;
	close(host, id, &result);
	let (image, _) = result?;
	settle(host, name, image).await
}

/// Load an image archive and deploy it, as an upload or a notice brings one. The archive is gone
/// afterwards whatever happened, so a refused one does not wait on disk for the next.
pub async fn from_archive(
	host: &Host,
	name: &str,
	manifest: Manifest,
	archive: &Path,
	source: &Source,
) -> Result<Outcome, Error> {
	let deployed = async {
		admit(host, name, &manifest)?;
		// One deploy at a time on a node: two would snapshot, stop and route over each other.
		let _one = host.deploying.lock().await;
		let file = tokio::fs::File::open(archive).await.map_err(Error::Archive)?;
		let loaded = host.engine.load(name, tokio_util::io::ReaderStream::new(file)).await;
		let image = loaded.map_err(Error::Load)?;
		deploy(host, manifest, image, source).await
	}
	.await;
	let _ = tokio::fs::remove_file(archive).await;
	deployed
}

/// The platform's own three: the panel restarts them and never stops them, since each stopped takes
/// the panel or the way back with it. See spec/architecture/host.md, "What the panel can do to an
/// app".
pub const PLATFORM: [&str; 3] = ["host", "keeper", "caddy"];

/// What a restart must not wait for: host answering the request, and Caddy carrying it. The panel
/// is told first and the restart follows.
const ON_THE_WAY: [&str; 2] = ["host", "caddy"];

/// How long a restart on the way waits, so the answer saying it was asked has left.
const ANSWERED: std::time::Duration = std::time::Duration::from_millis(500);

/// host as it runs now, read back from its container's label, in the shape of any app. keeper
/// keeps no record and host none of itself, so it has no previous version here and is never held.
pub async fn itself(host: &Host) -> Result<Option<Deployed>, Error> {
	let fallback = Manifest::parse(include_str!("../service.toml"))?;
	let Some(version) = host.engine.current("host", &fallback).await? else { return Ok(None) };
	let deployed_at = host.engine.created("host").await?.unwrap_or_default();
	Ok(Some(Deployed {
		manifest: version.manifest,
		image: version.image,
		previous: None,
		deployed_at,
		held: false,
	}))
}

/// An app the panel may act on: one host runs, and not host itself, which cannot stop or replace
/// the program answering the request. See spec/architecture/host.md, "What the panel can do to an
/// app".
fn actionable(host: &Host, name: &str) -> Result<Deployed, Error> {
	if name == "host" {
		return Err(Error::Itself);
	}
	host.store.app(name)?.ok_or_else(|| Error::NoSuchApp(name.into()))
}

/// Run the current version again: a deploy of what already runs, which picks up a changed
/// environment.
pub async fn redeploy(host: &Host, name: &str) -> Result<Outcome, Error> {
	let _one = host.deploying.lock().await;
	let app = actionable(host, name)?;
	let source = Source::panel();
	let id = host.store.record(
		name,
		Action::Redeploy,
		&source,
		Some(&app.image),
		store::Outcome::Running,
	)?;
	let result = async {
		let current = Version { manifest: app.manifest.clone(), image: app.image.clone() };
		let snapshot = run_version(host, &current, Some(&current), None).await?;
		host.store.put_app(&Deployed { deployed_at: jiff::Timestamp::now().to_string(), ..app })?;
		host.store.hold(name, false)?;
		Ok(((), snapshot))
	}
	.await;
	close(host, id, &result);
	result?;
	let image = host.store.app(name)?.map(|app| app.image).unwrap_or_default();
	settle(host, name.into(), image).await
}

/// Whether a rollback with data can be offered: the snapshot from before the running version was
/// deployed is still among the ones kept.
pub fn restorable(host: &Host, app: &Deployed) -> Result<Option<PathBuf>, Error> {
	let recorded = host.store.snapshot_before(&app.manifest.name, &app.image)?;
	Ok(recorded.map(PathBuf::from).filter(|path| path.exists()))
}

/// Run the previous version instead of the current one. With `with_data`, the app's directory is
/// also put back as it was before the current version was deployed, and everything written since is
/// lost.
pub async fn rollback(host: &Host, name: &str, with_data: bool) -> Result<Outcome, Error> {
	let _one = host.deploying.lock().await;
	let app = actionable(host, name)?;
	let previous = app.previous.clone().ok_or_else(|| Error::NoPrevious(name.into()))?;
	let restore = if with_data {
		Some(restorable(host, &app)?.ok_or_else(|| Error::NoSnapshot(name.into()))?)
	} else {
		None
	};
	let action = if with_data { Action::RollbackWithData } else { Action::Rollback };
	let source = Source::panel();
	let id =
		host.store.record(name, action, &source, Some(&previous.image), store::Outcome::Running)?;
	let result = async {
		let current = Version { manifest: app.manifest.clone(), image: app.image.clone() };
		let snapshot = run_version(host, &previous, Some(&current), restore.as_deref()).await?;
		host.store.put_app(&Deployed {
			manifest: previous.manifest.clone(),
			image: previous.image.clone(),
			previous: Some(current),
			deployed_at: jiff::Timestamp::now().to_string(),
			held: false,
		})?;
		host.store.hold(name, false)?;
		Ok(((), snapshot))
	}
	.await;
	close(host, id, &result);
	result?;
	settle(host, name.into(), previous.image).await
}

/// Start, stop or restart the container as it is. A stop holds the app stopped; a start or a
/// restart ends the hold. The platform's own are restarted and nothing else.
pub async fn act(host: &Arc<Host>, name: &str, action: Action) -> Result<(), Error> {
	permitted(name, action)?;
	if ON_THE_WAY.contains(&name) {
		return restart_later(host, name).await;
	}
	let _one = host.deploying.lock().await;
	let app = actionable(host, name)?;
	let source = Source::panel();
	let id = host.store.record(name, action, &source, Some(&app.image), store::Outcome::Running)?;
	let done = match action {
		Action::Start => host.engine.start(name).await,
		Action::Stop => host.engine.stop(name).await,
		Action::Restart => host.engine.restart(name).await,
		_ => return Err(Error::NotAnAct),
	};
	let (outcome, detail) = match &done {
		Ok(()) => (store::Outcome::Succeeded, None),
		Err(error) => (store::Outcome::Failed, Some(error.to_string())),
	};
	host.store.finish(id, outcome, None, detail.as_deref())?;
	done?;
	host.store.hold(name, action == Action::Stop)?;
	Ok(())
}

/// Whether the panel may do this to the container at all, before anything is asked of Docker.
fn permitted(name: &str, action: Action) -> Result<(), Error> {
	if PLATFORM.contains(&name) && action != Action::Restart {
		return Err(Error::Platform(name.into()));
	}
	Ok(())
}

/// A restart of what carries the request: recorded, answered, and only then done. host's own is
/// recorded as done when asked, since nothing of it is left to finish the record once it restarts.
async fn restart_later(host: &Arc<Host>, name: &str) -> Result<(), Error> {
	let image = match name {
		"host" => itself(host).await?.map(|app| app.image),
		_ => Some(actionable(host, name)?.image),
	};
	let source = Source::panel();
	let outcome = if name == "host" { store::Outcome::Succeeded } else { store::Outcome::Running };
	let id = host.store.record(name, Action::Restart, &source, image.as_deref(), outcome)?;
	let host = host.clone();
	let name = name.to_owned();
	tokio::spawn(async move {
		tokio::time::sleep(ANSWERED).await;
		let _one = host.deploying.lock().await;
		let done = host.engine.restart(&name).await;
		if let Err(error) = &done {
			eprintln!("host: restarting {name}: {error}");
		}
		if name != "host" {
			let (outcome, detail) = match &done {
				Ok(()) => (store::Outcome::Succeeded, None),
				Err(error) => (store::Outcome::Failed, Some(error.to_string())),
			};
			let _ = host.store.finish(id, outcome, None, detail.as_deref());
		}
	});
	Ok(())
}

/// Deploy what a CI run built for this node, once GitHub's record of the run says it may be.
/// host's own image is keeper's to deploy and is left to it. True when everything went, so a
/// notice that failed on the way can be taken again when GitHub delivers it again.
///
/// A run that built host is keeper's first: keeper replaces host and then passes the run on with
/// `host_replaced`, and only that notice is acted on here. Were both to act at once, each would
/// stop the other mid-deploy. See spec/architecture/host.md, "keeper has its own intake".
pub async fn from_run(host: Arc<Host>, run: u64, host_replaced: bool) -> bool {
	let Some(github) = host.github.as_ref() else {
		eprintln!("host: run {run}: this node has no GITHUB_ACTIONS_TOKEN");
		return false;
	};
	let (commit, artifacts) = match github.artifacts(run).await {
		Ok(built) => (built.commit, built.artifacts),
		Err(error) => {
			eprintln!("host: run {run}: {error}");
			return false;
		}
	};
	if !host_replaced && artifacts.iter().any(|artifact| artifact.app == "host") {
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
		let source = Source::run(run, commit.clone());
		// Held stopped from the panel: the run is recorded, not started. See
		// spec/architecture/host.md, "A stop holds until a start".
		if host.store.app(&artifact.app).ok().flatten().is_some_and(|app| app.held) {
			let skipped = store::Outcome::Skipped;
			let _ = host.store.record(&artifact.app, Action::Deploy, &source, None, skipped);
			let _ = tokio::fs::remove_file(&fetched.image).await;
			eprintln!("host: run {run}: {} is held stopped, so it was not deployed", artifact.app);
			continue;
		}
		match from_archive(&host, &artifact.app, manifest, &fetched.image, &source).await {
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
	// The agent has no network, and Caddy stands on the edge rather than on one of its own.
	for app in host.store.apps()? {
		let name = app.manifest.name.as_str();
		if name != "agent" && name != host.config.caddy.container {
			host.engine.network(name, &members).await?;
		}
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
	fn the_platforms_own_are_restarted_and_never_stopped_or_started() {
		use super::{Error, permitted};
		use crate::store::Action;
		for name in ["host", "keeper", "caddy"] {
			assert!(permitted(name, Action::Restart).is_ok(), "{name}");
			for action in [Action::Stop, Action::Start] {
				assert!(matches!(permitted(name, action), Err(Error::Platform(_))), "{name}");
			}
		}
		for action in [Action::Stop, Action::Start, Action::Restart] {
			assert!(permitted("geo", action).is_ok());
			assert!(permitted("agent", action).is_ok());
		}
	}

	#[test]
	fn host_takes_keeper_and_any_app_but_not_itself() {
		assert!(deployable("geo").is_ok());
		// keeper is reserved for every app and still deployable by host, which is the whole of how
		// keeper arrives on a node; turning it away here once stopped the first one arriving.
		assert!(deployable("keeper").is_ok());
		assert!(deployable("agent").is_ok());
		assert!(deployable("caddy").is_ok());
		assert_eq!(deployable("host"), Err(Invalid::Reserved("host".into())));
		assert_eq!(deployable("api"), Err(Invalid::Reserved("api".into())));
	}
}
