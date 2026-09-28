//! The declaration an app ships beside its image: what host needs in order to run it, and nothing
//! about how. What it may ask for is decided here -- see spec/architecture/host.md, "What a
//! deployment may ask for is host's decision".

use serde::{Deserialize, Serialize};
use std::ops::RangeInclusive;

/// The declaration format this host reads. Bumped only when an older host could no longer make
/// sense of a newer file; a key an older host can ignore is not a bump. See spec/json.md.
pub const VERSION: u32 = 1;

/// Names taken by the platform itself: its programs, the meter that watches the machine, the API
/// host and the Worker answering it, the object storage driver, and the containers an app's name
/// would collide with.
const RESERVED: [&str; 10] = [
	"host",
	"keeper",
	"meter",
	"api",
	"gateway",
	"caddy",
	"tunnel",
	"panel",
	"cloudflared",
	"objects",
];

/// What an app's object storage sidecar is named after it, so no app may end its own name so. See
/// spec/architecture/objects.md, "A sidecar per app, over the app's own directory".
pub const SIDECAR_SUFFIX: &str = "-objects";

/// The object storage driver: the image every sidecar runs, deployed and never run itself. See
/// spec/architecture/objects.md, "The driver is deployed like an app, and is not one".
pub const OBJECTS: &str = "objects";

/// Labels reserved for what is on its way, not yet a real app or route: `cms`, the editor, which
/// keeps its own address until it moves. See spec/architecture/host.md, "One name inside, and a
/// domain label outside".
const RESERVED_LABELS: [&str; 1] = ["cms"];

/// The reserved names the platform still deploys, each in a shape its name alone chooses: host and
/// keeper, which each deploy the other, the meter, Caddy, the tunnel, the panel and the object
/// storage driver. See spec/architecture/host.md, "host never updates itself; keeper updates host",
/// spec/architecture/meter.md and spec/architecture/objects.md.
pub const OWN: [&str; 7] = ["host", "keeper", "meter", "caddy", "tunnel", "panel", "objects"];

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
	#[serde(default, skip_serializing_if = "Option::is_none")]
	pub objects: Option<Objects>,
}

impl Manifest {
	/// The container its object storage runs in, when it declares any.
	pub fn sidecar(&self) -> Option<String> {
		self.objects.as_ref().map(|_| sidecar_of(&self.name))
	}
}

/// The name of `app`'s object storage sidecar.
pub fn sidecar_of(app: &str) -> String {
	format!("{app}{SIDECAR_SUFFIX}")
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Container {
	/// Where it answers over its network. A container answers on a port or on a socket, never both.
	#[serde(default, skip_serializing_if = "Option::is_none")]
	pub port: Option<u16>,
	/// A socket file in its own directory, for a container with no network; see
	/// spec/architecture/meter.md, "Reached through a socket".
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
	/// How often one address may call a route: the gateway counts it for the public and Caddy for
	/// everything a node answers, so the service itself counts nothing. See
	/// spec/architecture/services.md, "A limit is declared once and kept in three places".
	#[serde(default, skip_serializing_if = "Vec::is_empty")]
	pub limits: Vec<Limit>,
}

/// One route's allowance: `count` calls in `seconds`, by one address, on these methods.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Limit {
	pub methods: Vec<String>,
	/// The path as the service sees it, with the scope taken off.
	pub path: String,
	pub count: u32,
	pub seconds: u32,
}

/// The longest window a limit may count over: a day. Anything longer is a quota, not a limit.
pub const LONGEST_WINDOW: u32 = 86_400;

/// Reached as a subdomain of its own: always on `.app`, behind Access, and on `.icu` too unless
/// `lan` says otherwise. See spec/architecture/host.md, "One name inside, and a domain label
/// outside", and spec/architecture/services.md, "A domain says who can reach it, not what is
/// behind it".
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Interface {
	/// The DNS label this interface answers on, in place of the app's own name. Apps and routes
	/// share one namespace of labels: no two things answer on one label.
	#[serde(default, skip_serializing_if = "Option::is_none")]
	pub domain: Option<String>,
	/// Whether the label is also on `.icu`, the LAN's mirror of `.app`. `.app` always carries it.
	#[serde(default = "lan_by_default")]
	pub lan: bool,
	/// Where a request for exactly `/` is sent, when the app's own page is not at its root.
	#[serde(default, skip_serializing_if = "Option::is_none")]
	pub home: Option<String>,
}

impl Interface {
	/// The label this interface answers on: its own `domain`, or the app's name.
	pub fn label<'a>(&'a self, name: &'a str) -> &'a str {
		self.domain.as_deref().unwrap_or(name)
	}
}

