//! The declaration an app ships beside its image: what host needs in order to run it, and nothing
//! about how. What it may ask for is decided here -- see spec/architecture/host.md, "What a
//! deployment may ask for is host's decision".

use crate::sidecar::Driver;
use serde::{Deserialize, Serialize};
use std::ops::RangeInclusive;

/// The declaration format this host reads. Bumped only when an older host could no longer make
/// sense of a newer file; a key an older host can ignore is not a bump. See spec/json.md.
pub const VERSION: u32 = 1;

/// Names taken by the platform itself: its programs, the meter that watches the machine, the API
/// host and the Worker answering it, the object storage and database drivers, the scheduler that
/// calls every job, the door onto the machine's own packages and the public telemetry, and the
/// containers an app's name would collide with. See spec/architecture/cron.md,
/// spec/architecture/apt.md, spec/architecture/telemetry.md and spec/architecture/databases.md.
const RESERVED: [&str; 14] = [
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
	"postgres",
	"cron",
	"apt",
	"telemetry",
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
/// keeper, which each deploy the other, the meter, Caddy, the tunnel, the panel, the object storage
/// and database drivers, the scheduler, the door onto the machine's packages, telemetry and the
/// internal gateway. See spec/architecture/host.md, "host never updates itself; keeper updates
/// host", and the file each is named for under spec/architecture/.
pub const OWN: [&str; 12] = [
	"host",
	"keeper",
	"meter",
	"caddy",
	"tunnel",
	"panel",
	"objects",
	"postgres",
	"cron",
	"apt",
	"telemetry",
	"gateway",
];

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
	#[serde(default, skip_serializing_if = "Option::is_none")]
	pub postgres: Option<Database>,
	/// The jobs `cron` calls for it. See spec/architecture/cron.md, "A job is declared by the
	/// service that does it".
	#[serde(default, skip_serializing_if = "Vec::is_empty")]
	pub schedules: Vec<Schedule>,
}

impl Manifest {
	/// The container its object storage runs in, when it declares any.
	pub fn sidecar(&self) -> Option<String> {
		self.objects.as_ref().map(|_| sidecar_of(&self.name))
	}

	/// The drivers it declares, each run beside it as a sidecar.
	pub fn drivers(&self) -> impl Iterator<Item = Driver> + '_ {
		Driver::ALL.into_iter().filter(|driver| driver.declared(self))
	}

	/// The containers its sidecars run in, one per driver it declares.
	pub fn sidecars(&self) -> Vec<String> {
		self.drivers().map(|driver| driver.sidecar_of(&self.name)).collect()
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
	/// How often one subject may call a route: `quota` counts it for each gateway and Caddy keeps a
	/// floor under it on the node, so the service itself counts nothing. See
	/// spec/architecture/quota.md.
	#[serde(default, skip_serializing_if = "Vec::is_empty")]
	pub limits: Vec<Limit>,
	/// Which of Caddy's sides carry it, of [`SIDES`]; all of them when absent, and never without
	/// `inside`. See spec/architecture/host.md, "The inside side answers the internal gateway alone".
	#[serde(default, skip_serializing_if = "Option::is_none")]
	pub sides: Option<Vec<String>>,
}

/// Caddy's sides an API may be carried on: the LAN's, the tunnel's, and the internal gateway's.
pub const SIDES: [&str; 3] = ["private", "tunnel", "inside"];

impl Api {
	/// Whether Caddy carries it on `side`.
	pub fn carried_on(&self, side: &str) -> bool {
		self.sides.as_ref().is_none_or(|sides| sides.iter().any(|named| named == side))
	}
}

/// One route's allowance, as a bucket: `burst` calls at once, room coming back at `count` calls in
/// `seconds`, counted by one kind of subject on these methods. See spec/architecture/quota.md, "A
/// limit is a bucket".
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Limit {
	pub methods: Vec<String>,
	/// The path as the service sees it, with the scope taken off.
	pub path: String,
	pub count: u32,
	pub seconds: u32,
	/// How many calls may come together; `count` when absent.
	#[serde(default, skip_serializing_if = "Option::is_none")]
	pub burst: Option<u32>,
	/// What it counts by; `address` when absent, and the one kind accepted until there are
	/// accounts.
	#[serde(default, skip_serializing_if = "Option::is_none")]
	pub subject: Option<String>,
}

