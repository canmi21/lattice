//! Docker, as the platform uses it: load an archive, give an app its network, run exactly one
//! container per app, and remove the images nothing needs. What a container is allowed is decided
//! in `run`.

use crate::manifest::Manifest;
use bollard::Docker;
use bollard::models::{
	ContainerCreateBody, ContainerInspectResponse, ContainerSummary, EndpointIpamConfig,
	EndpointSettings, HostConfig, HostConfigLogConfig, Mount, MountType, NetworkConnectRequest,
	NetworkCreateRequest, NetworkInspect, PortBinding, RestartPolicy, RestartPolicyNameEnum,
};
use bollard::query_parameters::{
	CreateContainerOptionsBuilder, ImportImageOptionsBuilder, ListContainersOptions,
	ListImagesOptionsBuilder, LogsOptionsBuilder, RemoveContainerOptionsBuilder,
	RemoveImageOptionsBuilder, RestartContainerOptionsBuilder, StopContainerOptionsBuilder,
	TagImageOptionsBuilder,
};
use bytes::Bytes;
use futures_util::{Stream, StreamExt};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use tokio::io::AsyncWriteExt;

/// Every image host loaded is tagged under this, so the ones it may remove are the ones it put
/// there and nothing else on the machine.
const REPOSITORY: &str = "host";

/// Memory a container gets when its declaration names none.
const DEFAULT_MEMORY_MB: u32 = 512;

/// The label every container carries its own version in, so what runs can be read back from
/// Docker by a program that keeps no state of its own.
const VERSION_LABEL: &str = "host.version";

/// One version of an app: what it declared and the image it ran.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Version {
	pub manifest: Manifest,
	pub image: String,
}

/// How a container is run. Chosen by the program deploying it from the app's name, never by the
/// app's declaration -- see spec/architecture/host.md, "What a deployment may ask for is host's
/// decision".
#[derive(Debug, Clone)]
pub enum Shape {
	/// Every app: no capabilities, a read-only root, its own directory and nothing else, and the
	/// environment its two files give it.
	Sandboxed { env: Vec<String> },
	/// host and keeper only: privileged, the Docker socket, the whole of `/data`, and the
	/// environment of the node's one `.env`.
	Platform { env: Vec<String> },
	/// The meter only: sandboxed as any app, but with no network, the machine's PIDs, and the
	/// machine's `/proc` and `/sys` read-only under `/host`. See spec/architecture/meter.md, "Run
	/// beside the machine, not inside it".
	Observer { env: Vec<String> },
	/// Caddy only: the node's one door. Its ports published on the machine, the `edge` network
	/// cloudflared shares, and every app's network joined after it starts; its configuration, which
	/// host writes, read-only; no capability but binding a low port. See
	/// spec/architecture/host.md, "Caddy is deployed like any app, and is the one door".
	Edge { env: Vec<String> },
	/// The tunnel only: sandboxed, on the `edge` network at `address`, the one address Caddy
	/// believes a visitor's address from. See spec/architecture/host.md, "The tunnel is deployed like
	/// any app, at the address Caddy trusts".
	Tunnel { env: Vec<String>, address: String },
	/// `cron` only: sandboxed like any app, on its own network, plus a bind of each socket-served
	/// service's data directory at `/sockets/<service>`. See spec/architecture/cron.md, "host gives
	/// `cron` the table".
	Scheduler { env: Vec<String>, sockets: Vec<(String, PathBuf)> },
	/// `apt` only: sandboxed, its own network, root so systemd lets it start a unit, and the
	/// machine's D-Bus system bus socket bound at the same path. See spec/architecture/apt.md,
	/// "The door".
	Steward { env: Vec<String> },
}

impl Shape {
	/// Whether it runs on the app's own network, which Caddy and host join. The meter has no
	/// network at all, and Caddy stands on the edge and joins the others.
	pub fn networked(&self) -> bool {
		!matches!(self, Shape::Observer { .. } | Shape::Edge { .. } | Shape::Tunnel { .. })
	}
}

/// The network the edge shape stands on, shared with cloudflared.
pub const EDGE_NETWORK: &str = "edge";

/// What the edge shape publishes on the machine: HTTP, HTTPS, and HTTPS over QUIC.
pub const EDGE_PORTS: [&str; 3] = ["80/tcp", "443/tcp", "443/udp"];

