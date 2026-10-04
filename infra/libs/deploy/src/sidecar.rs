//! What runs beside an app for it alone -- its object storage, its Postgres, its ClickHouse -- and
//! the drivers whose images those run. One mechanism, three kinds: see
//! spec/architecture/objects.md and spec/architecture/databases.md.

use crate::engine::{DEFAULT_MEMORY_MB, SCRATCH, bind, network_of, sandbox};
use crate::manifest::Manifest;
use bollard::models::{ContainerCreateBody, EndpointSettings};
use std::collections::HashMap;
use std::path::PathBuf;
use std::time::Duration;
use tokio::io::{AsyncReadExt, AsyncWriteExt};

/// A driver: an image deployed like an app and never run under its own name, which every app
/// declaring it runs as `<app>-<driver>`, over `/data/apps/<app>/<driver>/`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Driver {
	Objects,
	Postgres,
}

/// How a sidecar is asked whether it is up.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Check {
	/// GET its health path, answered 2xx.
	Http,
	/// Asked to start a session, answered with a request to authenticate: what `pg_isready` counts
	/// as ready, with no password needed.
	Postgres,
}

impl Driver {
	pub const ALL: [Driver; 2] = [Driver::Objects, Driver::Postgres];

	/// Its name as a deploy, the block an app declares it with, and the directory its sidecars
	/// mount in each app's subvolume.
	pub fn name(self) -> &'static str {
		match self {
			Driver::Objects => "objects",
			Driver::Postgres => "postgres",
		}
	}

	pub fn named(name: &str) -> Option<Self> {
		Self::ALL.into_iter().find(|driver| driver.name() == name)
	}

	/// What an app's sidecar is named after it, so no app may end its own name so.
	pub fn suffix(self) -> &'static str {
		match self {
			Driver::Objects => "-objects",
			Driver::Postgres => "-postgres",
		}
	}

	pub fn sidecar_of(self, app: &str) -> String {
		format!("{app}{}", self.suffix())
	}

	pub fn declared(self, app: &Manifest) -> bool {
		match self {
			Driver::Objects => app.objects.is_some(),
			Driver::Postgres => app.postgres.is_some(),
		}
	}

	/// The ceiling `app` asks for its sidecar, in place of the driver's default.
	pub fn memory_mb(self, app: &Manifest) -> Option<u32> {
		match self {
			Driver::Objects => None,
			Driver::Postgres => app.postgres.as_ref()?.memory_mb,
		}
	}

	/// Where the sidecar mounts its directory: Versity's posix root, and the image's `PGDATA`.
	pub fn target(self) -> &'static str {
		match self {
			Driver::Objects => "/data",
			Driver::Postgres => "/var/lib/postgresql/data",
		}
	}

	/// The user it runs as, by number, whatever its image says; none takes the image's own. 70 is
	/// Alpine's `postgres`.
	pub fn user(self) -> Option<(u32, u32)> {
		match self {
			Driver::Objects => None,
			Driver::Postgres => Some((70, 70)),
		}
	}

	/// What it writes beside its data, each a tmpfs over the read-only root: Postgres's socket
	/// directory; the rest of what it writes goes under `/tmp`.
	pub fn scratch(self) -> &'static [&'static str] {
		match self {
			Driver::Objects => &[],
			Driver::Postgres => &["/var/run/postgresql"],
		}
	}

	pub fn check(self) -> Check {
		match self {
			Driver::Postgres => Check::Postgres,
			Driver::Objects => Check::Http,
		}
	}

	/// Its port when the driver's declaration names none.
	pub fn port(self) -> u16 {
		match self {
			Driver::Objects => 17070,
			Driver::Postgres => 5432,
		}
	}
}

/// A container that runs beside an app, for the app alone. See spec/architecture/objects.md, "A
/// sidecar per app, over the app's own directory", and spec/architecture/databases.md.
#[derive(Debug, Clone, PartialEq)]
pub struct Sidecar {
	/// Its container's name, `<app>-<driver>`.
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
	/// The path asked when `check` is over HTTP.
	pub health: String,
	pub check: Check,
	pub memory_mb: Option<u32>,
	/// The user it runs as and its directories belong to; none takes the image's own.
	pub user: Option<(u32, u32)>,
	/// Paths it writes beside its data, each a tmpfs as `/tmp` is.
	pub scratch: Vec<String>,
}

/// The label a sidecar carries the name of the app it serves in.
const SIDECAR_LABEL: &str = "host.sidecar";

impl Sidecar {
	/// What Docker is asked to create: sandboxed as an app is, on the app's network, with its one
	/// directory and nothing else.
	pub fn body(&self) -> ContainerCreateBody {
		let memory = i64::from(self.memory_mb.unwrap_or(DEFAULT_MEMORY_MB)) * 1024 * 1024;
		let mount = bind(self.source.display().to_string(), self.target.clone(), false);
		let network = network_of(&self.app);
		let mut host_config = sandbox(network.clone(), vec![mount], memory);
		if let Some(tmpfs) = host_config.tmpfs.as_mut() {
			tmpfs.extend(self.scratch.iter().map(|path| (path.clone(), SCRATCH.to_owned())));
		}
		ContainerCreateBody {
			image: Some(self.image.clone()),
			env: Some(self.env.clone()),
			user: self.user.map(|(uid, gid)| format!("{uid}:{gid}")),
			labels: Some(HashMap::from([(SIDECAR_LABEL.into(), self.app.clone())])),
			host_config: Some(host_config),
			networking_config: Some(bollard::models::NetworkingConfig {
				endpoints_config: Some(HashMap::from([(network, EndpointSettings::default())])),
			}),
			..Default::default()
		}
	}