impl Limit {
	/// The kind of subject it counts by.
	pub fn subject(&self) -> &str {
		self.subject.as_deref().unwrap_or("address")
	}

	/// The most calls the bucket admits in any `seconds`: its burst, and the room that comes back
	/// meanwhile -- what a sliding window under it allows without refusing what the bucket would not.
	pub fn most_in_window(&self) -> u32 {
		self.burst.unwrap_or(self.count).saturating_add(self.count)
	}
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

/// A database of the app's own, run beside it over `postgres/` or `clickhouse/` in its directory.
/// See spec/architecture/databases.md, "Declared by the app, run beside it".
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Database {
	/// Its ceiling, in place of the driver's default.
	#[serde(default, skip_serializing_if = "Option::is_none")]
	pub memory_mb: Option<u32>,
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

/// One job `cron` calls for its service. See spec/architecture/cron.md, "A job is declared by the
/// service that does it".
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Schedule {
	pub name: String,
	/// A five-field cron expression, read in UTC. Exactly one of `cron` and `every`.
	#[serde(default, skip_serializing_if = "Option::is_none")]
	pub cron: Option<String>,
	/// `30s`, `1m`, `6h`. Exactly one of `cron` and `every`.
	#[serde(default, skip_serializing_if = "Option::is_none")]
	pub every: Option<String>,
	/// Asked with POST, under the service's scope or its socket.
	pub path: String,
	/// A run missed while the node was down: run it once, or wait for the next.
	#[serde(default)]
	pub catch_up: CatchUp,
	/// A run due while the last is still going: skip it, or queue it behind.
	#[serde(default)]
	pub overlap: Overlap,
	/// Seconds before a run is called failed.
	#[serde(default = "default_timeout")]
	pub timeout: u64,
}

fn default_timeout() -> u64 {
	300
}

/// The seconds a `timeout` may declare.
pub const TIMEOUTS: RangeInclusive<u64> = 1..=86_400;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum CatchUp {
	#[default]
	Once,
	Skip,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum Overlap {
	#[default]
	Skip,
	Queue,
}

/// Whether `expr` is shaped like a five-field cron expression: field count and character set
/// alone, since `cron` itself parses it in full. See spec/architecture/cron.md.
fn is_cron(expr: &str) -> bool {
	let field =
		|f: &str| !f.is_empty() && f.bytes().all(|b| b.is_ascii_digit() || b"*/,-".contains(&b));
	expr.split_whitespace().count() == 5 && expr.split_whitespace().all(field)
}

/// Whether `expr` is shaped like `every`: a positive count of seconds, minutes or hours.
fn is_every(expr: &str) -> bool {
	let digits = expr.bytes().take_while(u8::is_ascii_digit).count();
	digits > 0
		&& matches!(&expr[digits..], "s" | "m" | "h")
		&& expr[..digits].parse::<u64>().is_ok_and(|value| value > 0)
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
	#[error("an API's sides are named from `private`, `tunnel` and `inside`, and include `inside`")]
	Sides,
	#[error("`{0}` is not a bucket name S3 takes")]
	Bucket(String),
	#[error("`[objects]` names at least one bucket, each once")]
	Buckets,
	#[error("`{0}` is longer than the 63 characters a container's name on a network may be")]
	SidecarName(String),
	#[error("`[{0}]` asks for no memory at all, which Docker would read as no ceiling")]
	SidecarMemory(String),
	#[error(
		"schedule `{0}` needs exactly one of `cron` (five fields) or `every` (like `30s`), a path \
		 from /, and a timeout from 1 to 86400 seconds"
	)]
	Schedule(String),
	#[error("`{0}` declares `[[schedules]]` but answers through neither `[api]` nor a socket")]
	Unscheduled(String),
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
			// A driver's port is its sidecars', each on its own app's network, where no service's
			// port can meet it: Postgres keeps 5432. See spec/architecture/databases.md.
			(Some(port), None) if !PORTS.contains(&port) && Driver::named(&self.name).is_none() => {
				return Err(Invalid::Port(port));
			}
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
				&& !limit.path.trim_end_matches("/*").contains('*')
				&& limit.count > 0
				&& (1..=LONGEST_WINDOW).contains(&limit.seconds)
				&& limit.burst != Some(0)
				&& limit.subject() == "address"
		};
		// A call is counted under one row of each kind of subject and Caddy counts every row, so no
		// call may be covered twice by one kind: no two rows of a subject on one method where either
		// path covers the other, a prefix ending in `/*` covering everything under it.
		let covers = |outer: &str, inner: &str| match outer.strip_suffix('*') {
			Some(stem) => inner.starts_with(stem),
			None => outer == inner,
		};
		let covered = |api: &Api| {
			api.limits.iter().enumerate().all(|(index, limit)| {
				api.limits[index + 1..].iter().all(|other| {
					limit.subject() != other.subject()
						|| !limit.methods.iter().any(|method| other.methods.contains(method))
						|| !(covers(&limit.path, &other.path) || covers(&other.path, &limit.path))
				})
			})
		};
		if self.api.as_ref().is_some_and(|api| !api.limits.iter().all(sound) || !covered(api)) {
			return Err(Invalid::Limit);
		}
		let sided = |sides: &Vec<String>| {
			sides.iter().all(|side| SIDES.contains(&side.as_str()))
				&& sides.iter().any(|side| side == "inside")
		};
		if self.api.as_ref().and_then(|api| api.sides.as_ref()).is_some_and(|sides| !sided(sides)) {
			return Err(Invalid::Sides);
		}
		if let Some(objects) = &self.objects {
			check_objects(objects)?;
		}
		for driver in self.drivers() {
			if !is_label(&driver.sidecar_of(&self.name)) {
				return Err(Invalid::SidecarName(driver.sidecar_of(&self.name)));
			}
			if driver.memory_mb(self) == Some(0) {
				return Err(Invalid::SidecarMemory(driver.name().into()));
			}
		}
		if !self.schedules.is_empty() {
			if let Some(bad) = self.schedules.iter().find(|schedule| !sound_schedule(schedule)) {
				return Err(Invalid::Schedule(bad.name.clone()));
			}
			if self.api.is_none() && container.socket.is_none() {
				return Err(Invalid::Unscheduled(self.name.clone()));
			}
		}
		Ok(())
	}
}

