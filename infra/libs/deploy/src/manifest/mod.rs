//! The declaration an app ships beside its image: what host needs in order to run it, and nothing
//! about how. What it may ask for is decided here -- see spec/architecture/host.md, "What a
//! deployment may ask for is host's decision".
//!
//! What a declaration may say is checked in `check`.

mod check;
#[cfg(test)]
mod tests;

pub use check::{Invalid, check_domain, check_name};

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
const RESERVED: [&str; 15] = [
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
	"resolver",
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
/// and database drivers, the scheduler, the door onto the machine's packages, telemetry, the
/// internal gateway and the house's DNS. See spec/architecture/host.md, "host never updates
/// itself; keeper updates host", and the file each is named for under spec/architecture/.
pub const OWN: [&str; 13] = [
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
	"resolver",
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

/// Reached as a subdomain of its own: always on `.app`, behind Access, and on the private suffix
/// too unless `lan` says otherwise. See spec/architecture/host.md, "One name inside, and a domain
/// label outside", and spec/architecture/services.md, "A domain says who can reach it, not what is
/// behind it".
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Interface {
	/// The DNS label this interface answers on, in place of the app's own name. Apps and routes
	/// share one namespace of labels: no two things answer on one label.
	#[serde(default, skip_serializing_if = "Option::is_none")]
	pub domain: Option<String>,
	/// Whether the label is also on the private suffix, the LAN's mirror of `.app`, which always
	/// carries it.
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
