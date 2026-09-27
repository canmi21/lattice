//! The declaration an app ships beside its image: what host needs in order to run it, and nothing
//! about how. What it may ask for is decided here -- see spec/architecture/host.md, "What a
//! deployment may ask for is host's decision".

use serde::{Deserialize, Serialize};
use std::ops::RangeInclusive;

/// The declaration format this host reads. Bumped only when an older host could no longer make
/// sense of a newer file; a key an older host can ignore is not a bump. See spec/json.md.
pub const VERSION: u32 = 1;

/// Names taken by the platform itself: its two programs, the API host, and the infrastructure
/// containers an app's container name would collide with.
const RESERVED: [&str; 5] = ["host", "keeper", "api", "caddy", "cloudflared"];

/// The two programs of the platform, which each deploy the other and which alone run in the
/// platform's shape. See spec/architecture/host.md, "host never updates itself; keeper updates
/// host".
pub const PLATFORM: [&str; 2] = ["host", "keeper"];

/// See spec/architecture/services.md, "A service keeps one port".
pub const PORTS: RangeInclusive<u16> = 10000..=32767;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Manifest {
	pub version: u32,
	pub name: String,
	pub placements: Vec<String>,
	pub container: Container,
	#[serde(default, skip_serializing_if = "Option::is_none")]
	pub api: Option<Api>,
	#[serde(default, skip_serializing_if = "Option::is_none")]
	pub interface: Option<Interface>,
	#[serde(default, skip_serializing_if = "Option::is_none")]
	pub data: Option<Data>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Container {
	pub port: u16,
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
	#[error("port {0} is outside {start}-{end}", start = PORTS.start(), end = PORTS.end())]
	Port(u16),
	#[error("the health path has to start with `/`")]
	Health,
	#[error("the data path has to be absolute")]
	DataPath,
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

	/// The same, for one of the platform's own programs, whose names are otherwise reserved.
	pub fn check_platform(&self, requested: &str, node: &str) -> Result<(), Invalid> {
		if !PLATFORM.contains(&requested) {
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
		if !PORTS.contains(&self.container.port) {
			return Err(Invalid::Port(self.container.port));
		}
		if !self.container.health.starts_with('/') {
			return Err(Invalid::Health);
		}
		if self.data.as_ref().is_some_and(|data| !data.path.starts_with('/')) {
			return Err(Invalid::DataPath);
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
		assert_eq!(manifest.api, Some(Api { public: false }));
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
	fn only_the_two_platform_programs_pass_the_platform_check() {
		let mut manifest = Manifest::parse(GEO).unwrap();
		manifest.name = "keeper".into();
		assert_eq!(manifest.check_platform("keeper", "home"), Ok(()));
		// The ordinary check still refuses the name, so no app can be sent as keeper.
		assert_eq!(manifest.check("keeper", "home"), Err(Invalid::Reserved("keeper".into())));
		manifest.name = "api".into();
		assert_eq!(manifest.check_platform("api", "home"), Err(Invalid::Name("api".into())));
	}

	#[test]
	fn a_default_port_is_refused() {
		let mut manifest = Manifest::parse(GEO).unwrap();
		manifest.container.port = 8080;
		assert_eq!(manifest.check("geo", "home"), Err(Invalid::Port(8080)));
	}
}
