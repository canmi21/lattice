//! A deploy as host sees it: admit the declaration, replace the container through the shared
//! procedure, then record the new version, route it and collect what is no longer needed. See
//! spec/architecture/host.md.

use crate::environment::Credentials;
use crate::store::{Action, Deployed, Source};
use crate::{Host, caddy, store};
use deploy::engine::Sidecar;
use deploy::manifest::{Invalid, Manifest, OBJECTS};
use deploy::replace::{self, Beside, replace_beside};
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
	#[error("`{0}` declares `[objects]`, and `objects`, the driver, is not deployed on this node")]
	NoDriver(String),
	#[error("`objects` is the driver every sidecar runs, and has no container of its own to act on")]
	Driver,
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

/// The platform's own that host deploys, each in the shape its name gives it; `objects` runs none.
const TAKEN: [&str; 8] = ["keeper", "meter", "caddy", "tunnel", "panel", OBJECTS, "cron", "apt"];

/// The panel's name: the one app host's own network admits.
const PANEL: &str = "panel";

/// The platform's own that stand on no network of their own: the meter has none, Caddy and the
/// tunnel stand on the edge, and the object storage driver runs no container.
const UNNETWORKED: [&str; 4] = ["meter", "caddy", "tunnel", OBJECTS];

/// The region every sidecar answers as and every app is told. Versity's own default; one node is
/// one region, and a client insists only that it be named.
const REGION: &str = "us-east-1";

