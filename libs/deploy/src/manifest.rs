//! The declaration an app ships beside its image: what host needs in order to run it, and nothing
//! about how. What it may ask for is decided here -- see spec/architecture/host.md, "What a
//! deployment may ask for is host's decision".

use serde::{Deserialize, Serialize};
use std::ops::RangeInclusive;

/// The declaration format this host reads. Bumped only when an older host could no longer make
/// sense of a newer file; a key an older host can ignore is not a bump. See spec/json.md.
pub const VERSION: u32 = 1;

/// Names taken by the platform itself: its two programs, the agent that watches the machine, the
/// API host and the Worker answering it, and the containers an app's name would collide with.
const RESERVED: [&str; 7] = ["host", "keeper", "agent", "api", "gateway", "caddy", "cloudflared"];

/// The reserved names the platform still deploys, each in a shape its name alone chooses: host and
/// keeper, which each deploy the other, and the agent. See spec/architecture/host.md, "host never
/// updates itself; keeper updates host", and spec/architecture/agent.md.
pub const OWN: [&str; 3] = ["host", "keeper", "agent"];

/// The placement that is Cloudflare's Workers rather than a node. Cloudflare deploys it, so no host
/// ever runs what is placed there. See spec/architecture/services.md, "A Workers placement is
/// deployed by Cloudflare, not by host".
pub const WORKERS: &str = "workers";

/// See spec/architecture/services.md, "A service keeps one port".
pub const PORTS: RangeInclusive<u16> = 10000..=32767;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Manifest {
	pub version: u32,
	pub name: String,
	pub placements: Vec<String>,
	/// What a node runs. Absent from a service placed on Workers alone, and required on a node.
	#[serde(default, skip_serializing_if = "Option::is_none")]
	pub container: Option<Container>,
	#[serde(default, skip_serializing_if = "Option::is_none")]
	pub api: Option<Api>,
	#[serde(default, skip_serializing_if = "Option::is_none")]
	pub interface: Option<Interface>,
	#[serde(default, skip_serializing_if = "Option::is_none")]
	pub data: Option<Data>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Container {
	/// Where it answers over its network. A container answers on a port or on a socket, never both.
	#[serde(default, skip_serializing_if = "Option::is_none")]
	pub port: Option<u16>,
	/// A socket file in its own directory, for a container with no network; see
	/// spec/architecture/agent.md, "Reached through a socket".
	#[serde(default, skip_serializing_if = "Option::is_none")]
	pub socket: Option<String>,
	pub health: String,
	/// Seconds a new version has to report healthy before the deploy is called failed.
	#[serde(default, skip_serializing_if = "Option::is_none")]
	pub health_timeout: Option<u64>,
	#[serde(default, skip_serializing_if = "Option::is_none")]
	pub memory_mb: Option<u32>,
}

/// Reached as a scope of the API host.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Api {
	#[serde(default)]
	pub public: bool,
	/// Where a Worker answers its API beside its pages. Only a Workers placement serves one: a
	/// node's Caddy forwards a scope to the container's root. See spec/architecture/services.md,
	/// "The site's API runs in the site's Worker".
	#[serde(default, skip_serializing_if = "Option::is_none")]
	pub prefix: Option<String>,
}

/// Reached as a subdomain of its own, privately and -- unless it says otherwise -- publicly
/// behind Access. See spec/architecture/services.md.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Interface {
	#[serde(default = "public_by_default")]
	pub public: bool,
}

fn public_by_default() -> bool {
	true
}

/// Where in the container the app's own directory is mounted.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Data {
	pub path: String,
}

#[derive(Debug, thiserror::Error, PartialEq)]
pub enum Invalid {
	#[error("the declaration is not readable: {0}")]
	Malformed(String),
	#[error("declaration version {0} is not one this host reads; it reads {VERSION}")]
	Version(u32),
	#[error("`{0}` is not a name: lowercase letters, digits and inner hyphens, at most 63")]
	Name(String),
	#[error("`{0}` is reserved for the platform")]
	Reserved(String),
	#[error("the declaration says `{declared}` but it was sent as `{requested}`")]
	Mismatch { declared: String, requested: String },
	#[error("`{name}` is not placed on `{node}`")]
	NotPlaced { name: String, node: String },
	#[error("`{0}` declares no container for a node to run")]
	NoContainer(String),
	#[error("port {0} is outside {start}-{end}", start = PORTS.start(), end = PORTS.end())]
	Port(u16),
	#[error("a container answers on a port or on a socket, exactly one of the two")]
	Answer,
	#[error("a socket is a file name in the app's own directory, which `[data]` has to mount")]
	Socket,
	#[error("an app on a socket has no port for an API or an interface to reach")]
	Unroutable,
	#[error("the health path has to start with `/`")]
	Health,
	#[error("the data path has to be absolute")]
	DataPath,
	#[error("an API prefix is served on Workers alone, never by a node")]
	Prefix,
}

