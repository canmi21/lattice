//! Docker, as the platform uses it: load an archive, give an app its network, run exactly one
//! container per app, and remove the images nothing needs. What a container is allowed is decided
//! in `run`.
//!
//! What a container is allowed is in `shape`, what is read back from Docker is in `report`.

mod report;
mod shape;
#[cfg(test)]
mod tests;

pub use report::{
	ContainerInfo, ContainerMount, ContainerNetwork, FilesystemUsage, Image, NetworkInfo,
	NetworkMember, container_info, filesystem_usage, network_info,
};
pub use shape::{
	DBUS_SOCKET, EDGE_MOUNTS, EDGE_NETWORK, EDGE_PORTS, OBSERVED, RESOLVER_MOUNT, RESOLVER_PORTS,
	Shape, socket_mount,
};
pub(crate) use shape::{SCRATCH, bind, sandbox};

use crate::manifest::Manifest;
use crate::sidecar::Sidecar;
use bollard::Docker;
use bollard::models::{NetworkConnectRequest, NetworkCreateRequest};
use bollard::query_parameters::{
	CreateContainerOptionsBuilder, ImportImageOptionsBuilder, ListImagesOptionsBuilder,
	RemoveContainerOptionsBuilder, RemoveImageOptionsBuilder, RestartContainerOptionsBuilder,
	StopContainerOptionsBuilder, TagImageOptionsBuilder,
};
use bytes::Bytes;
use futures_util::{Stream, StreamExt};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};

/// Every image host loaded is tagged under this, so the ones it may remove are the ones it put
/// there and nothing else on the machine.
const REPOSITORY: &str = "host";

/// Memory a container gets when its declaration names none.
pub(crate) const DEFAULT_MEMORY_MB: u32 = 512;

/// The label every container carries its own version in, so what runs can be read back from
/// Docker by a program that keeps no state of its own.
const VERSION_LABEL: &str = "host.version";

/// One version of an app: what it declared and the image it ran.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Version {
	pub manifest: Manifest,
	pub image: String,
}

#[derive(Debug, thiserror::Error)]
pub enum Error {
	#[error("Docker: {0}")]
	Docker(#[from] bollard::errors::Error),
	#[error("the archive loaded no image")]
	NothingLoaded,
	#[error("archiving the logs to {path}: {source}")]
	Archive { path: String, source: std::io::Error },
	#[error("making {path}: {source}")]
	Directory { path: String, source: std::io::Error },
}

/// A 404 from Docker: the thing asked about does not exist.
fn absent(error: &bollard::errors::Error) -> bool {
	matches!(error, bollard::errors::Error::DockerResponseServerError { status_code: 404, .. })
}

/// An image's `USER` as numbers, when it names one other than root. A name would need the image's
/// own user table to resolve, which the platform does not read, so it is taken as saying nothing.
pub fn numeric_user(user: &str) -> Option<(u32, u32)> {
	let (uid, gid) = user.split_once(':').unwrap_or((user, user));
	let (uid, gid) = (uid.parse::<u32>().ok()?, gid.parse::<u32>().ok()?);
	(uid != 0).then_some((uid, gid))
}

pub fn network_of(name: &str) -> String {
	format!("app-{name}")
}

pub struct Engine {
	docker: Docker,
}

impl Engine {
	pub fn connect() -> Result<Self, Error> {
		Ok(Self { docker: Docker::connect_with_unix_defaults()? })
	}

	/// Load an image archive and tag it as this app's, returning the image id.
	pub async fn load<S, E>(&self, name: &str, archive: S) -> Result<String, Error>
	where
		S: Stream<Item = Result<Bytes, E>> + Send + 'static,
		E: Into<Box<dyn std::error::Error + Send + Sync>> + 'static,
	{
		let options = ImportImageOptionsBuilder::new().quiet(true).build();
		let mut progress = Box::pin(self.docker.import_image_stream(options, archive, None));
		let mut loaded = None;
		while let Some(info) = progress.next().await {
			// "Loaded image: geo:dev" for a tagged archive, "Loaded image ID: sha256:..." otherwise.
			if let Some(line) = info?.stream {
				for line in line.lines() {
					if let Some(reference) =
						line.strip_prefix("Loaded image ID: ").or_else(|| line.strip_prefix("Loaded image: "))
					{
						loaded = Some(reference.trim().to_owned());
					}
				}
			}
		}
		let reference = loaded.ok_or(Error::NothingLoaded)?;
		let id = self.docker.inspect_image(&reference).await?.id.ok_or(Error::NothingLoaded)?;
		let tag = id.trim_start_matches("sha256:").chars().take(12).collect::<String>();
		let repository = format!("{REPOSITORY}/{name}");
		self
			.docker
			.tag_image(&id, Some(TagImageOptionsBuilder::new().repo(&repository).tag(&tag).build()))
			.await?;
		// The archive's own tag -- whatever the build called it -- is dropped, so what is on the
		// machine is named only by what runs it.
		if !reference.starts_with("sha256:") && !reference.starts_with(&format!("{REPOSITORY}/")) {
			let untag = RemoveImageOptionsBuilder::new().noprune(true).build();
			let _ = self.docker.remove_image(&reference, Some(untag), None).await;
		}
		Ok(id)
	}

	/// The user an image runs as, when it is one other than root, named by number.
	pub async fn user_of(&self, image: &str) -> Result<Option<(u32, u32)>, Error> {
		let inspected = self.docker.inspect_image(image).await?;
		Ok(inspected.config.and_then(|config| config.user).as_deref().and_then(numeric_user))
	}