/// Where a sidecar mounts the app's `objects/`.
const OBJECTS_TARGET: &str = "/data";

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
	if manifest.objects.is_some() && host.store.app(OBJECTS)?.is_none() {
		return Err(Error::NoDriver(manifest.name.clone()));
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
/// service it schedules mounted in, `apt` as the steward, and every other app sandboxed. All but
/// keeper read their own environment.
fn shape_of(host: &Host, name: &str) -> Result<Shape, Error> {
	if name == "keeper" {
		let path = &host.config.platform_env;
		let env = deploy::read_env(path)
			.map_err(|source| Error::Environment { path: path.display().to_string(), source })?;
		return Ok(Shape::Platform { env });
	}
	let env = crate::environment::variables(&host.volumes.root(name))?;
	Ok(match name {
		"meter" => Shape::Observer { env },
		"caddy" => Shape::Edge { env },
		"tunnel" => Shape::Tunnel { env, address: host.config.caddy.tunnel_source.clone() },
		"cron" => {
			let sockets = crate::cron::socket_services(&host.store.apps()?)
				.into_iter()
				.map(|service| {
					let directory = host.volumes.data(&service);
					(service, directory)
				})
				.collect();
			Shape::Scheduler { env, sockets }
		}
		"apt" => Shape::Steward { env },
		_ => Shape::Sandboxed { env },
	})
}

/// What an app declaring `[objects]` is told beside its credentials, which are in its `secret.env`
/// already: where its sidecar answers, as what region, and its buckets. See
/// spec/architecture/objects.md, "A sidecar per app, over the app's own directory".
fn binding(app: &Manifest, driver: &Manifest) -> Vec<String> {
	let (Some(objects), Some(sidecar)) = (&app.objects, app.sidecar()) else { return Vec::new() };
	let port = driver.container.as_ref().and_then(|container| container.port).unwrap_or_default();
	vec![
		format!("S3_ENDPOINT=http://{sidecar}:{port}"),
		format!("S3_REGION={REGION}"),
		format!("S3_BUCKETS={}", objects.buckets.join(",")),
	]
}

/// The sidecar an app declaring `[objects]` runs beside it on the driver's current image: its
/// `objects/` alone, the app's credentials as its root account, and the driver's port, health and
/// memory. None for an app that declares none.
fn sidecar_of(
	root: &Path,
	app: &Manifest,
	driver: &Version,
	credentials: &Credentials,
) -> Option<Sidecar> {
	let objects = app.objects.as_ref()?;
	let container = driver.manifest.container.as_ref();
	let port = container.and_then(|container| container.port).unwrap_or_default();
	let health = container.map_or_else(|| "/".into(), |container| container.health.clone());
	Some(Sidecar {
		name: app.sidecar()?,
		app: app.name.clone(),
		image: driver.image.clone(),
		env: vec![
			format!("ROOT_ACCESS_KEY_ID={}", credentials.access_key_id),
			format!("ROOT_SECRET_ACCESS_KEY={}", credentials.secret_access_key),
			format!("VGW_PORT=:{port}"),
			format!("VGW_REGION={REGION}"),
			format!("VGW_HEALTH={health}"),
		],
		source: root.join("objects"),
		target: OBJECTS_TARGET.into(),
		directories: objects.buckets.clone(),
		port,
		health,
		memory_mb: container.and_then(|container| container.memory_mb),
	})
}

/// The driver as this node runs it, when it is deployed.
fn driver(host: &Host) -> Result<Option<Version>, Error> {
	let driver = host.store.app(OBJECTS)?;
	Ok(driver.map(|driver| Version { manifest: driver.manifest, image: driver.image }))
}

/// The sidecar `app` runs on `driver`, its credentials made when it has none yet. Its subvolume is
/// made first, so the credentials are never written into a plain directory in its place.
async fn sidecar_for(
	host: &Host,
	app: &Manifest,
	driver: Option<&Version>,
) -> Result<Option<Sidecar>, Error> {
	if app.objects.is_none() {
		return Ok(None);
	}
	let driver = driver.ok_or_else(|| Error::NoDriver(app.name.clone()))?;
	host.volumes.ensure(&app.name).await.map_err(replace::Error::from)?;
	let root = host.volumes.root(&app.name);
	let credentials = crate::environment::credentials(&root)?;
	Ok(sidecar_of(&root, app, driver, &credentials))
}

/// Every name in `binding` in place of whatever the app's own files said under it.
fn bound(env: &mut Vec<String>, binding: Vec<String>) {
	let names: Vec<String> = binding
		.iter()
		.filter_map(|line| line.split_once('='))
		.map(|(name, _)| format!("{name}="))
		.collect();
	env.retain(|line| !names.iter().any(|name| line.starts_with(name.as_str())));
	env.extend(binding);
}

/// The one step every action that runs a version shares: replace what runs with `next`, restoring
/// `restore` first, and answer with the snapshot taken before `next` started. The driver has no
/// container and so no snapshot: running it is moving every sidecar onto it.
async fn run_version(
	host: &Host,
	next: &Version,
	current: Option<&Version>,
	restore: Option<&Path>,
) -> Result<Option<PathBuf>, Error> {
	if next.manifest.name == OBJECTS {
		drive(host, next, current).await?;
		return Ok(None);
	}
	let mut shape = shape_of(host, &next.manifest.name)?;
	let members = [host.config.own_container.as_str(), host.config.caddy.container.as_str()];
	let driver = driver(host)?;
	let beside_next = sidecar_for(host, &next.manifest, driver.as_ref()).await?;
	let beside_current = match current {
		Some(current) => sidecar_for(host, &current.manifest, driver.as_ref()).await?,
		None => None,
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
		bound(env, binding(&next.manifest, &driver.manifest));
	}
	// The tunnel has no network of its own for host to ask its health on; host stands on the edge.
	if matches!(shape, Shape::Tunnel { .. }) {
		host.engine.join(deploy::engine::EDGE_NETWORK, &members[..1], false).await?;
	}
	let beside = Beside { next: beside_next.as_ref(), current: beside_current.as_ref() };
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

/// Run the driver: recreate every app's sidecar on `next`, one app at a time, leaving a held app's
/// stopped. When one fails, every sidecar already moved goes back to `current`, and the deploy
/// fails. See spec/architecture/objects.md, "The driver is deployed like an app, and is not one".
async fn drive(host: &Host, next: &Version, current: Option<&Version>) -> Result<(), Error> {
	let members = [host.config.own_container.as_str(), host.config.caddy.container.as_str()];
	let apps: Vec<Deployed> =
		host.store.apps()?.into_iter().filter(|app| app.manifest.objects.is_some()).collect();
	let mut moved = Vec::new();
	let mut failure = None;
	for app in &apps {
		moved.push(app);
		let ran = async {
			host.engine.network(&app.manifest.name, &members).await?;
			let Some(sidecar) = sidecar_for(host, &app.manifest, Some(next)).await? else {
				return Ok(());
			};
			replace::sidecar(&host.engine, &host.volumes, &sidecar).await?;
			if app.held {
				host.engine.stop(&sidecar.name).await?;
			}
			Ok::<_, Error>(())
		}
		.await;
		if let Err(error) = ran {
			failure = Some(error);
			break;
		}
	}
	let Some(failure) = failure else { return Ok(()) };
	if let Some(current) = current {
		for app in moved {
			let back = async {
				let Some(sidecar) = sidecar_for(host, &app.manifest, Some(current)).await? else {
					return Ok(());
				};
				replace::sidecar(&host.engine, &host.volumes, &sidecar).await?;
				if app.held {
					host.engine.stop(&sidecar.name).await?;
				}
				Ok::<_, Error>(())
			};
			if let Err(error) = back.await {
				eprintln!("host: putting {}'s sidecar back: {error}", app.manifest.name);
			}
		}
	}
	Err(failure)
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
	Ok(Outcome { name, image, routed })
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
	if name == OBJECTS {
		return Err(Error::Driver);
	}
	if ON_THE_WAY.contains(&name) {
		return restart_later(host, name).await;
	}
	let _one = host.deploying.lock().await;
	let app = actionable(host, name)?;
	let source = Source::panel();
	let id = host.store.record(name, action, &source, Some(&app.image), store::Outcome::Running)?;
	// The sidecar is up before its app and down after it. See spec/architecture/objects.md.
	let sidecar = app.manifest.sidecar();
	let done = async {
		match (action, sidecar.as_deref()) {
			(Action::Start, Some(sidecar)) => host.engine.start(sidecar).await?,
			(Action::Restart, Some(sidecar)) => host.engine.restart(sidecar).await?,
			_ => {}
		}
		match action {
			Action::Start => host.engine.start(name).await?,
			Action::Stop => host.engine.stop(name).await?,
			Action::Restart => host.engine.restart(name).await?,
			_ => return Err(Error::NotAnAct),
		}
		if let (Action::Stop, Some(sidecar)) = (action, sidecar.as_deref()) {
			host.engine.stop(sidecar).await?;
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
	use super::deployable;
	use deploy::manifest::Invalid;

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
		assert_eq!(deployable("host"), Err(Invalid::Reserved("host".into())));
		assert_eq!(deployable("api"), Err(Invalid::Reserved("api".into())));
		assert_eq!(deployable("geo-objects"), Err(Invalid::Reserved("geo-objects".into())));
	}

	fn photos() -> deploy::Manifest {
		let geo = include_str!("../../geo/service.toml");
		let text = geo.replace("name = \"geo\"", "name = \"photos\"");
		deploy::Manifest::parse(&format!("{text}\n[objects]\nbuckets = [\"originals\", \"thumbs\"]\n"))
			.unwrap()
	}

	fn driver() -> deploy::Version {
		let manifest = deploy::Manifest::parse(include_str!("../../objects/service.toml")).unwrap();
		deploy::Version { manifest, image: "sha256:driver".into() }
	}

	fn credentials() -> crate::environment::Credentials {
		crate::environment::Credentials {
			access_key_id: "AKID".into(),
			secret_access_key: "SECRET".into(),
		}
	}

	#[test]
	fn an_app_declaring_objects_is_told_where_they_are() {
		let driver = driver();
		assert_eq!(
			super::binding(&photos(), &driver.manifest),
			[
				format!("S3_ENDPOINT=http://{}:{}", "photos-objects", 17070),
				"S3_REGION=us-east-1".into(),
				"S3_BUCKETS=originals,thumbs".into(),
			]
		);
		let geo = deploy::Manifest::parse(include_str!("../../geo/service.toml")).unwrap();
		assert!(super::binding(&geo, &driver.manifest).is_empty());
		// What the app's own files said under a bound name gives way; the rest stays.
		let mut env = vec!["S3_REGION=mars".into(), "S3_REGIONAL=kept".into(), "LEVEL=debug".into()];
		super::bound(&mut env, super::binding(&photos(), &driver.manifest));
		assert_eq!(env[..2], ["S3_REGIONAL=kept", "LEVEL=debug"]);
		assert_eq!(env.iter().filter(|line| line.starts_with("S3_REGION=")).count(), 1);
	}

	#[test]
	fn a_sidecar_mounts_the_apps_objects_alone_with_its_credentials_as_root() {
		let root = std::path::Path::new("/data/apps/photos");
		let driver = driver();
		let sidecar = super::sidecar_of(root, &photos(), &driver, &credentials()).unwrap();
		assert_eq!(sidecar.name, "photos-objects");
		assert_eq!(sidecar.app, "photos");
		assert_eq!(sidecar.image, "sha256:driver");
		assert_eq!(sidecar.source, root.join("objects"));
		assert_eq!(sidecar.target, "/data");
		assert_eq!(sidecar.directories, ["originals", "thumbs"]);
		let declared = (sidecar.port, sidecar.health.as_str(), sidecar.memory_mb);
		assert_eq!(declared, (17070, "/health", Some(256)));
		assert_eq!(
			sidecar.env,
			[
				"ROOT_ACCESS_KEY_ID=AKID",
				"ROOT_SECRET_ACCESS_KEY=SECRET",
				"VGW_PORT=:17070",
				"VGW_REGION=us-east-1",
				"VGW_HEALTH=/health",
			]
		);
		let geo = deploy::Manifest::parse(include_str!("../../geo/service.toml")).unwrap();
		assert_eq!(super::sidecar_of(root, &geo, &driver, &credentials()), None);

		// What Docker is asked for: the app's network and no other, one bind mount, sandboxed.
		let body = sidecar.body();
		let config = body.host_config.unwrap();
		assert_eq!(config.network_mode.as_deref(), Some("app-photos"));
		let endpoints = body.networking_config.unwrap().endpoints_config.unwrap();
		assert_eq!(endpoints.keys().collect::<Vec<_>>(), ["app-photos"]);
		let mounts = config.mounts.unwrap();
		assert_eq!(mounts.len(), 1);
		assert_eq!(mounts[0].source.as_deref(), Some("/data/apps/photos/objects"));
		assert_eq!(mounts[0].target.as_deref(), Some("/data"));
		assert_eq!(config.readonly_rootfs, Some(true));
		assert_eq!(config.cap_drop, Some(vec!["ALL".to_owned()]));
		assert_eq!(config.memory, Some(256 * 1024 * 1024));
		assert_eq!(config.memory_swap, config.memory);
		assert!(config.port_bindings.is_none() && config.binds.is_none());
		assert!(config.privileged.is_none());
	}
}