impl Manifest {
	/// Read a declaration, refusing a version this host does not know before reading the rest.
	pub fn parse(text: &str) -> Result<Self, Invalid> {
		let table: toml::Table =
			text.parse().map_err(|e: toml::de::Error| Invalid::Malformed(e.to_string()))?;
		let version = table
			.get("version")
			.and_then(toml::Value::as_integer)
			.ok_or_else(|| Invalid::Malformed("no `version`".into()))?;
		let version = u32::try_from(version)
			.map_err(|_| Invalid::Malformed("`version` is not a version".into()))?;
		if version != VERSION {
			return Err(Invalid::Version(version));
		}
		toml::from_str(text).map_err(|e: toml::de::Error| Invalid::Malformed(e.to_string()))
	}

	/// Whether this node may run it under the name it was sent as.
	pub fn check(&self, requested: &str, node: &str) -> Result<(), Invalid> {
		check_name(requested)?;
		self.check_rest(requested, node)
	}

	/// The same, for one of the platform's own, whose names are otherwise reserved.
	pub fn check_own(&self, requested: &str, node: &str) -> Result<(), Invalid> {
		if !OWN.contains(&requested) {
			return Err(Invalid::Name(requested.into()));
		}
		self.check_rest(requested, node)
	}

	fn check_rest(&self, requested: &str, node: &str) -> Result<(), Invalid> {
		if self.name != requested {
			return Err(Invalid::Mismatch { declared: self.name.clone(), requested: requested.into() });
		}
		if !self.placements.iter().any(|placement| placement == node) {
			return Err(Invalid::NotPlaced { name: self.name.clone(), node: node.into() });
		}
		let Some(container) = &self.container else {
			return Err(Invalid::NoContainer(self.name.clone()));
		};
		match (container.port, &container.socket) {
			(Some(port), None) if !PORTS.contains(&port) => return Err(Invalid::Port(port)),
			(Some(_), None) => {}
			(None, Some(socket)) => {
				let file = !socket.is_empty() && !socket.contains('/') && socket != "." && socket != "..";
				if !file || self.data.is_none() {
					return Err(Invalid::Socket);
				}
				if self.api.is_some() || self.interface.is_some() {
					return Err(Invalid::Unroutable);
				}
			}
			_ => return Err(Invalid::Answer),
		}
		if !container.health.starts_with('/') {
			return Err(Invalid::Health);
		}
		if self.data.as_ref().is_some_and(|data| !data.path.starts_with('/')) {
			return Err(Invalid::DataPath);
		}
		if self.api.as_ref().is_some_and(|api| api.prefix.is_some()) {
			return Err(Invalid::Prefix);
		}
		Ok(())
	}
}

/// One DNS label, and not one of the platform's own. Every place an app appears is this name, so
/// it has to be valid in all of them at once.
pub fn check_name(name: &str) -> Result<(), Invalid> {
	let label = !name.is_empty()
		&& name.len() <= 63
		&& !name.starts_with('-')
		&& !name.ends_with('-')
		&& name.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-');
	if !label {
		return Err(Invalid::Name(name.into()));
	}
	if RESERVED.contains(&name) {
		return Err(Invalid::Reserved(name.into()));
	}
	Ok(())
}

#[cfg(test)]
mod tests {
	use super::*;

	/// The file geo ships. Two programs read this format, so the reader is tested against a real
	/// declaration rather than one written to suit it.
	const GEO: &str = include_str!("../../../apps/geo/service.toml");

	#[test]
	fn reads_the_declaration_geo_ships() {
		let manifest = Manifest::parse(GEO).unwrap();
		assert_eq!(manifest.name, "geo");
		assert_eq!(manifest.api, Some(Api { public: true, prefix: None }));
		assert_eq!(manifest.check("geo", "home"), Ok(()));
	}

	#[test]
	fn an_unknown_version_is_refused_before_anything_else_is_read() {
		let newer = GEO.replace("version = 1", "version = 2").replace("port =", "port_moved =");
		assert_eq!(Manifest::parse(&newer), Err(Invalid::Version(2)));
	}

	#[test]
	fn an_unknown_key_is_ignored() {
		// A key a newer declaration adds is compatible by definition; refusing it would turn every
		// addition into an outage on the hosts not yet updated. See spec/json.md.
		assert!(Manifest::parse(&format!("{GEO}\nlater = true\n")).is_ok());
	}