/// Whether `home` stays on the name it is set for. `/` would send the root to itself forever; `//`
/// and `/\` are read by a browser as another site entirely, which would make the name an open
/// redirect; and a control character has no business in the `Location` it becomes.
pub fn is_home(home: &str) -> bool {
	home.starts_with('/')
		&& home != "/"
		&& !home.starts_with("//")
		&& !home.starts_with("/\\")
		&& !home.chars().any(char::is_control)
}

fn lan_by_default() -> bool {
	true
}

/// Where in the container the app's own directory is mounted.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Data {
	pub path: String,
}

/// An S3 endpoint of the app's own, over `objects/` in its directory, each bucket a directory
/// there.
/// See spec/architecture/objects.md.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Objects {
	pub buckets: Vec<String>,
}

/// Whether `name` is a bucket S3 itself would take: 3 to 63 lowercase letters, digits, hyphens and
/// dots, starting and ending with a letter or digit, no two dots together, not an IPv4 address,
/// and none of the prefixes and suffixes AWS keeps for itself.
pub fn is_bucket(name: &str) -> bool {
	let edge = |b: Option<u8>| b.is_some_and(|b| b.is_ascii_lowercase() || b.is_ascii_digit());
	(3..=63).contains(&name.len())
		&& name.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-' || b == b'.')
		&& edge(name.bytes().next())
		&& edge(name.bytes().last())
		&& !name.contains("..")
		&& name.parse::<std::net::Ipv4Addr>().is_err()
		&& !["xn--", "sthree-", "amzn-s3-demo-"].iter().any(|prefix| name.starts_with(prefix))
		&& !["-s3alias", "--ol-s3", "--x-s3", "--table-s3"].iter().any(|suffix| name.ends_with(suffix))
}

#[derive(Debug, thiserror::Error, PartialEq)]
pub enum Invalid {
	#[error("the declaration is not readable: {0}")]
	Malformed(String),
	#[error("declaration version {0} is not one this host reads; it reads {VERSION}")]
	Version(u32),
	#[error("`{0}` is not a name: lowercase letters, digits and inner hyphens, at most 63")]
	Name(String),
	#[error("`{0}` is not a label: lowercase letters, digits and inner hyphens, at most 63")]
	Label(String),
	#[error("`{0}` is reserved")]
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
	#[error("a home is a path on the app's own site other than `/`")]
	Home,
	#[error("an API prefix is served on Workers alone, never by a node")]
	Prefix,
	#[error(
		"a limit names HTTP methods and a path from /, and allows at least once in 1 to 86400 seconds"
	)]
	Limit,
	#[error("`{0}` is not a bucket name S3 takes")]
	Bucket(String),
	#[error("`[objects]` names at least one bucket, each once")]
	Buckets,
	#[error("`{0}-objects` is longer than the 63 characters a container's name on a network may be")]
	SidecarName(String),
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
		let home = self.interface.as_ref().and_then(|interface| interface.home.as_deref());
		if home.is_some_and(|home| !is_home(home)) {
			return Err(Invalid::Home);
		}
		if let Some(domain) = self.interface.as_ref().and_then(|interface| interface.domain.as_deref())
		{
			check_domain(domain)?;
		}
		if self.api.as_ref().is_some_and(|api| api.prefix.is_some()) {
			return Err(Invalid::Prefix);
		}
		let methods = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"];
		let sound = |limit: &Limit| {
			!limit.methods.is_empty()
				&& limit.methods.iter().all(|method| methods.contains(&method.as_str()))
				&& limit.path.starts_with('/')
				&& !limit.path.contains('*')
				&& limit.count > 0
				&& (1..=LONGEST_WINDOW).contains(&limit.seconds)
		};
		// The gateway counts a call under the first row that covers it and Caddy under every one,
		// so no call may be covered twice.
		let covered = |api: &Api| {
			let mut seen = std::collections::HashSet::new();
			api.limits.iter().all(|limit| {
				limit.methods.iter().all(|method| seen.insert((method.as_str(), limit.path.as_str())))
			})
		};
		if self.api.as_ref().is_some_and(|api| !api.limits.iter().all(sound) || !covered(api)) {
			return Err(Invalid::Limit);
		}
		if let Some(objects) = &self.objects {
			check_objects(&self.name, objects)?;
		}
		Ok(())
	}
}