/// Where the edge shape mounts the parts of its directory beside `data/`: host's rendered
/// configuration, read-only, and Caddy's own configuration state.
pub const EDGE_MOUNTS: [(&str, &str, bool); 2] =
	[("host", "/etc/caddy/host", true), ("config", "/config", false)];

/// Where the observer shape puts the machine's two kernel filesystems.
pub const OBSERVED: [(&str, &str); 2] = [("/proc", "/host/proc"), ("/sys", "/host/sys")];

/// Where the scheduler shape mounts a socket-served service's data directory, in `cron`'s own
/// container. See spec/architecture/cron.md, "`reach` is how `cron` asks".
pub fn socket_mount(service: &str) -> String {
	format!("/sockets/{service}")
}

/// The service a mount `destination` was made for, when it sits directly under
/// `socket_mount("")` -- `socket_mount("")` is itself `/sockets/`, so the prefix stripped here is
/// that path as it stands, not with a second slash appended to it. `None` for anything outside
/// that directory, for the directory itself, or for a path with a further slash below it.
fn socket_service_of(destination: &str) -> Option<String> {
	let remainder = destination.strip_prefix(&socket_mount(""))?;
	if remainder.is_empty() || remainder.contains('/') {
		return None;
	}
	Some(remainder.to_owned())
}

/// The machine's D-Bus system bus socket, mounted into the steward shape at the same path. See
/// spec/architecture/apt.md, "The door".
pub const DBUS_SOCKET: &str = "/run/dbus/system_bus_socket";

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

/// A structured mount rather than a `source:target` string, which a target containing a colon could
/// extend with options of its own.
fn bind(source: String, target: String, read_only: bool) -> Mount {
	Mount {
		source: Some(source),
		target: Some(target),
		typ: Some(MountType::BIND),
		read_only: Some(read_only),
		..Default::default()
	}
}

/// The scheduler shape's mounts: the app's own directory, if declared, plus each socket-served
/// service's data directory at `/sockets/<service>`. See spec/architecture/cron.md.
fn scheduler_mounts(own: Option<Mount>, sockets: &[(String, PathBuf)]) -> Vec<Mount> {
	own
		.into_iter()
		.chain(
			sockets
				.iter()
				.map(|(service, source)| bind(source.display().to_string(), socket_mount(service), false)),
		)
		.collect()
}

/// The steward shape's mounts: the app's own directory, if declared, plus the machine's D-Bus
/// system bus socket at the same path. See spec/architecture/apt.md.
fn steward_mounts(own: Option<Mount>) -> Vec<Mount> {
	own
		.into_iter()
		.chain(std::iter::once(bind(DBUS_SOCKET.into(), DBUS_SOCKET.into(), false)))
		.collect()
}

/// What every app's container is allowed, on `network` with `mounts` and `memory` bytes: no
/// capabilities, a read-only root, a ceiling with no swap past it, and every line kept -- see
/// spec/architecture/host.md, "What a deployment may ask for is host's decision".
fn sandbox(network: String, mounts: Vec<Mount>, memory: i64) -> HostConfig {
	HostConfig {
		network_mode: Some(network),
		mounts: Some(mounts),
		restart_policy: Some(RestartPolicy {
			name: Some(RestartPolicyNameEnum::UNLESS_STOPPED),
			..Default::default()
		}),
		cap_drop: Some(vec!["ALL".into()]),
		security_opt: Some(vec!["no-new-privileges".into()]),
		readonly_rootfs: Some(true),
		tmpfs: Some(HashMap::from([("/tmp".into(), "rw,noexec,nosuid,size=64m".into())])),
		memory: Some(memory),
		memory_swap: Some(memory),
		pids_limit: Some(512),
		init: Some(true),
		// Not rotated: see spec/architecture/host.md, "Every line an app writes is kept".
		log_config: Some(HostConfigLogConfig { typ: Some("json-file".into()), config: None }),
		..Default::default()
	}
}

/// A container that runs beside an app, for the app alone: its object storage. See
/// spec/architecture/objects.md, "A sidecar per app, over the app's own directory".
#[derive(Debug, Clone, PartialEq)]
pub struct Sidecar {
	/// Its container's name, `<app>-objects`.
	pub name: String,
	/// The app it serves, whose network is the only one it stands on.
	pub app: String,
	pub image: String,
	pub env: Vec<String>,
	/// The one directory it mounts, as the machine sees it, and where.
	pub source: PathBuf,
	pub target: String,
	/// Directories made under `source` before it starts, left alone once no longer named.
	pub directories: Vec<String>,
	pub port: u16,
	pub health: String,
	pub memory_mb: Option<u32>,
}

