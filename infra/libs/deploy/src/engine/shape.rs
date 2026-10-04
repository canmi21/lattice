//! How a container is run, by shape: what each is allowed, and the one `run` that turns a shape
//! into a container. See spec/architecture/host.md, "What a deployment may ask for is host's
//! decision".

use super::{DEFAULT_MEMORY_MB, Engine, Error, VERSION_LABEL, Version, network_of};
use bollard::models::{
	ContainerCreateBody, EndpointIpamConfig, EndpointSettings, HostConfig, HostConfigLogConfig,
	Mount, MountType, PortBinding, RestartPolicy, RestartPolicyNameEnum,
};
use bollard::query_parameters::CreateContainerOptionsBuilder;
use std::collections::HashMap;
use std::path::{Path, PathBuf};

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
	/// `telemetry` only: sandboxed like any app, on its own network, plus the meter's data
	/// directory, `meter`, bound read-only at `socket_mount("meter")`. See
	/// spec/architecture/telemetry.md, "Where it comes from".
	Reporter { env: Vec<String>, meter: PathBuf },
	/// The resolver only: sandboxed on its own network, DNS published on the node's LAN `address`
	/// alone, and its configuration, which host writes, read-only. See spec/architecture/host.md,
	/// "The resolver answers the gateway's names, and passes the rest on".
	Resolver { env: Vec<String>, address: String },
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

/// The port the resolver answers DNS on inside its container, above the ones a user may not bind,
/// and what it is published as on the node.
pub const RESOLVER_PORTS: [(&str, &str); 2] = [("1053/udp", "53"), ("1053/tcp", "53")];

/// Where the resolver shape mounts host's rendered configuration, read-only.
pub const RESOLVER_MOUNT: (&str, &str) = ("host", "/etc/coredns");

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
pub(super) fn socket_service_of(destination: &str) -> Option<String> {
	let remainder = destination.strip_prefix(&socket_mount(""))?;
	if remainder.is_empty() || remainder.contains('/') {
		return None;
	}
	Some(remainder.to_owned())
}

/// The machine's D-Bus system bus socket, mounted into the steward shape at the same path. See
/// spec/architecture/apt.md, "The door".
pub const DBUS_SOCKET: &str = "/run/dbus/system_bus_socket";

/// A structured mount rather than a `source:target` string, which a target containing a colon could
/// extend with options of its own.
pub(crate) fn bind(source: String, target: String, read_only: bool) -> Mount {
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
pub(super) fn scheduler_mounts(own: Option<Mount>, sockets: &[(String, PathBuf)]) -> Vec<Mount> {
	own
		.into_iter()
		.chain(
			sockets
				.iter()
				.map(|(service, source)| bind(source.display().to_string(), socket_mount(service), false)),
		)
		.collect()
}

/// The reporter shape's mounts: the app's own directory, if declared, plus the meter's data
/// directory at `/sockets/meter`, read-only -- telemetry asks and never changes. See
/// spec/architecture/telemetry.md, "Where it comes from".
pub(super) fn reporter_mounts(own: Option<Mount>, meter: &Path) -> Vec<Mount> {
	own
		.into_iter()
		.chain(std::iter::once(bind(meter.display().to_string(), socket_mount("meter"), true)))
		.collect()
}

/// The steward shape's mounts: the app's own directory, if declared, plus the machine's D-Bus
/// system bus socket at the same path. See spec/architecture/apt.md.
pub(super) fn steward_mounts(own: Option<Mount>) -> Vec<Mount> {
	own
		.into_iter()
		.chain(std::iter::once(bind(DBUS_SOCKET.into(), DBUS_SOCKET.into(), false)))
		.collect()
}

/// How every tmpfs a container writes its scratch to is mounted.
pub(crate) const SCRATCH: &str = "rw,noexec,nosuid,size=64m";

/// What every app's container is allowed, on `network` with `mounts` and `memory` bytes: no
/// capabilities, a read-only root, a ceiling with no swap past it, and every line kept -- see
/// spec/architecture/host.md, "What a deployment may ask for is host's decision".
pub(crate) fn sandbox(network: String, mounts: Vec<Mount>, memory: i64) -> HostConfig {
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
		tmpfs: Some(HashMap::from([("/tmp".into(), SCRATCH.into())])),
		memory: Some(memory),
		memory_swap: Some(memory),
		pids_limit: Some(512),
		init: Some(true),
		// Not rotated: see spec/architecture/host.md, "Every line an app writes is kept".
		log_config: Some(HostConfigLogConfig { typ: Some("json-file".into()), config: None }),
		..Default::default()
	}
}

impl Engine {
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
			Shape::Reporter { env, meter } => (sandboxed(reporter_mounts(own, meter)), env.clone()),
			Shape::Resolver { env, address } => {
				let (from, to) = RESOLVER_MOUNT;
				let beside = data.parent().unwrap_or(data).join(from);
				tokio::fs::create_dir_all(&beside)
					.await
					.map_err(|source| Error::Directory { path: beside.display().to_string(), source })?;
				let configured = bind(beside.display().to_string(), to.into(), true);
				let published = RESOLVER_PORTS.iter().map(|(inside, outside)| {
					let binding =
						PortBinding { host_ip: Some(address.clone()), host_port: Some((*outside).into()) };
					((*inside).to_owned(), Some(vec![binding]))
				});
				let config = HostConfig {
					port_bindings: Some(published.collect()),
					..sandboxed(own.into_iter().chain(std::iter::once(configured)).collect())
				};
				(config, env.clone())
			}
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
			exposed_ports: match shape {
				Shape::Edge { .. } => Some(EDGE_PORTS.iter().map(|port| (*port).to_owned()).collect()),
				Shape::Resolver { .. } => {
					Some(RESOLVER_PORTS.iter().map(|(inside, _)| (*inside).to_owned()).collect())
				}
				_ => None,
			},
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
}