/// Buckets S3 takes, each once, and a sidecar name that resolves on the app's network. See
/// spec/architecture/objects.md, "A sidecar per app, over the app's own directory".
fn check_objects(name: &str, objects: &Objects) -> Result<(), Invalid> {
	if let Some(bucket) = objects.buckets.iter().find(|bucket| !is_bucket(bucket)) {
		return Err(Invalid::Bucket(bucket.clone()));
	}
	let distinct: std::collections::HashSet<&String> = objects.buckets.iter().collect();
	if objects.buckets.is_empty() || distinct.len() != objects.buckets.len() {
		return Err(Invalid::Buckets);
	}
	if !is_label(&sidecar_of(name)) {
		return Err(Invalid::SidecarName(name.into()));
	}
	Ok(())
}

/// The shape of any DNS label this format uses, name or domain alike.
fn is_label(value: &str) -> bool {
	!value.is_empty()
		&& value.len() <= 63
		&& !value.starts_with('-')
		&& !value.ends_with('-')
		&& value.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
}

/// One DNS label, and not one of the platform's own. Every place an app appears is this name, so
/// it has to be valid in all of them at once.
pub fn check_name(name: &str) -> Result<(), Invalid> {
	if !is_label(name) {
		return Err(Invalid::Name(name.into()));
	}
	if RESERVED.contains(&name) || RESERVED_LABELS.contains(&name) || name.ends_with(SIDECAR_SUFFIX) {
		return Err(Invalid::Reserved(name.into()));
	}
	Ok(())
}

