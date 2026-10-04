//! Replacing one app's container with a new version, which both of the platform's programs do:
//! host for every app and keeper, keeper for host. Stop, snapshot, start, check, and on a failed
//! check put back both the directory and the version before. See spec/architecture/host.md, "One
//! version runs, and a failed deploy puts the last one back".

use crate::engine::{self, Engine, Shape, Version};
use crate::sidecar::{Driver, Sidecar};
use crate::volume::{self, Volumes};
use std::path::{Path, PathBuf};
use std::time::Duration;

/// How long a new version has to answer its health check when its declaration does not say.
const DEFAULT_DEADLINE: Duration = Duration::from_secs(60);

#[derive(Debug, thiserror::Error)]
pub enum Error {
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
	/// A sidecar did not become healthy on its own, outside any app's deploy.
	#[error("{0}")]
	Sidecar(String),
}

/// The sidecars each side of a replacement runs beside its app, one per driver it declares.
#[derive(Debug, Clone, Copy, Default)]
pub struct Beside<'a> {
	pub next: &'a [Sidecar],
	pub current: &'a [Sidecar],
}

/// Run `next` in place of `current`, on the app's own network with `members` attached to it, and
/// answer with the snapshot taken of the app's directory before `next` started. With `restore`,
/// the directory is first put back as that snapshot held it -- a rollback with its data -- and a
/// failed check still puts back the directory as it was just before.
pub async fn replace(
	engine: &Engine,
	volumes: &Volumes,
	members: &[&str],
	shape: &Shape,
	next: &Version,
	current: Option<&Version>,
	restore: Option<&Path>,
) -> Result<PathBuf, Error> {
	replace_beside(engine, volumes, members, shape, next, current, restore, Beside::default()).await
}

/// The same, with the app's sidecars stopped before the snapshot, so the snapshot holds their files
/// at rest, and started after any restore and before the app, so the app never meets an endpoint
/// that is not there yet. See spec/architecture/objects.md, "A sidecar per app, over the app's own
/// directory", and spec/architecture/databases.md, "Declared by the app, run beside it".
#[allow(clippy::too_many_arguments)]
pub async fn replace_beside(
	engine: &Engine,
	volumes: &Volumes,
	members: &[&str],
	shape: &Shape,
	next: &Version,
	current: Option<&Version>,
	restore: Option<&Path>,
	beside: Beside<'_>,
) -> Result<PathBuf, Error> {
	let name = next.manifest.name.as_str();
	// Every kind, declared or not: a sidecar the next version no longer declares goes too.
	let sidecars: Vec<String> = Driver::ALL.iter().map(|driver| driver.sidecar_of(name)).collect();
	if shape.networked() {
		engine.network(name, members).await?;
	}
	volumes.ensure(name).await?;

	engine.archive(name, &volumes.logs(name)).await?;
	engine.remove(name).await?;
	for sidecar in &sidecars {
		engine.archive(sidecar, &volumes.logs(sidecar)).await?;
		engine.remove(sidecar).await?;
	}
	let snapshot = volumes.snapshot(name).await?;
	if let Some(restore) = restore {
		volumes.restore(name, restore).await?;
	}
	if let Some((uid, gid)) = engine.user_of(&next.image).await? {
		volumes.hand_over(name, uid, gid).await?;
	}
	let mut beside_next = Ok(());
	for sidecar in beside.next {
		beside_next = start_sidecar(engine, sidecar).await;
		if beside_next.is_err() {
			break;
		}
	}
	let checked = match beside_next {
		Err(reason) => Err(reason),
		Ok(()) => match engine.run(next, shape, &volumes.data(name)).await {
			Ok(()) => healthy(engine, next, &volumes.data(name)).await,
			Err(error) => Err(error.to_string()),
		},
	};
	let Err(reason) = checked else {
		volumes.prune(name).await?;
		return Ok(snapshot);
	};

	let logs = engine.tail(name).await;
	engine.archive(name, &volumes.logs(name)).await?;
	engine.remove(name).await?;
	for sidecar in &sidecars {
		engine.archive(sidecar, &volumes.logs(sidecar)).await?;
		engine.remove(sidecar).await?;
	}
	volumes.restore(name, &snapshot).await?;
	let Some(current) = current else {
		return Err(Error::FirstFailed { reason, logs });
	};
	for before in beside.current {
		if let Err(reason) = start_sidecar(engine, before).await {
			eprintln!("deploy: putting back {}: {reason}", before.name);
		}
	}
	engine.run(current, shape, &volumes.data(name)).await?;
	Err(Error::Unhealthy { reason, logs })
}

