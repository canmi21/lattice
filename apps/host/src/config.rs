//! Everything host is told about the node it runs on. Read from the environment, which on the
//! machine is the `.env` beside host's `docker-compose.yml`: the domains are facts about this
//! node's network, not about the program, so none of them is written into it.

use std::net::SocketAddr;
use std::path::PathBuf;

/// host's own port, after the machine's address ending in .11. See spec/architecture/services.md,
/// "A service keeps one port".
pub const PORT: u16 = 11011;

#[derive(Debug, Clone)]
pub struct Config {
	/// This node's placement name, matched against what a declaration lists.
	pub node: String,
	pub token: String,
	pub listen: SocketAddr,
	/// This container's own name, which it attaches to each app's network to check its health.
	pub own_container: String,
	/// Where each app's subvolume lives, and where their snapshots are kept.
	pub apps_root: PathBuf,
	pub snapshots_root: PathBuf,
	pub state: PathBuf,
	/// Where uploaded archives wait while they are loaded.
	pub incoming: PathBuf,
	/// The node's one `.env`, which keeper is started with as host is.
	pub platform_env: PathBuf,
	pub caddy: CaddyConfig,
}

#[derive(Debug, Clone)]
pub struct CaddyConfig {
	pub container: String,
	/// The admin socket, as this container sees it.
	pub admin_socket: PathBuf,
	/// The file Caddy starts from, as this container sees it.
	pub config_file: PathBuf,
	/// The admin socket as Caddy sees it, which is what the rendered configuration names.
	pub admin_listen: String,
	pub private_suffix: String,
	pub public_suffix: String,
	/// Sources admitted to the private suffix: the LAN, the tailnet, the machine itself.
	pub private_sources: Vec<String>,
	/// cloudflared's address, the one source admitted to the public suffix.
	pub tunnel_source: String,
	pub acme_email: String,
	pub dns_resolver: String,
}

#[derive(Debug, thiserror::Error)]
pub enum Missing {
	#[error("`{0}` is not set")]
	Unset(&'static str),
	#[error("`{0}` is set but unreadable: {1}")]
	Unreadable(&'static str, String),
}

fn required(key: &'static str) -> Result<String, Missing> {
	std::env::var(key).ok().filter(|value| !value.is_empty()).ok_or(Missing::Unset(key))
}

fn optional(key: &'static str, default: &str) -> String {
	std::env::var(key).ok().filter(|value| !value.is_empty()).unwrap_or_else(|| default.into())
}

impl Config {
	pub fn from_env() -> Result<Self, Missing> {
		let listen = optional("LISTEN", &format!("0.0.0.0:{PORT}"));
		let listen = listen
			.parse()
			.map_err(|e: std::net::AddrParseError| Missing::Unreadable("LISTEN", e.to_string()))?;
		let apps_root = PathBuf::from(optional("APPS_ROOT", "/data/apps"));
		let caddy_root = apps_root.join("caddy");
		Ok(Self {
			node: required("NODE")?,
			token: required("HOST_TOKEN")?,
			listen,
			own_container: optional("OWN_CONTAINER", "host"),
			snapshots_root: PathBuf::from(optional("SNAPSHOTS_ROOT", "/data/.snapshots")),
			state: apps_root.join("host").join("data").join("host.db"),
			incoming: apps_root.join("host").join("data").join("incoming"),
			platform_env: apps_root.join("host").join(".env"),
			caddy: CaddyConfig {
				container: optional("CADDY_CONTAINER", "caddy"),
				admin_socket: caddy_root.join("run").join("admin.sock"),
				config_file: caddy_root.join("host").join("caddy.json"),
				admin_listen: "unix//run/caddy/admin.sock".into(),
				private_suffix: required("PRIVATE_SUFFIX")?,
				public_suffix: required("PUBLIC_SUFFIX")?,
				private_sources: required("PRIVATE_SOURCES")?
					.split(',')
					.map(|s| s.trim().to_owned())
					.collect(),
				tunnel_source: required("TUNNEL_SOURCE")?,
				acme_email: required("ACME_EMAIL")?,
				dns_resolver: optional("DNS_RESOLVER", "1.1.1.1"),
			},
			apps_root,
		})
	}
}

#[cfg(test)]
mod tests {
	#[test]
	fn the_port_is_the_one_the_declaration_states() {
		let declaration = include_str!("../service.toml");
		assert!(declaration.lines().any(|line| line.trim() == format!("port = {}", super::PORT)));
	}
}
