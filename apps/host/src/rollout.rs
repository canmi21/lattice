//! A deploy as host sees it: admit the declaration, replace the container through the shared
//! procedure, then record the new version, route it and collect what is no longer needed. See
//! spec/architecture/host.md.

use crate::sidecars::{self, drive};
use crate::store::{Action, Deployed, Source};
use crate::{Host, caddy, store};
use deploy::manifest::{Invalid, Manifest, OBJECTS};
use deploy::replace::{self, Beside, replace_beside};
use deploy::sidecar::Driver;
use deploy::{Shape, Version, engine};
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::Arc;

#[derive(Debug, thiserror::Error)]
pub enum Error {
	#[error(transparent)]
	Invalid(#[from] Invalid),
	#[error("the resolver needs the node's LAN address, `LAN_ADDRESS`, to publish DNS on")]
	NoLanAddress,
	#[error("writing the resolver's configuration: {0}")]
	Resolver(#[from] caddy::Error),
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
	#[error("`{0}` declares `[{1}]`, and `{1}`, the driver, is not deployed on this node")]
	NoDriver(String, &'static str),
	#[error("`{0}` is the driver every sidecar runs, and has no container of its own to act on")]
	Driver(String),
}

#[derive(Debug, serde::Serialize)]
pub struct Outcome {
	pub name: String,
	pub image: String,
	/// Whether Caddy took the new configuration. A deploy that ran but could not be routed is
	/// still a deploy; this says which half is missing.
	pub routed: Result<(), String>,
}

/// Whether host takes a deploy under this name at all: any app's, and keeper, the meter, Caddy, the
/// tunnel and the panel, the reserved names it deploys. host itself is keeper's to deploy.
pub fn deployable(name: &str) -> Result<(), Invalid> {
	if TAKEN.contains(&name) { Ok(()) } else { deploy::manifest::check_name(name) }
}

/// The platform's own that host deploys, each in the shape its name gives it; a driver runs none.
const TAKEN: [&str; 12] = [
	"keeper",
	"meter",
	"caddy",
	"tunnel",
	"panel",
	OBJECTS,
	"postgres",
	"cron",
	"apt",
	"telemetry",
	"gateway",
	RESOLVER,
];

/// The house's DNS, in a shape of its own and with its configuration written before it starts.
const RESOLVER: &str = "resolver";

/// The panel's name: the one app host's own network admits.
const PANEL: &str = "panel";

/// The platform's own that stand on no network of their own: the meter has none, Caddy and the
/// tunnel stand on the edge, and a driver runs no container.
const UNNETWORKED: [&str; 5] = ["meter", "caddy", "tunnel", OBJECTS, "postgres"];

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
	for driver in manifest.drivers() {
		if host.store.app(driver.name())?.is_none() {
			return Err(Error::NoDriver(manifest.name.clone(), driver.name()));
		}
	}
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

/// How the node runs an app: keeper in the platform's shape, the meter as an observer, Caddy on the
/// edge, the tunnel at the address Caddy trusts, `cron` as the scheduler with every socket-served
/// service it schedules mounted in, `apt` as the steward, `telemetry` as the reporter with the
/// meter's directory mounted in, and every other app sandboxed. All but keeper read their own
/// environment.
fn shape_of(host: &Host, name: &str) -> Result<Shape, Error> {
	if name == "keeper" {
		let path = &host.config.platform_env;
		let env = deploy::read_env(path)
			.map_err(|source| Error::Environment { path: path.display().to_string(), source })?;
		return Ok(Shape::Platform { env });
	}
	let env = crate::environment::variables(&host.volumes.root(name))?;
	let sockets = || {
		Ok(
			crate::cron::socket_services(&host.store.apps()?)
				.into_iter()
				.map(|service| {
					let directory = host.volumes.data(&service);
					(service, directory)
				})
				.collect(),
		)
	};
	let placed = Placed {
		tunnel: &host.config.caddy.tunnel_source,
		meter: host.volumes.data(crate::node::METER),
		lan: host.config.resolver.address.as_deref(),
	};
	shape_named(name, env, placed, sockets)
}

/// What a shape is given from the node beside its environment.
struct Placed<'a> {
	/// The one address Caddy believes a visitor's address from.
	tunnel: &'a str,
	/// The meter's data directory, which the reporter shape mounts.
	meter: PathBuf,
	/// The node's LAN address, which the resolver publishes DNS on; absent where it runs none.
	lan: Option<&'a str>,
}

/// `shape_of` for every name but keeper's, apart from the host it reads: the choice by name alone.
/// `sockets` is asked only for `cron`, since it reads the store.
fn shape_named(
	name: &str,
	env: Vec<String>,
	placed: Placed<'_>,
	sockets: impl FnOnce() -> Result<Vec<(String, PathBuf)>, Error>,
) -> Result<Shape, Error> {
	Ok(match name {
		crate::node::METER => Shape::Observer { env },
		"caddy" => Shape::Edge { env },
		"tunnel" => Shape::Tunnel { env, address: placed.tunnel.to_owned() },
		crate::cron::NAME => Shape::Scheduler { env, sockets: sockets()? },
		"apt" => Shape::Steward { env },
		crate::telemetry::NAME => Shape::Reporter { env, meter: placed.meter },
		RESOLVER => {
			let address = placed.lan.ok_or(Error::NoLanAddress)?;
			Shape::Resolver { env, address: address.to_owned() }
		}
		_ => Shape::Sandboxed { env },
	})
}

/// Every name in `binding` in place of whatever the app's own files said under it.
pub(crate) fn bound(env: &mut Vec<String>, binding: Vec<String>) {
	let names: Vec<String> = binding
		.iter()
		.filter_map(|line| line.split_once('='))
		.map(|(name, _)| format!("{name}="))
		.collect();
	env.retain(|line| !names.iter().any(|name| line.starts_with(name.as_str())));
	env.extend(binding);
}

/// The one step every action that runs a version shares: replace what runs with `next`, restoring
/// `restore` first, and answer with the snapshot taken before `next` started. A driver has no
/// container and so no snapshot: running it is moving every sidecar of its kind onto it.
async fn run_version(
	host: &Host,
	next: &Version,
	current: Option<&Version>,
	restore: Option<&Path>,
) -> Result<Option<PathBuf>, Error> {
	if let Some(kind) = Driver::named(&next.manifest.name) {
		drive(host, kind, next, current).await?;
		return Ok(None);
	}
	let mut shape = shape_of(host, &next.manifest.name)?;
	// CoreDNS will not start without its file, so it is written before the container is.
	if next.manifest.name == RESOLVER {
		crate::resolver::apply(&host.config.resolver, &[]).await?;
	}
	let members = [host.config.own_container.as_str(), host.config.caddy.container.as_str()];
	let driver = sidecars::driver(host, Driver::Objects)?;
	let beside_next = sidecars::sidecars_for(host, &next.manifest).await?;
	let beside_current = match current {
		Some(current) => sidecars::sidecars_for(host, &current.manifest).await?,
		None => Vec::new(),
	};
	// cron and apt declare no `[objects]`, so binding always no-ops for them; only the shapes that
	// could carry a sidecar's address need the match at all.
	if let Some(driver) = &driver
		&& let Shape::Sandboxed { env }
		| Shape::Platform { env }
		| Shape::Observer { env }
		| Shape::Edge { env }
		| Shape::Tunnel { env, .. } = &mut shape
	{
		bound(env, sidecars::binding(&next.manifest, &driver.manifest));
	}
	// The tunnel has no network of its own for host to ask its health on; host stands on the edge.
	if matches!(shape, Shape::Tunnel { .. }) {
		host.engine.join(deploy::engine::EDGE_NETWORK, &members[..1], false).await?;
	}
	let beside = Beside { next: &beside_next, current: &beside_current };
	let snapshot =
		replace_beside(&host.engine, &host.volumes, &members, &shape, next, current, restore, beside)
			.await?;
	// The panel reaches host on host's own network, which nothing else but keeper joins.
	if next.manifest.name == PANEL {
		host
			.engine
			.join(&deploy::engine::network_of(&host.config.own_container), &[PANEL], false)
			.await?;
	}
	// A new Caddy is a new container, on none of the apps' networks yet.
	if next.manifest.name == host.config.caddy.container
		&& let Err(error) = attach(host).await
	{
		eprintln!("host: attaching the new Caddy: {error}");
	}
	Ok(Some(snapshot))
}

/// Close event `id` with how `result` went, keeping the snapshot a success took.
fn close<T>(host: &Host, id: i64, result: &Result<(T, Option<PathBuf>), Error>) {
	let closed = match result {
		Ok((_, snapshot)) => {
			let snapshot = snapshot.as_ref().map(|snapshot| snapshot.display().to_string());
			host.store.finish(id, store::Outcome::Succeeded, snapshot.as_deref(), None)
		}
		Err(error) => host.store.finish(id, store::Outcome::Failed, None, Some(&error.to_string())),
	};
	if let Err(error) = closed {
		eprintln!("host: recording event {id}: {error}");
	}
}

/// Caddy follows the state, and images no version needs go.
async fn settle(host: &Arc<Host>, name: String, image: String) -> Result<Outcome, Error> {
	let routed = route(host).await.map_err(|error| error.to_string());
	collect(host).await?;
	tell_cron(host).await;
	tell_telemetry(host).await;
	Ok(Outcome { name, image, routed })
}

/// Write telemetry's `services.json` from the state as it now is: at start, and after a deploy, a
/// redeploy, a rollback, a stop or a start. Logged and skipped rather than failing the caller, as
/// `tell_cron` is. See spec/architecture/telemetry.md, "`services.json`, what host tells".
pub async fn tell_telemetry(host: &Host) {
	let directory = host.volumes.data(crate::telemetry::NAME);
	if let Err(error) = crate::telemetry::write(&host.store, &directory).await {
		eprintln!("host: writing telemetry's services: {error}");
	}
}

/// Write `cron`'s schedule table from the state as it now is: what a deploy, a redeploy or a
/// rollback leaves behind, or what is already there at start. Logged and skipped rather than
/// failing the caller -- as `node::tell` is for the meter -- and skipped outright when `cron` has
/// no directory yet. See spec/architecture/cron.md, "host gives `cron` the table".
///
/// A mount change redeploys `cron` on a spawned background task, never inline -- this runs under
/// `host.deploying`, already held by whoever called it, and taking that lock again would deadlock.
pub async fn tell_cron(host: &Arc<Host>) {
	let apps = match host.store.apps() {
		Ok(apps) => apps,
		Err(error) => {
			eprintln!("host: reading apps for cron's schedule table: {error}");
			return;
		}
	};
	let directory = host.volumes.data(crate::cron::NAME);
	if let Err(error) = crate::cron::write(&apps, &directory).await {
		eprintln!("host: writing cron's schedule table: {error}");
		return;
	}
	if host.store.app(crate::cron::NAME).ok().flatten().is_none() {
		return;
	}
	let desired = crate::cron::socket_services(&apps);
	let mounted = match host.engine.socket_mounts(crate::cron::NAME).await {
		Ok(mounted) => mounted,
		Err(error) => {
			eprintln!("host: reading cron's own mounts: {error}");
			return;
		}
	};
	if !crate::cron::mounts_changed(&desired, &mounted) {
		return;
	}
	let recently = {
		let redeployed_at = host.cron_mount_redeployed_at.lock().unwrap();
		redeployed_at.is_some_and(|at| at.elapsed() < CRON_MOUNT_REDEPLOY_COOLDOWN)
	};
	if recently {
		eprintln!(
			"host: cron's socket services still differ (had {}, want {}) after a recent redeploy for \
			 them; not redeploying again so soon",
			mounted.join(", "),
			desired.join(", ")
		);
		return;
	}
	eprintln!(
		"host: cron's socket services changed (had {}, now {}); redeploying it for its mounts",
		mounted.join(", "),
		desired.join(", ")
	);
	*host.cron_mount_redeployed_at.lock().unwrap() = Some(std::time::Instant::now());
	tokio::spawn(redeploy_cron(host.clone()));
}

/// How long `tell_cron` waits after redeploying `cron` for its mounts before it will do so again,
/// even if the read-back still disagrees -- the guard against the loop a mount-prefix bug once
/// caused, where the redeploy never made the read-back agree and `tell_cron` ran it every time.
const CRON_MOUNT_REDEPLOY_COOLDOWN: std::time::Duration = std::time::Duration::from_secs(300);

/// `redeploy(host, "cron")`, boxed. `tell_cron` runs inside `settle`, which `redeploy` itself ends
/// with, so a plain `async move { redeploy(...).await }` here would make this function's future
/// embed `redeploy`'s, which embeds `settle`'s, which embeds this function's again -- a type with
/// no fixed size. Naming the return type erases it at this one edge, so the cycle closes through a
/// trait object instead of an infinitely nested one.
fn redeploy_cron(
	host: Arc<Host>,
) -> std::pin::Pin<Box<dyn std::future::Future<Output = ()> + Send>> {
	Box::pin(async move {
		if let Err(error) = redeploy(&host, crate::cron::NAME).await {
			eprintln!("host: redeploying cron for its mounts: {error}");
		}
	})
}

/// Deploy a new version, as an upload or a CI run brings one. Explicit, so it ends a hold.
pub async fn deploy(
	host: &Arc<Host>,
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
	host: &Arc<Host>,
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

/// The platform's own five: the panel restarts them and never stops them, since each stopped takes
/// the panel, the way in or the way back with it. See spec/architecture/host.md, "What the panel
/// can do to an app".
pub const PLATFORM: [&str; 5] = ["host", "keeper", "caddy", "tunnel", "panel"];

/// What a restart must not wait for: host answering the request, and Caddy and the panel carrying
/// it. The panel is told first and the restart follows.
const ON_THE_WAY: [&str; 3] = ["host", "caddy", "panel"];

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
pub async fn redeploy(host: &Arc<Host>, name: &str) -> Result<Outcome, Error> {
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
pub async fn rollback(host: &Arc<Host>, name: &str, with_data: bool) -> Result<Outcome, Error> {
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
	if Driver::named(name).is_some() {
		return Err(Error::Driver(name.into()));
	}
	if ON_THE_WAY.contains(&name) {
		return restart_later(host, name).await;
	}
	let _one = host.deploying.lock().await;
	let app = actionable(host, name)?;
	let source = Source::panel();
	let id = host.store.record(name, action, &source, Some(&app.image), store::Outcome::Running)?;
	// Sidecars are up before their app and down after it. See spec/architecture/objects.md.
	let sidecars = app.manifest.sidecars();
	let done = async {
		for sidecar in &sidecars {
			match action {
				Action::Start => host.engine.start(sidecar).await?,
				Action::Restart => host.engine.restart(sidecar).await?,
				_ => {}
			}
		}
		match action {
			Action::Start => host.engine.start(name).await?,
			Action::Stop => host.engine.stop(name).await?,
			Action::Restart => host.engine.restart(name).await?,
			_ => return Err(Error::NotAnAct),
		}
		if action == Action::Stop {
			for sidecar in &sidecars {
				host.engine.stop(sidecar).await?;
			}
		}
		Ok(())
	}
	.await;
	if matches!(done, Err(Error::NotAnAct)) {
		return Err(Error::NotAnAct);
	}
	let (outcome, detail) = match &done {
		Ok(()) => (store::Outcome::Succeeded, None),
		Err(error) => (store::Outcome::Failed, Some(error.to_string())),
	};
	host.store.finish(id, outcome, None, detail.as_deref())?;
	done?;
	host.store.hold(name, action == Action::Stop)?;
	tell_telemetry(host).await;
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
	crate::resolver::apply(&host.config.resolver, &[]).await?;
	Ok(())
}

pub fn render(host: &Host) -> Result<serde_json::Value, store::Error> {
	Ok(caddy::render(&host.config.caddy, &host.store.apps()?, &host.store.routes()?))
}

/// Attach Caddy and host to every app's network again. A Caddy container that was recreated
/// rather than restarted comes back attached to none of them.
pub async fn attach(host: &Host) -> Result<(), RouteError> {
	let members = [host.config.own_container.as_str(), host.config.caddy.container.as_str()];
	// host's own network is the panel's and keeper's, never Caddy's: nothing is routed to host.
	let own = deploy::engine::network_of(&host.config.own_container);
	host.engine.network(&host.config.own_container, &members[..1]).await?;
	host.engine.leave(&own, &members[1..]).await?;
	if host.store.app(PANEL)?.is_some() {
		host.engine.join(&own, &[PANEL], false).await?;
	}
	for app in host.store.apps()? {
		let name = app.manifest.name.as_str();
		if !UNNETWORKED.contains(&name) && name != host.config.caddy.container {
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
	use super::{TAKEN, deployable};
	use deploy::manifest::{Invalid, OWN};

	#[test]
	fn deploys_every_name_the_platform_owns_but_its_own() {
		// host is deployed by keeper, never by itself; every other name the manifest reserves for
		// the platform is one this host deploys, so the two lists cannot drift apart.
		let deployed: Vec<&str> = OWN.into_iter().filter(|name| *name != "host").collect();
		assert_eq!(deployed.len(), TAKEN.len());
		assert!(deployed.iter().all(|name| TAKEN.contains(name)), "{deployed:?}");
	}

	#[test]
	fn the_platforms_own_are_restarted_and_never_stopped_or_started() {
		use super::{Error, permitted};
		use crate::store::Action;
		for name in ["host", "keeper", "caddy", "tunnel", "panel"] {
			assert!(permitted(name, Action::Restart).is_ok(), "{name}");
			for action in [Action::Stop, Action::Start] {
				assert!(matches!(permitted(name, action), Err(Error::Platform(_))), "{name}");
			}
		}
		for action in [Action::Stop, Action::Start, Action::Restart] {
			assert!(permitted("geo", action).is_ok());
			assert!(permitted("meter", action).is_ok());
		}
	}

	#[test]
	fn host_takes_keeper_and_any_app_but_not_itself() {
		assert!(deployable("geo").is_ok());
		// keeper is reserved for every app and still deployable by host, which is the whole of how
		// keeper arrives on a node; turning it away here once stopped the first one arriving.
		assert!(deployable("keeper").is_ok());
		assert!(deployable("meter").is_ok());
		assert!(deployable("caddy").is_ok());
		assert!(deployable("tunnel").is_ok());
		assert!(deployable("panel").is_ok());
		assert!(deployable("objects").is_ok());
		assert!(deployable("postgres").is_ok());
		assert_eq!(deployable("geo-postgres"), Err(Invalid::Reserved("geo-postgres".into())));
		assert_eq!(deployable("host"), Err(Invalid::Reserved("host".into())));
		assert_eq!(deployable("api"), Err(Invalid::Reserved("api".into())));
		assert_eq!(deployable("geo-objects"), Err(Invalid::Reserved("geo-objects".into())));
	}

	#[test]
	fn telemetry_is_the_reporter_with_the_meters_directory() {
		use super::{Placed, shape_named};
		use deploy::Shape;
		use std::path::PathBuf;
		let placed = || Placed {
			tunnel: "172.30.0.2",
			meter: PathBuf::from("/data/apps/meter/data"),
			lan: Some("10.0.0.11"),
		};
		let unasked = || -> Result<Vec<(String, PathBuf)>, super::Error> {
			panic!("only cron's shape reads the store")
		};
		let shape = shape_named("telemetry", vec!["A=1".into()], placed(), unasked).unwrap();
		let Shape::Reporter { env, meter } = shape else { panic!("{shape:?}") };
		assert_eq!((env, meter), (vec!["A=1".to_owned()], PathBuf::from("/data/apps/meter/data")));
		let geo = shape_named("geo", vec![], placed(), unasked).unwrap();
		assert!(matches!(geo, Shape::Sandboxed { .. }));
		let meter = shape_named("meter", vec![], placed(), unasked).unwrap();
		assert!(matches!(meter, Shape::Observer { .. }));
		let cron = shape_named("cron", vec![], placed(), || Ok(vec![])).unwrap();
		assert!(matches!(cron, Shape::Scheduler { .. }));
		let resolver = shape_named("resolver", vec![], placed(), unasked).unwrap();
		let Shape::Resolver { address, .. } = resolver else { panic!("{resolver:?}") };
		assert_eq!(address, "10.0.0.11");
		let nowhere = Placed { lan: None, ..placed() };
		assert!(matches!(
			shape_named("resolver", vec![], nowhere, unasked),
			Err(super::Error::NoLanAddress)
		));
	}
}
