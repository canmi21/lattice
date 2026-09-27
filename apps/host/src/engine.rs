//! Docker, as host uses it: load an archive, give an app its network, run exactly one container
//! per app, and remove the images nothing needs. What a container is allowed is decided in `run`.

use crate::manifest::Manifest;
use bollard::Docker;
use bollard::models::{
	ContainerCreateBody, EndpointSettings, HostConfig, HostConfigLogConfig, NetworkConnectRequest,
	NetworkCreateRequest, RestartPolicy, RestartPolicyNameEnum,
};
use bollard::query_parameters::{
	CreateContainerOptionsBuilder, ImportImageOptionsBuilder, ListImagesOptionsBuilder,
	LogsOptionsBuilder, RemoveContainerOptionsBuilder, RemoveImageOptionsBuilder,
	StopContainerOptionsBuilder, TagImageOptionsBuilder,
};
use bytes::Bytes;
use futures_util::{Stream, StreamExt};
use std::collections::{HashMap, HashSet};
use std::path::Path;

/// Every image host loaded is tagged under this, so the ones it may remove are the ones it put
/// there and nothing else on the machine.
const REPOSITORY: &str = "host";

/// Memory a container gets when its declaration names none.
const DEFAULT_MEMORY_MB: u32 = 512;

#[derive(Debug, thiserror::Error)]
pub enum Error {
	#[error("Docker: {0}")]
	Docker(#[from] bollard::errors::Error),
	#[error("the archive loaded no image")]
	NothingLoaded,
}

/// A 404 from Docker: the thing asked about does not exist.
fn absent(error: &bollard::errors::Error) -> bool {
	matches!(error, bollard::errors::Error::DockerResponseServerError { status_code: 404, .. })
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

	/// The app's network, shared with Caddy and with host for its health checks, and nothing else.
	pub async fn network(&self, name: &str, members: &[&str]) -> Result<(), Error> {
		let network = network_of(name);
		match self.docker.inspect_network(&network, None).await {
			Ok(_) => {}
			Err(error) if absent(&error) => {
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

	/// Create and start the app's one container. Everything it is allowed is here, whatever its
	/// declaration says; see spec/architecture/host.md, "What a deployment may ask for is host's
	/// decision".
	pub async fn run(&self, manifest: &Manifest, image: &str, data: &Path) -> Result<(), Error> {
		let name = &manifest.name;
		let binds =
			manifest.data.as_ref().map(|mount| vec![format!("{}:{}", data.display(), mount.path)]);
		let memory = i64::from(manifest.container.memory_mb.unwrap_or(DEFAULT_MEMORY_MB)) * 1024 * 1024;
		let host_config = HostConfig {
			network_mode: Some(network_of(name)),
			binds,
			restart_policy: Some(RestartPolicy {
				name: Some(RestartPolicyNameEnum::UNLESS_STOPPED),
				..Default::default()
			}),
			cap_drop: Some(vec!["ALL".into()]),
			security_opt: Some(vec!["no-new-privileges".into()]),
			readonly_rootfs: Some(true),
			tmpfs: Some(HashMap::from([("/tmp".into(), "rw,noexec,nosuid,size=64m".into())])),
			memory: Some(memory),
			pids_limit: Some(512),
			init: Some(true),
			log_config: Some(HostConfigLogConfig {
				typ: Some("json-file".into()),
				config: Some(HashMap::from([
					("max-size".into(), "10m".into()),
					("max-file".into(), "3".into()),
				])),
			}),
			..Default::default()
		};
		let body = ContainerCreateBody {
			image: Some(image.into()),
			labels: Some(HashMap::from([("host.app".into(), name.clone())])),
			host_config: Some(host_config),
			networking_config: Some(bollard::models::NetworkingConfig {
				endpoints_config: Some(HashMap::from([(network_of(name), EndpointSettings::default())])),
			}),
			..Default::default()
		};
		self
			.docker
			.create_container(Some(CreateContainerOptionsBuilder::new().name(name).build()), body)
			.await?;
		self.docker.start_container(name, None).await?;
		Ok(())
	}

	/// Whether the app's container is still up. A process that exits during its check has failed
	/// it, and waiting out the deadline would only delay saying so.
	pub async fn running(&self, name: &str) -> Result<bool, Error> {
		let inspected = self.docker.inspect_container(name, None).await?;
		Ok(inspected.state.and_then(|state| state.running).unwrap_or(false))
	}

	/// The last lines a container wrote, for the report of a failed deploy.
	pub async fn tail(&self, name: &str) -> String {
		let options = LogsOptionsBuilder::new().stdout(true).stderr(true).tail("40").build();
		let mut lines = self.docker.logs(name, Some(options));
		let mut text = String::new();
		while let Some(Ok(line)) = lines.next().await {
			text.push_str(&line.to_string());
		}
		text
	}

	/// Remove every image host loaded that no app runs now or keeps to go back to.
	pub async fn collect(&self, keep: &HashSet<String>) -> Result<(), Error> {
		let filters = HashMap::from([("reference", vec![format!("{REPOSITORY}/*")])]);
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