/// Run `sidecar` in place of whatever ran under its name, alone rather than as part of its app's
/// deploy: the driver moving every sidecar to a new image. Its log is archived first.
pub async fn sidecar(engine: &Engine, volumes: &Volumes, sidecar: &Sidecar) -> Result<(), Error> {
	engine.archive(&sidecar.name, &volumes.logs(&sidecar.name)).await?;
	start_sidecar(engine, sidecar).await.map_err(Error::Sidecar)
}

/// Make its directories, give them to the user it runs as, start it and wait for it to answer. A
/// failure is a reason, carrying the last lines it wrote.
async fn start_sidecar(engine: &Engine, sidecar: &Sidecar) -> Result<(), String> {
	let started = async {
		let owner = match sidecar.user {
			Some(user) => Some(user),
			None => engine.user_of(&sidecar.image).await?,
		};
		for directory in std::iter::once(sidecar.source.clone())
			.chain(sidecar.directories.iter().map(|bucket| sidecar.source.join(bucket)))
		{
			make(&directory, owner).await?;
		}
		engine.run_sidecar(sidecar).await?;
		Ok::<_, Error>(())
	};
	if let Err(error) = started.await {
		return Err(format!("{}: {error}", sidecar.name));
	}
	let started = tokio::time::Instant::now();
	let mut last = String::from("no answer yet");
	while started.elapsed() < SIDECAR_DEADLINE {
		if !engine.running(&sidecar.name).await.map_err(|e| e.to_string())? {
			last = "it exited".into();
			break;
		}
		match sidecar.ask().await {
			Ok(()) => return Ok(()),
			Err(answer) => last = answer,
		}
		tokio::time::sleep(Duration::from_secs(1)).await;
	}
	let logs = engine.tail(&sidecar.name).await;
	Err(format!("{} is not healthy: {last}\n{logs}", sidecar.name))
}

/// How long a sidecar has to answer before its app is started without it, which is never.
const SIDECAR_DEADLINE: Duration = Duration::from_secs(30);

/// A directory a sidecar mounts or serves, made when missing and given -- itself, not what is in it
/// -- to `owner`, as an app's own directory is.
async fn make(directory: &Path, owner: Option<(u32, u32)>) -> Result<(), Error> {
	use std::os::unix::fs::MetadataExt;
	let failed = |source| volume::Error::Io { path: directory.to_path_buf(), source };
	tokio::fs::create_dir_all(directory).await.map_err(failed)?;
	let Some((uid, gid)) = owner else { return Ok(()) };
	let metadata = tokio::fs::metadata(directory).await.map_err(failed)?;
	if (metadata.uid(), metadata.gid()) != (uid, gid) {
		std::os::unix::fs::chown(directory, Some(uid), Some(gid)).map_err(failed)?;
	}
	Ok(())
}

/// Poll the declared path until it answers 2xx, the container exits, or the deadline passes. An app
/// on a socket is asked there, in `data`, its directory as the machine sees it.
async fn healthy(engine: &Engine, version: &Version, data: &Path) -> Result<(), String> {
	let Some(container) = &version.manifest.container else {
		return Err("the declaration has no container to check".into());
	};
	let deadline = container.health_timeout.map_or(DEFAULT_DEADLINE, Duration::from_secs);
	let socket = container.socket.as_ref().map(|socket| data.join(socket));
	let address = format!("{}:{}", version.manifest.name, container.port.unwrap_or_default());
	let started = tokio::time::Instant::now();
	let mut last = String::from("no answer yet");
	while started.elapsed() < deadline {
		if !engine.running(&version.manifest.name).await.map_err(|e| e.to_string())? {
			return Err("the container exited during its health check".into());
		}
		let answered = match &socket {
			Some(socket) => crate::http::status_unix(socket, &container.health).await,
			None => crate::http::status(&address, &container.health).await,
		};
		match answered {
			Ok(status) if (200..300).contains(&status) => return Ok(()),
			Ok(status) => last = format!("{} answered {status}", container.health),
			Err(error) => last = error.to_string(),
		}
		tokio::time::sleep(Duration::from_secs(1)).await;
	}
	Err(format!("not healthy within {} seconds: {last}", deadline.as_secs()))
}
