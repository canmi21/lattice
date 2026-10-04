//! What is read back from Docker and the machine: containers, networks, images, logs and disks,
//! each shaped by a pure function where it can be, so it is tested without Docker. See
//! spec/architecture/inspect.md.

use super::shape::socket_service_of;
use super::{Engine, Error, VERSION_LABEL, Version, absent};
use crate::manifest::Manifest;
use bollard::models::{ContainerInspectResponse, ContainerSummary, NetworkInspect};
use bollard::query_parameters::{ListContainersOptions, LogsOptionsBuilder};
use futures_util::StreamExt;
use serde::Serialize;
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use tokio::io::AsyncWriteExt;

/// One image on the machine, as the panel lists it.
#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct Image {
	pub id: String,
	/// Its names; none for a dangling image, which a newer build of its name left behind.
	pub tags: Vec<String>,
	/// Bytes, its layers shared with other images included.
	pub size: u64,
	/// Seconds since the epoch.
	pub created: i64,
}

/// One network a container is on, as `/api/inspect/containers` answers it. See
/// spec/architecture/inspect.md.
#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct ContainerNetwork {
	pub name: String,
	pub address: Option<String>,
}

/// One of a container's mounts, as inspect reports it: never followed, only named.
#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct ContainerMount {
	pub source: String,
	pub destination: String,
	pub read_only: bool,
}

/// One container, whoever started it, as `/api/inspect/containers` answers it. See
/// spec/architecture/inspect.md.
#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct ContainerInfo {
	pub name: String,
	/// The first twelve characters of its full id.
	pub id: String,
	pub image: String,
	pub state: String,
	pub status: String,
	pub started_at: Option<String>,
	pub restart_count: i64,
	pub networks: Vec<ContainerNetwork>,
	pub mounts: Vec<ContainerMount>,
	/// Bytes, from its `HostConfig`; absent for a container run outside host's own sandbox.
	pub memory_limit: Option<i64>,
	pub oom_killed: bool,
}

/// One container's answer, from what `list` and `inspect` each report of it -- pure, so it is
/// tested without Docker. See spec/architecture/inspect.md.
pub fn container_info(
	summary: ContainerSummary,
	inspected: ContainerInspectResponse,
) -> ContainerInfo {
	let id = summary.id.clone().unwrap_or_default();
	let name = summary
		.names
		.as_ref()
		.and_then(|names| names.first())
		.map(|name| name.trim_start_matches('/').to_owned())
		.unwrap_or_else(|| id.clone());
	let networks = summary
		.network_settings
		.and_then(|settings| settings.networks)
		.unwrap_or_default()
		.into_iter()
		.map(|(network, endpoint)| ContainerNetwork { name: network, address: endpoint.ip_address })
		.collect();
	let mounts = summary
		.mounts
		.unwrap_or_default()
		.into_iter()
		.filter_map(|mount| {
			Some(ContainerMount {
				source: mount.source?,
				destination: mount.destination?,
				read_only: !mount.rw.unwrap_or(true),
			})
		})
		.collect();
	let state = inspected.state.unwrap_or_default();
	ContainerInfo {
		name,
		id: id.chars().take(12).collect(),
		image: summary.image.unwrap_or_default(),
		state: state.status.map(|status| status.to_string()).unwrap_or_default(),
		status: summary.status.unwrap_or_default(),
		started_at: state.started_at,
		restart_count: inspected.restart_count.unwrap_or(0),
		oom_killed: state.oom_killed.unwrap_or(false),
		memory_limit: inspected.host_config.and_then(|config| config.memory),
		networks,
		mounts,
	}
}

/// One member of a network, as `/api/inspect/networks` answers it.
#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct NetworkMember {
	pub name: String,
	pub address: Option<String>,
}

/// One Docker network and who is on it, as `/api/inspect/networks` answers it.
#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct NetworkInfo {
	pub name: String,
	pub driver: String,
	pub subnet: Option<String>,
	pub members: Vec<NetworkMember>,
}

/// One network's answer, from what `inspect` reports of it -- pure, so it is tested without
/// Docker. See spec/architecture/inspect.md.
pub fn network_info(network: NetworkInspect) -> NetworkInfo {
	let subnet = network
		.ipam
		.and_then(|ipam| ipam.config)
		.and_then(|config| config.into_iter().find_map(|entry| entry.subnet));
	let members = network
		.containers
		.unwrap_or_default()
		.into_values()
		.filter_map(|container| {
			Some(NetworkMember { name: container.name?, address: container.ipv4_address })
		})
		.collect();
	NetworkInfo {
		name: network.name.unwrap_or_default(),
		driver: network.driver.unwrap_or_default(),
		subnet,
		members,
	}
}

