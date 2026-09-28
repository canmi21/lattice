//! Replacing one app's container with a new version, which both of the platform's programs do:
//! host for every app and keeper, keeper for host. Stop, snapshot, start, check, and on a failed
//! check put back both the directory and the version before. See spec/architecture/host.md, "One
//! version runs, and a failed deploy puts the last one back".

use crate::engine::{self, Engine, Shape, Version};
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
	let name = next.manifest.name.as_str();
	engine.network(name, members).await?;
	volumes.ensure(name).await?;

	engine.archive(name, &volumes.logs(name)).await?;
	engine.remove(name).await?;
	let snapshot = volumes.snapshot(name).await?;
	if let Some(restore) = restore {
		volumes.restore(name, restore).await?;
	}
	let checked = match engine.run(next, shape, &volumes.data(name)).await {
		Ok(()) => healthy(engine, next).await,
		Err(error) => Err(error.to_string()),
	};
	let Err(reason) = checked else {
		volumes.prune(name).await?;
		return Ok(snapshot);
	};

	let logs = engine.tail(name).await;
	engine.archive(name, &volumes.logs(name)).await?;
	engine.remove(name).await?;
	volumes.restore(name, &snapshot).await?;
	let Some(current) = current else {
		return Err(Error::FirstFailed { reason, logs });
	};
	engine.run(current, shape, &volumes.data(name)).await?;
	Err(Error::Unhealthy { reason, logs })
}

/// Poll the declared path until it answers 2xx, the container exits, or the deadline passes.
async fn healthy(engine: &Engine, version: &Version) -> Result<(), String> {
	let Some(container) = &version.manifest.container else {
		return Err("the declaration has no container to check".into());
	};
	let deadline = container.health_timeout.map_or(DEFAULT_DEADLINE, Duration::from_secs);
	let address = format!("{}:{}", version.manifest.name, container.port);
	let started = tokio::time::Instant::now();
	let mut last = String::from("no answer yet");
	while started.elapsed() < deadline {
		if !engine.running(&version.manifest.name).await.map_err(|e| e.to_string())? {
			return Err("the container exited during its health check".into());
		}
		match crate::http::status(&address, &container.health).await {
			Ok(status) if (200..300).contains(&status) => return Ok(()),
			Ok(status) => last = format!("{} answered {status}", container.health),
			Err(error) => last = error.to_string(),
		}
		tokio::time::sleep(Duration::from_secs(1)).await;
	}
	Err(format!("not healthy within {} seconds: {last}", deadline.as_secs()))
}