/// A label an interface or a route answers on: `domain`, or a route's own name. Apps and routes
/// share this one namespace, on top of a smaller reserved list than a name's -- see
/// spec/architecture/host.md, "One name inside, and a domain label outside". Whether it collides
/// with another app or route already answering on it is checked where both are known, in host's
/// store.
pub fn check_domain(domain: &str) -> Result<(), Invalid> {
	if !is_label(domain) {
		return Err(Invalid::Label(domain.into()));
	}
	if RESERVED.contains(&domain) || RESERVED_LABELS.contains(&domain) {
		return Err(Invalid::Reserved(domain.into()));
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
		assert_eq!(manifest.data, Some(Data { path: "/state".into() }));
		let limits = vec![
			Limit {
				methods: vec!["GET".into(), "HEAD".into()],
				path: "/address".into(),
				count: 60,
				seconds: 60,
			},
			Limit {
				methods: vec!["GET".into(), "HEAD".into()],
				path: "/ip".into(),
				count: 60,
				seconds: 60,
			},
		];
		assert_eq!(manifest.api, Some(Api { public: true, prefix: None, limits }));
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
		assert_eq!(check_name("meter"), Err(Invalid::Reserved("meter".into())));
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
	fn refuses_a_limit_it_could_not_count() {
		for broken in [
			"methods = []\npath = \"/a\"\ncount = 1\nseconds = 60",
			"methods = [\"get\"]\npath = \"/a\"\ncount = 1\nseconds = 60",
			"methods = [\"GET\"]\npath = \"a\"\ncount = 1\nseconds = 60",
			"methods = [\"GET\"]\npath = \"/a\"\ncount = 0\nseconds = 60",
			"methods = [\"GET\"]\npath = \"/a\"\ncount = 1\nseconds = 0",
			"methods = [\"GET\"]\npath = \"/a\"\ncount = 1\nseconds = 86401",
			"methods = [\"GET\"]\npath = \"/a/*\"\ncount = 1\nseconds = 60",
			// geo's own row covers GET /address already.
			"methods = [\"GET\"]\npath = \"/address\"\ncount = 1\nseconds = 60",
		] {
			let text = format!("{GEO}\n[[api.limits]]\n{broken}\n");
			let manifest = Manifest::parse(&text).unwrap();
			assert_eq!(manifest.check("geo", "home"), Err(Invalid::Limit), "{broken}");
		}
	}

	#[test]
	fn a_home_stays_on_the_apps_own_site() {
		let gemini = Manifest::parse(include_str!("../../../apps/gemini/service.toml")).unwrap();
		assert_eq!(gemini.check("gemini", "home"), Ok(()));
		for home in ["/", "admin", "//evil.example"] {
			let mut elsewhere = gemini.clone();
			elsewhere.interface.as_mut().unwrap().home = Some(home.into());
			assert_eq!(elsewhere.check("gemini", "home"), Err(Invalid::Home), "{home}");
		}
		let tunnel = Manifest::parse(include_str!("../../../apps/tunnel/service.toml")).unwrap();
		assert_eq!(tunnel.check_own("tunnel", "home"), Ok(()));
	}

	#[test]
	fn a_node_refuses_an_api_prefix() {
		let mut manifest = Manifest::parse(GEO).unwrap();
		manifest.api.as_mut().unwrap().prefix = Some("/api".into());
		assert_eq!(manifest.check("geo", "home"), Err(Invalid::Prefix));
	}

	#[test]
	fn a_label_maps_an_apps_name_for_what_reaches_it_from_outside() {
		let gemini = Manifest::parse(include_str!("../../../apps/gemini/service.toml")).unwrap();
		let interface = gemini.interface.as_ref().unwrap();
		// No `domain` set: the label is the app's own name.
		assert_eq!(interface.label("gemini"), "gemini");
		let mut labeled = gemini.clone();
		labeled.interface.as_mut().unwrap().domain = Some("infra".into());
		assert_eq!(labeled.interface.as_ref().unwrap().label("gemini"), "infra");
		assert_eq!(labeled.check("gemini", "home"), Ok(()));
	}

	#[test]
	fn a_reserved_label_is_refused() {
		let mut manifest = Manifest::parse(GEO).unwrap();
		manifest.interface = Some(Interface { domain: Some("cms".into()), lan: true, home: None });
		assert_eq!(manifest.check("geo", "home"), Err(Invalid::Reserved("cms".into())));
		manifest.interface.as_mut().unwrap().domain = Some("host".into());
		assert_eq!(manifest.check("geo", "home"), Err(Invalid::Reserved("host".into())));
		manifest.interface.as_mut().unwrap().domain = Some("Geo".into());
		assert_eq!(manifest.check("geo", "home"), Err(Invalid::Label("Geo".into())));
	}

	#[test]
	fn an_old_manifests_interface_public_key_is_ignored() {
		// A manifest a store already holds from before this key was replaced with `domain` and
		// `lan` still has to deserialize; see spec/json.md and the note on `Interface` below.
		let text = format!("{GEO}\n[interface]\npublic = false\n");
		let manifest = Manifest::parse(&text).unwrap();
		let interface = manifest.interface.unwrap();
		assert_eq!((interface.domain, interface.lan), (None, true));
	}

	#[test]
	fn objects_are_declared_as_buckets_s3_takes() {
		let declared = |buckets: &str| {
			Manifest::parse(&format!("{GEO}\n[objects]\nbuckets = [{buckets}]\n")).unwrap()
		};
		let manifest = declared("\"photos\", \"thumbs.v2\"");
		assert_eq!(manifest.check("geo", "home"), Ok(()));
		assert_eq!(manifest.sidecar().as_deref(), Some("geo-objects"));
		assert_eq!(Manifest::parse(GEO).unwrap().sidecar(), None);
		for broken in [
			"Photos",
			"ph",
			"-photos",
			"photos-",
			"ph..otos",
			"192.168.1.1",
			"xn--photos",
			"photos-s3alias",
			"ph_otos",
		] {
			let manifest = declared(&format!("\"{broken}\""));
			assert_eq!(manifest.check("geo", "home"), Err(Invalid::Bucket(broken.into())), "{broken}");
		}
		assert_eq!(declared("").check("geo", "home"), Err(Invalid::Buckets));
		assert_eq!(declared("\"photos\", \"photos\"").check("geo", "home"), Err(Invalid::Buckets));
		let mut long = declared("\"photos\"");
		long.name = "a".repeat(56);
		assert_eq!(long.check(&"a".repeat(56), "home"), Err(Invalid::SidecarName("a".repeat(56))));
		long.name = "a".repeat(55);
		assert_eq!(long.check(&"a".repeat(55), "home"), Ok(()));
	}

	#[test]
	fn the_driver_and_every_sidecar_name_are_reserved() {
		assert_eq!(check_name("objects"), Err(Invalid::Reserved("objects".into())));
		assert_eq!(check_name("geo-objects"), Err(Invalid::Reserved("geo-objects".into())));
		assert!(check_name("objects-geo").is_ok());
		let driver = Manifest::parse(include_str!("../../../apps/objects/service.toml")).unwrap();
		assert_eq!(driver.check_own("objects", "home"), Ok(()));
		assert_eq!(driver.check("objects", "home"), Err(Invalid::Reserved("objects".into())));
	}

	#[test]
	fn lan_defaults_to_on_and_can_be_turned_off() {
		let gemini = Manifest::parse(include_str!("../../../apps/gemini/service.toml")).unwrap();
		assert!(gemini.interface.as_ref().unwrap().lan);
		let mut off = gemini;
		off.interface.as_mut().unwrap().lan = false;
		assert_eq!(off.check("gemini", "home"), Ok(()));
	}
}