	/// The app's network, shared with Caddy and with host for its health checks, and nothing else.
	pub async fn network(&self, name: &str, members: &[&str]) -> Result<(), Error> {
		let network = network_of(name);
		self.join(&network, members, true).await
	}

	/// Attach `members` to `network`, which is made first when `create` allows it.
	pub async fn join(&self, network: &str, members: &[&str], create: bool) -> Result<(), Error> {
		let network = network.to_owned();
		match self.docker.inspect_network(&network, None).await {
			Ok(_) => {}
			Err(error) if absent(&error) && create => {
				let request = NetworkCreateRequest {
					name: network.clone(),
					driver: Some("bridge".into()),
					..Default::default()
				};
				self.docker.create_network(request).await?;
			}
			Err(error) => return Err(error.into()),
		}
		let attached: HashSet<String> = self
			.docker
			.inspect_network(&network, None)
			.await?
			.containers
			.unwrap_or_default()
			.into_values()
			.filter_map(|container| container.name)
			.collect();
		for member in members.iter().filter(|member| !attached.contains(**member)) {
			let request = NetworkConnectRequest { container: (*member).into(), endpoint_config: None };
			self.docker.connect_network(&network, request).await?;
		}
		Ok(())
	}

	/// Stop and remove the app's container, if it has one.
	pub async fn remove(&self, name: &str) -> Result<(), Error> {
		match self
			.docker
			.stop_container(name, Some(StopContainerOptionsBuilder::new().t(20).build()))
			.await
		{
			Ok(()) => {}
			// 304: already stopped.
			Err(bollard::errors::Error::DockerResponseServerError { status_code: 304, .. }) => {}
			Err(error) if absent(&error) => return Ok(()),
			Err(error) => return Err(error.into()),
		}
		match self
			.docker
			.remove_container(name, Some(RemoveContainerOptionsBuilder::new().force(true).build()))
			.await
		{
			Err(error) if !absent(&error) => Err(error.into()),
			_ => Ok(()),
		}
	}

	/// Create and start a sidecar in place of whatever ran under its name. Its network is the app's,
	/// which has to exist already.
	pub async fn run_sidecar(&self, sidecar: &Sidecar) -> Result<(), Error> {
		self.remove(&sidecar.name).await?;
		let options = CreateContainerOptionsBuilder::new().name(&sidecar.name).build();
		self.docker.create_container(Some(options), sidecar.body()).await?;
		self.docker.start_container(&sidecar.name, None).await?;
		Ok(())
	}

	/// Start the app's container as it is.
	pub async fn start(&self, name: &str) -> Result<(), Error> {
		self.docker.start_container(name, None).await?;
		Ok(())
	}

	/// Stop it, leaving it in place; Docker's restart policy leaves a stopped container stopped.
	pub async fn stop(&self, name: &str) -> Result<(), Error> {
		let options = StopContainerOptionsBuilder::new().t(20).build();
		self.docker.stop_container(name, Some(options)).await?;
		Ok(())
	}

	pub async fn restart(&self, name: &str) -> Result<(), Error> {
		let options = RestartContainerOptionsBuilder::new().t(20).build();
		self.docker.restart_container(name, Some(options)).await?;
		Ok(())
	}

	/// Whether the app's container is still up. A process that exits during its check has failed
	/// it, and waiting out the deadline would only delay saying so.
	pub async fn running(&self, name: &str) -> Result<bool, Error> {
		let inspected = self.docker.inspect_container(name, None).await?;
		Ok(inspected.state.and_then(|state| state.running).unwrap_or(false))
	}

	/// Take `members` off `network`, where they are on it.
	pub async fn leave(&self, network: &str, members: &[&str]) -> Result<(), Error> {
		let attached: HashSet<String> = match self.docker.inspect_network(network, None).await {
			Ok(inspected) => {
				inspected.containers.unwrap_or_default().into_values().filter_map(|c| c.name).collect()
			}
			Err(error) if absent(&error) => return Ok(()),
			Err(error) => return Err(error.into()),
		};
		for member in members.iter().filter(|member| attached.contains(**member)) {
			let request = bollard::models::NetworkDisconnectRequest {
				container: (*member).into(),
				force: Some(true),
			};
			self.docker.disconnect_network(network, request).await?;
		}
		Ok(())
	}

	/// Remove one image. One a container uses is refused by Docker, and that refusal is the answer.
	pub async fn remove_image(&self, id: &str) -> Result<(), Error> {
		let options = RemoveImageOptionsBuilder::new().force(false).build();
		self.docker.remove_image(id, Some(options), None).await?;
		Ok(())
	}

	/// Whether the Docker daemon answers at all.
	pub async fn ping(&self) -> Result<(), Error> {
		self.docker.ping().await?;
		Ok(())
	}

	/// Remove every image loaded for the named apps that none of them runs now or keeps to go
	/// back to. Each program collects only what it deploys, so neither removes the other's way back.
	pub async fn collect(&self, names: &[&str], keep: &HashSet<String>) -> Result<(), Error> {
		let references = names.iter().map(|name| format!("{REPOSITORY}/{name}")).collect();
		let filters = HashMap::from([("reference", references)]);
		let images = self
			.docker
			.list_images(Some(ListImagesOptionsBuilder::new().filters(&filters).build()))
			.await?;
		for image in images.into_iter().filter(|image| !keep.contains(&image.id)) {
			// An image some container still uses refuses removal; that is the answer, not a fault.
			let _ = self
				.docker
				.remove_image(&image.id, Some(RemoveImageOptionsBuilder::new().force(false).build()), None)
				.await;
		}
		Ok(())
	}
}