/// One filesystem's usage, in bytes, as `statvfs` reports it.
#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
pub struct FilesystemUsage {
	pub total: u64,
	pub used: u64,
	pub available: u64,
}

/// A filesystem's usage at `path`, however deep under its mount `path` is. The one place `libc` is
/// reached for outside the btrfs ioctls below, since host does not depend on it and this is the
/// deploy crate's one file host may add to. See spec/architecture/inspect.md.
pub fn filesystem_usage(path: &std::path::Path) -> std::io::Result<FilesystemUsage> {
	use std::os::unix::ffi::OsStrExt;
	let cstring = std::ffi::CString::new(path.as_os_str().as_bytes())
		.map_err(|error| std::io::Error::new(std::io::ErrorKind::InvalidInput, error))?;
	let mut stat: libc::statvfs = unsafe { std::mem::zeroed() };
	// SAFETY: `cstring` is a valid, nul-terminated path, and `stat` is written by the call alone.
	let result = unsafe { libc::statvfs(cstring.as_ptr(), &mut stat) };
	if result != 0 {
		return Err(std::io::Error::last_os_error());
	}
	// The block-count fields are `u64` on Linux and narrower on other Unixes this may be checked
	// on; `as` widens either way rather than relying on which it is.
	let block = stat.f_frsize as u64;
	let total = stat.f_blocks as u64 * block;
	let available = stat.f_bavail as u64 * block;
	let used = total.saturating_sub(stat.f_bfree as u64 * block);
	Ok(FilesystemUsage { total, used, available })
}

impl Engine {
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

	/// The last `count` lines the running container wrote, each with Docker's timestamp; none for
	/// an app with no container.
	pub async fn lines(&self, name: &str, count: u32) -> Result<Vec<String>, Error> {
		if let Err(error) = self.docker.inspect_container(name, None).await {
			return if absent(&error) { Ok(Vec::new()) } else { Err(error.into()) };
		}
		let options = LogsOptionsBuilder::new()
			.stdout(true)
			.stderr(true)
			.timestamps(true)
			.tail(&count.to_string())
			.build();
		let mut stream = self.docker.logs(name, Some(options));
		let mut text = String::new();
		while let Some(chunk) = stream.next().await {
			text.push_str(&chunk?.to_string());
		}
		Ok(text.lines().map(str::to_owned).collect())
	}

	/// Everything the container under `name` wrote, into a file of its own in `directory`, named
	/// by the time and the image. None when there is no container to archive.
	pub async fn archive(&self, name: &str, directory: &Path) -> Result<Option<PathBuf>, Error> {
		let inspected = match self.docker.inspect_container(name, None).await {
			Ok(inspected) => inspected,
			Err(error) if absent(&error) => return Ok(None),
			Err(error) => return Err(error.into()),
		};
		let image = inspected.image.unwrap_or_default();
		let short = image.trim_start_matches("sha256:").chars().take(12).collect::<String>();
		let stamp = jiff::Timestamp::now().strftime("%Y%m%dT%H%M%SZ");
		let path = directory.join(format!("{stamp}-{short}.log"));
		let failed = |source| Error::Archive { path: path.display().to_string(), source };
		tokio::fs::create_dir_all(directory).await.map_err(failed)?;
		let mut file = tokio::fs::File::create(&path).await.map_err(failed)?;
		let options = LogsOptionsBuilder::new().stdout(true).stderr(true).timestamps(true).build();
		let mut stream = self.docker.logs(name, Some(options));
		while let Some(chunk) = stream.next().await {
			file.write_all(&chunk?.into_bytes()).await.map_err(failed)?;
		}
		file.flush().await.map_err(failed)?;
		Ok(Some(path))
	}

	/// What runs under `name` now: the version its label recorded, or -- for a container started by
	/// hand, which carries none -- `fallback` with the image it actually runs.
	pub async fn current(&self, name: &str, fallback: &Manifest) -> Result<Option<Version>, Error> {
		let inspected = match self.docker.inspect_container(name, None).await {
			Ok(inspected) => inspected,
			Err(error) if absent(&error) => return Ok(None),
			Err(error) => return Err(error.into()),
		};
		let recorded = inspected
			.config
			.and_then(|config| config.labels)
			.and_then(|labels| labels.get(VERSION_LABEL).cloned())
			.and_then(|text| serde_json::from_str::<Version>(&text).ok());
		Ok(Some(match (recorded, inspected.image) {
			(Some(version), _) => version,
			(None, Some(image)) => Version { manifest: fallback.clone(), image },
			(None, None) => return Ok(None),
		}))
	}