impl Sidecar {
	/// What Docker is asked to create: sandboxed as an app is, on the app's network, with its one
	/// directory and nothing else.
	pub fn body(&self) -> ContainerCreateBody {
		let memory = i64::from(self.memory_mb.unwrap_or(DEFAULT_MEMORY_MB)) * 1024 * 1024;
		let mount = bind(self.source.display().to_string(), self.target.clone(), false);
		let network = network_of(&self.app);
		ContainerCreateBody {
			image: Some(self.image.clone()),
			env: Some(self.env.clone()),
			labels: Some(HashMap::from([(SIDECAR_LABEL.into(), self.app.clone())])),
			host_config: Some(sandbox(network.clone(), vec![mount], memory)),
			networking_config: Some(bollard::models::NetworkingConfig {
				endpoints_config: Some(HashMap::from([(network, EndpointSettings::default())])),
			}),
			..Default::default()
		}
	}
}

/// The label a sidecar carries the name of the app it serves in.
const SIDECAR_LABEL: &str = "host.sidecar";

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

pub fn network_of(name: &str) -> String {
	format!("app-{name}")
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
pub fn container_info(summary: ContainerSummary, inspected: ContainerInspectResponse) -> ContainerInfo {
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
		.filter_map(|container| Some(NetworkMember { name: container.name?, address: container.ipv4_address }))
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

	/// Create and start the app's one container. Everything it is allowed is here, whatever its
	/// declaration says; see spec/architecture/host.md, "What a deployment may ask for is host's
	/// decision".
	pub async fn run(&self, version: &Version, shape: &Shape, data: &Path) -> Result<(), Error> {
		let manifest = &version.manifest;
		let name = &manifest.name;
		// A ceiling on every container, and no swap past it: a limit that can be exceeded into swap
		// is a slower machine rather than a limit. See spec/architecture/host.md.
		let declared = manifest.container.as_ref().and_then(|container| container.memory_mb);
		let memory = i64::from(declared.unwrap_or(DEFAULT_MEMORY_MB)) * 1024 * 1024;
		let logs = HostConfigLogConfig { typ: Some("json-file".into()), config: None };
		let restart =
			RestartPolicy { name: Some(RestartPolicyNameEnum::UNLESS_STOPPED), ..Default::default() };
		let own = manifest
			.data
			.as_ref()
			.map(|mount| bind(data.display().to_string(), mount.path.clone(), false));
		let sandboxed = |mounts: Vec<Mount>| sandbox(network_of(name), mounts, memory);
		let (host_config, env) = match shape {
			Shape::Sandboxed { env } => (sandboxed(own.into_iter().collect()), env.clone()),
			Shape::Observer { env } => {
				let observed = OBSERVED.iter().map(|(from, to)| bind((*from).into(), (*to).into(), true));
				let config = HostConfig {
					network_mode: Some("none".into()),
					pid_mode: Some("host".into()),
					..sandboxed(own.into_iter().chain(observed).collect())
				};
				(config, env.clone())
			}
			Shape::Edge { env } => {
				let root = data.parent().unwrap_or(data);
				// A bind mount's source has to exist, and only `data/` is made for every app.
				for (from, _, _) in EDGE_MOUNTS {
					let beside = root.join(from);
					tokio::fs::create_dir_all(&beside)
						.await
						.map_err(|source| Error::Directory { path: beside.display().to_string(), source })?;
				}
				let beside = EDGE_MOUNTS.iter().map(|(from, to, read_only)| {
					bind(root.join(from).display().to_string(), (*to).into(), *read_only)
				});
				let published = EDGE_PORTS.iter().map(|port| {
					let host_port = port.split('/').next().map(str::to_owned);
					(port.to_string(), Some(vec![PortBinding { host_ip: None, host_port }]))
				});
				let config = HostConfig {
					network_mode: Some(EDGE_NETWORK.into()),
					port_bindings: Some(published.collect()),
					cap_add: Some(vec!["NET_BIND_SERVICE".into()]),
					..sandboxed(own.into_iter().chain(beside).collect())
				};
				(config, env.clone())
			}
			Shape::Tunnel { env, .. } => {
				let config = HostConfig {
					network_mode: Some(EDGE_NETWORK.into()),
					..sandboxed(own.into_iter().collect())
				};
				(config, env.clone())
			}
			Shape::Scheduler { env, sockets } => (sandboxed(scheduler_mounts(own, sockets)), env.clone()),
			Shape::Steward { env } => (sandboxed(steward_mounts(own)), env.clone()),
			Shape::Platform { env } => {
				let config = HostConfig {
					network_mode: Some(network_of(name)),
					binds: Some(vec![
						"/var/run/docker.sock:/var/run/docker.sock".into(),
						"/data:/data".into(),
					]),
					restart_policy: Some(restart),
					memory: Some(memory),
					memory_swap: Some(memory),
					privileged: Some(true),
					init: Some(true),
					log_config: Some(logs),
					..Default::default()
				};
				(config, env.clone())
			}
		};
		let recorded = serde_json::to_string(version).unwrap_or_default();
		let body = ContainerCreateBody {
			image: Some(version.image.clone()),
			env: Some(env),
			// apt runs as root so systemd's D-Bus API lets it start a unit; see
			// spec/architecture/apt.md, "The door".
			user: matches!(shape, Shape::Steward { .. }).then(|| "0:0".to_owned()),
			labels: Some(HashMap::from([
				("host.app".into(), name.clone()),
				(VERSION_LABEL.into(), recorded),
			])),
			exposed_ports: matches!(shape, Shape::Edge { .. })
				.then(|| EDGE_PORTS.iter().map(|port| (*port).to_owned()).collect()),
			host_config: Some(host_config),
			networking_config: match shape {
				Shape::Observer { .. } => None,
				Shape::Edge { .. } => Some((EDGE_NETWORK.to_owned(), EndpointSettings::default())),
				Shape::Tunnel { address, .. } => {
					let fixed =
						EndpointIpamConfig { ipv4_address: Some(address.clone()), ..Default::default() };
					let settings = EndpointSettings { ipam_config: Some(fixed), ..Default::default() };
					Some((EDGE_NETWORK.to_owned(), settings))
				}
				_ => Some((network_of(name), EndpointSettings::default())),
			}
			.map(|(network, settings)| bollard::models::NetworkingConfig {
				endpoints_config: Some(HashMap::from([(network, settings)])),
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

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn shapes_a_container_from_what_list_and_inspect_each_report() {
		use bollard::models::{ContainerState, ContainerStateStatusEnum, ContainerSummaryNetworkSettings, MountPoint};
		let summary = ContainerSummary {
			id: Some("abcdef0123456789".into()),
			names: Some(vec!["/geo".into()]),
			image: Some("host/geo:0f939c217676".into()),
			status: Some("Up 3 hours".into()),
			network_settings: Some(ContainerSummaryNetworkSettings {
				networks: Some(HashMap::from([(
					"app-geo".into(),
					EndpointSettings { ip_address: Some("10.0.0.5".into()), ..Default::default() },
				)])),
			}),
			mounts: Some(vec![MountPoint {
				typ: Some("bind".into()),
				source: Some("/data/apps/geo".into()),
				destination: Some("/data".into()),
				rw: Some(false),
				..Default::default()
			}]),
			..Default::default()
		};
		let inspected = ContainerInspectResponse {
			state: Some(ContainerState {
				status: Some(ContainerStateStatusEnum::RUNNING),
				started_at: Some("2026-09-28T00:00:00Z".into()),
				oom_killed: Some(true),
				..Default::default()
			}),
			restart_count: Some(2),
			host_config: Some(HostConfig { memory: Some(512 * 1024 * 1024), ..Default::default() }),
			..Default::default()
		};
		let info = container_info(summary, inspected);
		assert_eq!(info.name, "geo");
		assert_eq!(info.id, "abcdef012345");
		assert_eq!(info.image, "host/geo:0f939c217676");
		assert_eq!(info.state, "running");
		assert_eq!(info.status, "Up 3 hours");
		assert_eq!(info.started_at, Some("2026-09-28T00:00:00Z".into()));
		assert_eq!(info.restart_count, 2);
		assert!(info.oom_killed);
		assert_eq!(info.memory_limit, Some(512 * 1024 * 1024));
		assert_eq!(info.networks, vec![ContainerNetwork {
			name: "app-geo".into(),
			address: Some("10.0.0.5".into()),
		}]);
		assert_eq!(info.mounts, vec![ContainerMount {
			source: "/data/apps/geo".into(),
			destination: "/data".into(),
			read_only: true,
		}]);
	}

	#[test]
	fn socket_service_of_takes_only_a_direct_child_of_the_sockets_directory() {
		assert_eq!(socket_service_of("/sockets/apt"), Some("apt".into()));
		assert_eq!(socket_service_of("/data"), None);
		assert_eq!(socket_service_of("/sockets/"), None);
		assert_eq!(socket_service_of("/sockets/a/b"), None);
	}

	#[test]
	fn shapes_a_network_and_who_is_on_it() {
		use bollard::models::{EndpointResource, Ipam, IpamConfig};
		let network = NetworkInspect {
			name: Some("app-geo".into()),
			driver: Some("bridge".into()),
			ipam: Some(Ipam {
				config: Some(vec![IpamConfig { subnet: Some("172.20.0.0/16".into()), ..Default::default() }]),
				..Default::default()
			}),
			containers: Some(HashMap::from([(
				"endpoint-1".into(),
				EndpointResource {
					name: Some("geo".into()),
					ipv4_address: Some("172.20.0.2/16".into()),
					..Default::default()
				},
			)])),
			..Default::default()
		};
		let info = network_info(network);
		assert_eq!(info.name, "app-geo");
		assert_eq!(info.driver, "bridge");
		assert_eq!(info.subnet, Some("172.20.0.0/16".into()));
		assert_eq!(info.members, vec![NetworkMember {
			name: "geo".into(),
			address: Some("172.20.0.2/16".into()),
		}]);
	}

	#[test]
	fn reads_the_filesystem_a_path_is_under() {
		let root = tempfile::tempdir().unwrap();
		let usage = filesystem_usage(root.path()).unwrap();
		assert!(usage.total > 0);
		assert!(usage.total >= usage.available);
		assert!(filesystem_usage(std::path::Path::new("/no/such/mount")).is_err());
	}

	#[test]
	fn reads_a_numeric_user() {
		assert_eq!(numeric_user("65532:65532"), Some((65532, 65532)));
		assert_eq!(numeric_user("1000"), Some((1000, 1000)));
		assert_eq!(numeric_user("0:0"), None);
		assert_eq!(numeric_user("nobody"), None);
		assert_eq!(numeric_user(""), None);
	}

	#[test]
	fn the_scheduler_shape_mounts_its_own_directory_and_every_socket_service() {
		let own = Some(bind("/data/apps/cron/data".into(), "/state".into(), false));
		let sockets = vec![
			("apt".to_owned(), PathBuf::from("/data/apps/apt/data")),
			("shot".to_owned(), PathBuf::from("/data/apps/shot/data")),
		];
		let mounts = scheduler_mounts(own, &sockets);
		assert_eq!(mounts.len(), 3);
		assert_eq!(
			(mounts[0].source.as_deref(), mounts[0].target.as_deref()),
			(Some("/data/apps/cron/data"), Some("/state"))
		);
		assert_eq!(
			(mounts[1].source.as_deref(), mounts[1].target.as_deref()),
			(Some("/data/apps/apt/data"), Some("/sockets/apt"))
		);
		assert_eq!(
			(mounts[2].source.as_deref(), mounts[2].target.as_deref()),
			(Some("/data/apps/shot/data"), Some("/sockets/shot"))
		);
		assert!(mounts.iter().all(|mount| mount.read_only == Some(false)));
		assert!(scheduler_mounts(None, &[]).is_empty());
	}

	#[test]
	fn the_steward_shape_mounts_the_machines_dbus_socket() {
		let mounts = steward_mounts(None);
		assert_eq!(mounts.len(), 1);
		assert_eq!(mounts[0].source.as_deref(), Some(DBUS_SOCKET));
		assert_eq!(mounts[0].target.as_deref(), Some(DBUS_SOCKET));
		assert_eq!(mounts[0].read_only, Some(false));
		let own = Some(bind("/data/apps/apt/data".into(), "/state".into(), false));
		assert_eq!(steward_mounts(own).len(), 2);
	}
}