/// Whether a schedule is shaped so `cron` could run it: exactly one clock, a path from `/`, and a
/// timeout in range. See spec/architecture/cron.md.
fn sound_schedule(schedule: &Schedule) -> bool {
	let clocked = match (&schedule.cron, &schedule.every) {
		(Some(cron), None) => is_cron(cron),
		(None, Some(every)) => is_every(every),
		_ => false,
	};
	clocked && schedule.path.starts_with('/') && TIMEOUTS.contains(&schedule.timeout)
}

/// Buckets S3 takes, each once. See spec/architecture/objects.md, "A sidecar per app, over the
/// app's own directory".
fn check_objects(objects: &Objects) -> Result<(), Invalid> {
	if let Some(bucket) = objects.buckets.iter().find(|bucket| !is_bucket(bucket)) {
		return Err(Invalid::Bucket(bucket.clone()));
	}
	let distinct: std::collections::HashSet<&String> = objects.buckets.iter().collect();
	if objects.buckets.is_empty() || distinct.len() != objects.buckets.len() {
		return Err(Invalid::Buckets);
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
	let sidecar = Driver::ALL.iter().any(|driver| name.ends_with(driver.suffix()));
	if RESERVED.contains(&name) || RESERVED_LABELS.contains(&name) || sidecar {
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
				burst: None,
				subject: None,
			},
			Limit {
				methods: vec!["GET".into(), "HEAD".into()],
				path: "/ip".into(),
				count: 60,
				seconds: 60,
				burst: None,
				subject: None,
			},
		];
		assert_eq!(manifest.api, Some(Api { public: true, prefix: None, limits, sides: None }));
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
	fn counts_a_prefix_beside_an_exact_path_it_does_not_cover() {
		let rows = "[[api.limits]]\nmethods = [\"GET\"]\npath = \"/checks\"\ncount = 1\nseconds = 60\n\
			[[api.limits]]\nmethods = [\"GET\"]\npath = \"/checks/*\"\ncount = 1\nseconds = 60";
		let manifest = Manifest::parse(&format!("{GEO}\n{rows}\n")).unwrap();
		assert_eq!(manifest.check("geo", "home"), Ok(()));
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
			"methods = [\"GET\"]\npath = \"/a/*/b\"\ncount = 1\nseconds = 60",
			"methods = [\"GET\"]\npath = \"/a\"\ncount = 1\nseconds = 60\nburst = 0",
			// Only an address is counted until there are accounts.
			"methods = [\"GET\"]\npath = \"/a\"\ncount = 1\nseconds = 60\nsubject = \"account\"",
			// geo's own row covers GET /address, and a prefix over it would count it twice.
			"methods = [\"GET\"]\npath = \"/*\"\ncount = 1\nseconds = 60",
			// geo's own row covers GET /address already.
			"methods = [\"GET\"]\npath = \"/address\"\ncount = 1\nseconds = 60",
		] {
			let text = format!("{GEO}\n[[api.limits]]\n{broken}\n");
			let manifest = Manifest::parse(&text).unwrap();
			assert_eq!(manifest.check("geo", "home"), Err(Invalid::Limit), "{broken}");
		}
	}

	#[test]
	fn names_its_sides_from_three_and_never_leaves_out_inside() {
		let mut geo = Manifest::parse(GEO).unwrap();
		let api = geo.api.as_mut().unwrap();
		assert!(api.carried_on("private") && api.carried_on("tunnel") && api.carried_on("inside"));
		api.sides = Some(vec!["inside".into()]);
		assert!(!api.carried_on("private") && api.carried_on("inside"));
		assert_eq!(geo.check("geo", "home"), Ok(()));
		for sides in [vec!["private"], vec!["inside", "outside"], vec![]] {
			let mut broken = geo.clone();
			broken.api.as_mut().unwrap().sides = Some(sides.iter().map(|side| (*side).into()).collect());
			assert_eq!(broken.check("geo", "home"), Err(Invalid::Sides), "{sides:?}");
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
		let named = Invalid::SidecarName(format!("{}-objects", "a".repeat(56)));
		assert_eq!(long.check(&"a".repeat(56), "home"), Err(named));
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
	fn databases_are_declared_each_with_an_optional_ceiling() {
		let text = format!("{GEO}\n[postgres]\nmemory_mb = 192\n");
		let manifest = Manifest::parse(&text).unwrap();
		assert_eq!(manifest.postgres, Some(Database { memory_mb: Some(192) }));
		assert_eq!(manifest.check("geo", "home"), Ok(()));
		assert_eq!(manifest.sidecars(), ["geo-postgres"]);
		assert_eq!(Driver::Postgres.memory_mb(&manifest), Some(192));
		// Objects are not declared, so its sidecar is not among them, and the one it names is none.
		assert_eq!(manifest.sidecar(), None);
		let geo = Manifest::parse(GEO).unwrap();
		assert!(geo.sidecars().is_empty() && geo.postgres.is_none());

		let unbounded = Manifest::parse(&format!("{GEO}\n[postgres]\nmemory_mb = 0\n")).unwrap();
		assert_eq!(unbounded.check("geo", "home"), Err(Invalid::SidecarMemory("postgres".into())));
		let mut long = Manifest::parse(&format!("{GEO}\n[postgres]\n")).unwrap();
		long.name = "a".repeat(55);
		let named = Invalid::SidecarName(format!("{}-postgres", "a".repeat(55)));
		assert_eq!(long.check(&"a".repeat(55), "home"), Err(named));
		long.name = "a".repeat(54);
		assert_eq!(long.check(&"a".repeat(54), "home"), Ok(()));
	}

	#[test]
	fn the_database_drivers_and_every_sidecar_of_theirs_are_reserved() {
		for name in ["postgres", "geo-postgres"] {
			assert_eq!(check_name(name), Err(Invalid::Reserved(name.into())), "{name}");
		}
		assert!(check_name("postgres-geo").is_ok());
		assert!(OWN.contains(&"postgres"));
		let driver = Manifest::parse(include_str!("../../../apps/postgres/service.toml")).unwrap();
		assert_eq!(driver.check_own("postgres", "home"), Ok(()));
		assert_eq!(driver.check("postgres", "home"), Err(Invalid::Reserved("postgres".into())));
		// Only a driver keeps a port outside the services' range; an app on 5432 is still refused.
		let mut geo = Manifest::parse(GEO).unwrap();
		geo.container.as_mut().unwrap().port = Some(5432);
		assert_eq!(geo.check("geo", "home"), Err(Invalid::Port(5432)));
	}

	#[test]
	fn lan_defaults_to_on_and_can_be_turned_off() {
		let gemini = Manifest::parse(include_str!("../../../apps/gemini/service.toml")).unwrap();
		assert!(gemini.interface.as_ref().unwrap().lan);
		let mut off = gemini;
		off.interface.as_mut().unwrap().lan = false;
		assert_eq!(off.check("gemini", "home"), Ok(()));
	}

	#[test]
	fn cron_and_apt_are_reserved_and_deployed_by_host() {
		assert_eq!(check_name("cron"), Err(Invalid::Reserved("cron".into())));
		assert_eq!(check_name("apt"), Err(Invalid::Reserved("apt".into())));
		assert!(OWN.contains(&"cron") && OWN.contains(&"apt"));
	}

	#[test]
	fn a_schedule_declares_exactly_one_clock() {
		let text = format!(
			"{GEO}\n[[schedules]]\nname = \"refresh\"\ncron = \"0 4 * * *\"\nevery = \"1m\"\npath = \"/jobs/refresh\"\n"
		);
		let manifest = Manifest::parse(&text).unwrap();
		assert_eq!(manifest.check("geo", "home"), Err(Invalid::Schedule("refresh".into())));
	}

	#[test]
	fn a_schedule_reads_its_defaults_and_checks_its_shape() {
		let scheduled = |extra: &str| {
			Manifest::parse(&format!(
				"{GEO}\n[[schedules]]\nname = \"refresh\"\npath = \"/jobs/refresh\"\n{extra}\n"
			))
			.unwrap()
		};
		let manifest = scheduled("cron = \"0 4 * * *\"");
		let schedule = &manifest.schedules[0];
		assert_eq!(schedule.catch_up, CatchUp::Once);
		assert_eq!(schedule.overlap, Overlap::Skip);
		assert_eq!(schedule.timeout, 300);
		assert_eq!(manifest.check("geo", "home"), Ok(()));

		assert_eq!(scheduled("every = \"30s\"").check("geo", "home"), Ok(()));
		for broken in ["cron = \"0 4 * *\"", "cron = \"a 4 * * *\"", "every = \"m\"", "every = \"0s\""]
		{
			assert_eq!(
				scheduled(broken).check("geo", "home"),
				Err(Invalid::Schedule("refresh".into())),
				"{broken}"
			);
		}
		let no_slash = Manifest::parse(&format!(
			"{GEO}\n[[schedules]]\nname = \"refresh\"\ncron = \"0 4 * * *\"\npath = \"jobs/refresh\"\n"
		))
		.unwrap();
		assert_eq!(no_slash.check("geo", "home"), Err(Invalid::Schedule("refresh".into())));
		let too_long = scheduled("cron = \"0 4 * * *\"\ntimeout = 86401");
		assert_eq!(too_long.check("geo", "home"), Err(Invalid::Schedule("refresh".into())));
	}

	#[test]
	fn a_scheduled_service_answers_through_its_scope_or_its_socket() {
		let socketed = Manifest::parse(&format!(
			"version = 1\nname = \"probe\"\nplacements = [\"home\"]\n[container]\nhealth = \"/health\"\nsocket = \"probe.sock\"\n[data]\npath = \"/data\"\n[[schedules]]\nname = \"update\"\ncron = \"0 7 * * *\"\npath = \"/jobs/update\"\n"
		))
		.unwrap();
		assert_eq!(socketed.check("probe", "home"), Ok(()));

		let unreachable = Manifest::parse(&format!(
			"version = 1\nname = \"probe\"\nplacements = [\"home\"]\n[container]\nhealth = \"/health\"\nport = 20000\n[[schedules]]\nname = \"update\"\ncron = \"0 7 * * *\"\npath = \"/jobs/update\"\n"
		))
		.unwrap();
		assert_eq!(unreachable.check("probe", "home"), Err(Invalid::Unscheduled("probe".into())));
	}
}