	/// Ask it once whether it is up, on its app's network; an error says what it answered instead.
	pub async fn ask(&self) -> Result<(), String> {
		let address = format!("{}:{}", self.name, self.port);
		match self.check {
			Check::Http => match crate::http::status(&address, &self.health).await {
				Ok(status) if (200..300).contains(&status) => Ok(()),
				Ok(status) => Err(format!("{} answered {status}", self.health)),
				Err(error) => Err(error.to_string()),
			},
			Check::Postgres => postgres_ready(&address, &self.app).await,
		}
	}
}

/// Long enough for a slow answer from a loaded machine, as an HTTP check has.
const ATTEMPT: Duration = Duration::from_secs(5);

/// Whether Postgres at `address` takes sessions: a startup message as `user`, answered with an
/// authentication request (`R`) once it does, and with an error while it is still starting.
async fn postgres_ready(address: &str, user: &str) -> Result<(), String> {
	let attempt = async {
		let mut stream = tokio::net::TcpStream::connect(address).await?;
		stream.write_all(&startup(user)).await?;
		let mut kind = [0u8; 1];
		stream.read_exact(&mut kind).await?;
		Ok::<_, std::io::Error>(kind[0])
	};
	match tokio::time::timeout(ATTEMPT, attempt).await {
		Ok(Ok(b'R')) => Ok(()),
		Ok(Ok(kind)) => Err(format!("Postgres answered `{}`, not ready yet", char::from(kind))),
		Ok(Err(error)) => Err(format!("could not connect: {error}")),
		Err(_) => Err(format!("no answer within {} seconds", ATTEMPT.as_secs())),
	}
}

/// A protocol 3.0 startup message for `user` on its own database.
fn startup(user: &str) -> Vec<u8> {
	let mut body = 196_608u32.to_be_bytes().to_vec();
	for (key, value) in [("user", user), ("database", user)] {
		body.extend_from_slice(key.as_bytes());
		body.push(0);
		body.extend_from_slice(value.as_bytes());
		body.push(0);
	}
	body.push(0);
	let length = u32::try_from(body.len() + 4).unwrap_or(u32::MAX);
	[length.to_be_bytes().to_vec(), body].concat()
}

#[cfg(test)]
mod tests {
	use super::*;

	fn sidecar(driver: Driver) -> Sidecar {
		Sidecar {
			name: driver.sidecar_of("photos"),
			app: "photos".into(),
			image: "sha256:driver".into(),
			env: vec![],
			source: PathBuf::from("/data/apps/photos").join(driver.name()),
			target: driver.target().into(),
			directories: vec![],
			port: driver.port(),
			health: "/".into(),
			check: driver.check(),
			memory_mb: None,
			user: driver.user(),
			scratch: driver.scratch().iter().map(|path| (*path).to_owned()).collect(),
		}
	}

	#[test]
	fn every_driver_is_named_and_found_by_its_name() {
		for driver in Driver::ALL {
			assert_eq!(Driver::named(driver.name()), Some(driver));
			assert_eq!(driver.suffix(), format!("-{}", driver.name()));
		}
		assert_eq!(Driver::named("geo"), None);
		assert_eq!(Driver::Postgres.sidecar_of("umami"), "umami-postgres");
	}

	#[test]
	fn an_objects_sidecar_runs_as_its_image_says_with_tmp_alone() {
		let body = sidecar(Driver::Objects).body();
		assert_eq!(body.user, None);
		let tmpfs = body.host_config.unwrap().tmpfs.unwrap();
		assert_eq!(tmpfs.keys().collect::<Vec<_>>(), ["/tmp"]);
	}

	#[test]
	fn a_postgres_sidecar_runs_as_postgres_over_pgdata_with_its_socket_on_tmpfs() {
		let body = sidecar(Driver::Postgres).body();
		assert_eq!(body.user.as_deref(), Some("70:70"));
		let config = body.host_config.unwrap();
		assert_eq!(config.readonly_rootfs, Some(true));
		let mounts = config.mounts.unwrap();
		assert_eq!(mounts.len(), 1);
		assert_eq!(mounts[0].source.as_deref(), Some("/data/apps/photos/postgres"));
		assert_eq!(mounts[0].target.as_deref(), Some("/var/lib/postgresql/data"));
		let mut tmpfs = config.tmpfs.unwrap().into_keys().collect::<Vec<_>>();
		tmpfs.sort();
		assert_eq!(tmpfs, ["/tmp", "/var/run/postgresql"]);
		assert_eq!(config.network_mode.as_deref(), Some("app-photos"));
	}

	#[test]
	fn a_startup_message_is_length_prefixed_and_names_the_user_and_database() {
		let message = startup("umami");
		assert_eq!(u32::from_be_bytes(message[..4].try_into().unwrap()) as usize, message.len());
		assert_eq!(message[4..8], [0, 3, 0, 0]);
		assert_eq!(&message[8..], b"user\0umami\0database\0umami\0\0");
	}

	#[tokio::test]
	async fn postgres_is_ready_when_it_asks_for_a_password() {
		async fn answering(kind: u8) -> Result<(), String> {
			let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
			let address = listener.local_addr().unwrap().to_string();
			tokio::spawn(async move {
				let (mut stream, _) = listener.accept().await.unwrap();
				let mut length = [0u8; 4];
				stream.read_exact(&mut length).await.unwrap();
				let mut rest = vec![0u8; u32::from_be_bytes(length) as usize - 4];
				stream.read_exact(&mut rest).await.unwrap();
				stream.write_all(&[kind]).await.unwrap();
			});
			postgres_ready(&address, "umami").await
		}
		assert_eq!(answering(b'R').await, Ok(()));
		assert!(answering(b'E').await.is_err());
	}
}