	#[test]
	fn names_are_labels_and_not_the_platforms() {
		assert!(check_name("geo").is_ok());
		assert!(check_name("ip-lookup2").is_ok());
		assert_eq!(check_name("Geo"), Err(Invalid::Name("Geo".into())));
		assert_eq!(check_name("-geo"), Err(Invalid::Name("-geo".into())));
		assert_eq!(check_name("geo_ip"), Err(Invalid::Name("geo_ip".into())));
		assert_eq!(check_name("api"), Err(Invalid::Reserved("api".into())));
		assert_eq!(check_name("caddy"), Err(Invalid::Reserved("caddy".into())));
	}

	#[test]
	fn a_node_runs_only_what_is_placed_on_it() {
		let manifest = Manifest::parse(GEO).unwrap();
		assert_eq!(
			manifest.check("geo", "vps"),
			Err(Invalid::NotPlaced { name: "geo".into(), node: "vps".into() })
		);
		assert!(matches!(manifest.check("other", "home"), Err(Invalid::Mismatch { .. })));
	}

	#[test]
	fn only_the_platforms_own_pass_its_own_check() {
		let mut manifest = Manifest::parse(GEO).unwrap();
		manifest.name = "keeper".into();
		assert_eq!(manifest.check_own("keeper", "home"), Ok(()));
		// The ordinary check still refuses the name, so no app can be sent as keeper.
		assert_eq!(manifest.check("keeper", "home"), Err(Invalid::Reserved("keeper".into())));
		assert_eq!(check_name("agent"), Err(Invalid::Reserved("agent".into())));
		manifest.name = "api".into();
		assert_eq!(manifest.check_own("api", "home"), Err(Invalid::Name("api".into())));
	}

	#[test]
	fn a_default_port_is_refused() {
		let mut manifest = Manifest::parse(GEO).unwrap();
		manifest.container.as_mut().unwrap().port = Some(8080);
		assert_eq!(manifest.check("geo", "home"), Err(Invalid::Port(8080)));
	}

	#[test]
	fn a_container_answers_on_a_port_or_a_socket() {
		let socketed = |extra: &str| {
			Manifest::parse(&format!(
				"version = 1\nname = \"probe\"\nplacements = [\"home\"]\n{extra}\n[container]\nhealth = \"/health\"\nsocket = \"probe.sock\"\n[data]\npath = \"/data\"\n"
			))
			.unwrap()
		};
		assert_eq!(socketed("").check("probe", "home"), Ok(()));
		let mut both = socketed("");
		both.container.as_mut().unwrap().port = Some(20000);
		assert_eq!(both.check("probe", "home"), Err(Invalid::Answer));
		let mut neither = socketed("");
		neither.container.as_mut().unwrap().socket = None;
		assert_eq!(neither.check("probe", "home"), Err(Invalid::Answer));
		let mut nested = socketed("");
		nested.container.as_mut().unwrap().socket = Some("../probe.sock".into());
		assert_eq!(nested.check("probe", "home"), Err(Invalid::Socket));
		let mut homeless = socketed("");
		homeless.data = None;
		assert_eq!(homeless.check("probe", "home"), Err(Invalid::Socket));
		let routed = socketed("[api]\npublic = false");
		assert_eq!(routed.check("probe", "home"), Err(Invalid::Unroutable));
	}

	#[test]
	fn a_node_refuses_a_service_with_no_container() {
		let manifest =
			Manifest::parse("version = 1\nname = \"edge\"\nplacements = [\"workers\", \"home\"]\n")
				.unwrap();
		assert_eq!(manifest.check("edge", "home"), Err(Invalid::NoContainer("edge".into())));
	}

	#[test]
	fn every_declaration_in_the_repository_is_one_this_reader_takes() {
		// The gateway's table is generated from these files by a second reader, so this one has to
		// accept each of them too. See apps/gateway/scripts/scopes.ts.
		let apps = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../apps");
		let mut read = 0;
		for entry in std::fs::read_dir(apps).unwrap() {
			let path = entry.unwrap().path().join("service.toml");
			let Ok(text) = std::fs::read_to_string(&path) else { continue };
			let manifest = Manifest::parse(&text).unwrap_or_else(|e| panic!("{}: {e}", path.display()));
			let node = manifest.placements.iter().find(|placement| *placement != WORKERS);
			if let Some(node) = node {
				let checked = if OWN.contains(&manifest.name.as_str()) {
					manifest.check_own(&manifest.name, node)
				} else {
					manifest.check(&manifest.name, node)
				};
				assert_eq!(checked, Ok(()), "{}", path.display());
			}
			read += 1;
		}
		assert!(read >= 3);
	}

	#[test]
	fn a_node_refuses_an_api_prefix() {
		let mut manifest = Manifest::parse(GEO).unwrap();
		manifest.api.as_mut().unwrap().prefix = Some("/api".into());
		assert_eq!(manifest.check("geo", "home"), Err(Invalid::Prefix));
	}
}