	/// When the container under `name` was made, as Docker says it, or nothing when there is none.
	pub async fn created(&self, name: &str) -> Result<Option<String>, Error> {
		match self.docker.inspect_container(name, None).await {
			Ok(inspected) => Ok(inspected.created),
			Err(error) if absent(&error) => Ok(None),
			Err(error) => Err(error.into()),
		}
	}

	/// The socket services `name`'s container has mounted at `/sockets/<service>`, read back from
	/// Docker rather than kept anywhere else -- what its scheduler shape actually ran it with, not
	/// what it was last meant to. Empty for a container with none, or none at all. See
	/// spec/architecture/cron.md.
	pub async fn socket_mounts(&self, name: &str) -> Result<Vec<String>, Error> {
		let inspected = match self.docker.inspect_container(name, None).await {
			Ok(inspected) => inspected,
			Err(error) if absent(&error) => return Ok(Vec::new()),
			Err(error) => return Err(error.into()),
		};
		Ok(
			inspected
				.mounts
				.unwrap_or_default()
				.into_iter()
				.filter_map(|mount| mount.destination)
				.filter_map(|destination| socket_service_of(&destination))
				.collect(),
		)
	}

	/// The address `container` has on `network`, when it is on it.
	pub async fn address_on(
		&self,
		container: &str,
		network: &str,
	) -> Result<Option<std::net::IpAddr>, Error> {
		let inspected = self.docker.inspect_container(container, None).await?;
		let networks = inspected.network_settings.and_then(|settings| settings.networks);
		let address = networks
			.and_then(|mut networks| networks.remove(network))
			.and_then(|endpoint| endpoint.ip_address)
			.and_then(|address| address.parse().ok());
		Ok(address)
	}

	/// Every running container's id and name, whoever started it.
	pub async fn named(&self) -> Result<std::collections::BTreeMap<String, String>, Error> {
		let running = self.docker.list_containers(None::<ListContainersOptions>).await?;
		Ok(
			running
				.into_iter()
				.filter_map(|container| {
					let name = container.names?.into_iter().next()?;
					Some((container.id?, name.trim_start_matches('/').to_owned()))
				})
				.collect(),
		)
	}

	/// Every container on the machine, whoever started it: state, image, networks and mounts,
	/// memory ceiling, restarts, and whether the kernel killed it for memory. See
	/// spec/architecture/inspect.md.
	pub async fn containers(&self) -> Result<Vec<ContainerInfo>, Error> {
		let options = ListContainersOptions { all: true, ..Default::default() };
		let summaries = self.docker.list_containers(Some(options)).await?;
		let mut all = Vec::with_capacity(summaries.len());
		for summary in summaries {
			let Some(id) = summary.id.clone() else { continue };
			let inspected = self.docker.inspect_container(&id, None).await?;
			all.push(container_info(summary, inspected));
		}
		Ok(all)
	}

	/// Every Docker network and who is on it. `list` alone does not carry members, so each is
	/// inspected in turn. See spec/architecture/inspect.md.
	pub async fn networks(&self) -> Result<Vec<NetworkInfo>, Error> {
		let listed =
			self.docker.list_networks(None::<bollard::query_parameters::ListNetworksOptions>).await?;
		let mut all = Vec::with_capacity(listed.len());
		for network in listed {
			let Some(name) = network.name else { continue };
			let inspected = self.docker.inspect_network(&name, None).await?;
			all.push(network_info(inspected));
		}
		Ok(all)
	}

	/// Every image on the machine, whoever loaded it, dangling ones included.
	pub async fn images(&self) -> Result<Vec<Image>, Error> {
		let listed =
			self.docker.list_images(None::<bollard::query_parameters::ListImagesOptions>).await?;
		Ok(
			listed
				.into_iter()
				.map(|image| Image {
					id: image.id,
					tags: image.repo_tags.into_iter().filter(|tag| tag != "<none>:<none>").collect(),
					size: u64::try_from(image.size).unwrap_or(0),
					created: image.created,
				})
				.collect(),
		)
	}

	/// The image of every container, running or stopped: none of them may be removed.
	pub async fn images_in_use(&self) -> Result<HashSet<String>, Error> {
		let options = ListContainersOptions { all: true, ..Default::default() };
		let containers = self.docker.list_containers(Some(options)).await?;
		Ok(containers.into_iter().filter_map(|container| container.image_id).collect())
	}

	/// What every image together takes on disk, layers shared between them counted once.
	pub async fn images_size(&self) -> Result<Option<u64>, Error> {
		let usage = self.docker.df(None).await?;
		Ok(
			usage
				.image_usage
				.and_then(|usage| usage.total_size)
				.and_then(|size| u64::try_from(size).ok()),
		)
	}
}
