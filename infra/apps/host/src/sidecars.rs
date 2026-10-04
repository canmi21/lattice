//! What runs beside an app for it alone -- its object storage, its Postgres -- on
//! the image of a driver deployed like an app and never run under its own name. See
//! spec/architecture/objects.md and spec/architecture/databases.md.

use crate::Host;
use crate::environment::Credentials;
use crate::rollout::Error;
use crate::store::Deployed;
use deploy::Version;
use deploy::manifest::Manifest;
use deploy::replace;
use deploy::sidecar::{Driver, Sidecar};
use std::path::Path;

/// The region every sidecar answers as and every app is told. Versity's own default; one node is
/// one region, and a client insists only that it be named.
const REGION: &str = "us-east-1";

/// What an app declaring `[objects]` is told beside its credentials, which are in its `secret.env`
/// already: where its sidecar answers, as what region, and its buckets. See
/// spec/architecture/objects.md, "A sidecar per app, over the app's own directory".
pub fn binding(app: &Manifest, driver: &Manifest) -> Vec<String> {
	let (Some(objects), Some(sidecar)) = (&app.objects, app.sidecar()) else { return Vec::new() };
	let port = driver.container.as_ref().and_then(|container| container.port).unwrap_or_default();
	vec![
		format!("S3_ENDPOINT=http://{sidecar}:{port}"),
		format!("S3_REGION={REGION}"),
		format!("S3_BUCKETS={}", objects.buckets.join(",")),
	]
}

/// The port, health path and memory `driver` declares for every sidecar, its port defaulting to
/// the kind's own.
fn declared(kind: Driver, driver: &Version) -> (u16, String, Option<u32>) {
	let container = driver.manifest.container.as_ref();
	let port = container.and_then(|container| container.port).unwrap_or(kind.port());
	let health = container.map_or_else(|| "/".into(), |container| container.health.clone());
	(port, health, container.and_then(|container| container.memory_mb))
}

/// The sidecar an app declaring `[objects]` runs beside it on the driver's current image: its
/// `objects/` alone, the app's credentials as its root account, and the driver's port, health and
/// memory. None for an app that declares none.
pub fn sidecar_of(
	root: &Path,
	app: &Manifest,
	driver: &Version,
	credentials: &Credentials,
) -> Option<Sidecar> {
	let objects = app.objects.as_ref()?;
	let kind = Driver::Objects;
	let (port, health, memory_mb) = declared(kind, driver);
	Some(Sidecar {
		name: app.sidecar()?,
		app: app.name.clone(),
		image: driver.image.clone(),
		env: vec![
			format!("ROOT_ACCESS_KEY_ID={}", credentials.access_key_id),
			format!("ROOT_SECRET_ACCESS_KEY={}", credentials.secret_access_key),
			format!("VGW_PORT=:{port}"),
			format!("VGW_REGION={REGION}"),
			format!("VGW_HEALTH={health}"),
		],
		source: root.join(kind.name()),
		target: kind.target().into(),
		directories: objects.buckets.clone(),
		port,
		health,
		check: kind.check(),
		memory_mb,
		user: kind.user(),
		scratch: Vec::new(),
	})
}

/// The name a database's binding is kept under in its app's `secret.env`.
pub fn url_variable(_kind: Driver) -> &'static str {
	"DATABASE_URL"
}

/// What comes before the password in the URL `app` is handed for `kind`.
fn url_prefix(_kind: Driver, app: &str) -> String {
	format!("postgresql://{app}:")
}

/// The URL `app` is handed for its database of `kind`, as the app's own user on its own database.
/// See spec/architecture/databases.md, "Declared by the app, run beside it".
pub fn url(kind: Driver, app: &str, password: &str, port: u16) -> String {
	let prefix = url_prefix(kind, app);
	format!("{prefix}{password}@{}:{port}/{app}", kind.sidecar_of(app))
}

/// The sidecar an app declaring `[postgres]` runs beside it on the driver's
/// current image: its own directory of that name, the app's user, password and database, and the
/// app's ceiling or else the driver's. None for an app that declares none.
pub fn database_of(
	root: &Path,
	app: &Manifest,
	kind: Driver,
	driver: &Version,
	password: &str,
) -> Option<Sidecar> {
	if kind == Driver::Objects || !kind.declared(app) {
		return None;
	}
	let (port, health, memory_mb) = declared(kind, driver);
	let name = &app.name;
	let env = vec![
		format!("POSTGRES_USER={name}"),
		format!("POSTGRES_PASSWORD={password}"),
		format!("POSTGRES_DB={name}"),
		format!("PGDATA={}", kind.target()),
		format!("PGPORT={port}"),
	];
	Some(Sidecar {
		name: kind.sidecar_of(name),
		app: name.clone(),
		image: driver.image.clone(),
		env,
		source: root.join(kind.name()),
		target: kind.target().into(),
		directories: Vec::new(),
		port,
		health,
		check: kind.check(),
		memory_mb: kind.memory_mb(app).or(memory_mb),
		user: kind.user(),
		scratch: kind.scratch().iter().map(|path| (*path).to_owned()).collect(),
	})
}

/// `kind`'s driver as this node runs it, when it is deployed.
pub fn driver(host: &Host, kind: Driver) -> Result<Option<Version>, Error> {
	let driver = host.store.app(kind.name())?;
	Ok(driver.map(|driver| Version { manifest: driver.manifest, image: driver.image }))
}

/// The sidecar of `kind` that `app` runs on `driver`, its secret made when it has none yet. Its
/// subvolume is made first, so the secret is never written into a plain directory in its place.
async fn sidecar_for(
	host: &Host,
	app: &Manifest,
	kind: Driver,
	driver: Option<&Version>,
) -> Result<Option<Sidecar>, Error> {
	if !kind.declared(app) {
		return Ok(None);
	}
	let driver = driver.ok_or_else(|| Error::NoDriver(app.name.clone(), kind.name()))?;
	host.volumes.ensure(&app.name).await.map_err(replace::Error::from)?;
	let root = host.volumes.root(&app.name);
	if kind == Driver::Objects {
		let credentials = crate::environment::credentials(&root)?;
		return Ok(sidecar_of(&root, app, driver, &credentials));
	}
	let (port, _, _) = declared(kind, driver);
	let password = crate::environment::database_password(
		&root,
		url_variable(kind),
		&url_prefix(kind, &app.name),
		|password| url(kind, &app.name, password, port),
	)?;
	Ok(database_of(&root, app, kind, driver, &password))
}

/// Every sidecar `app` declares, each on its driver as this node runs it now; an app declaring one
/// whose driver is not deployed is refused.
pub async fn sidecars_for(host: &Host, app: &Manifest) -> Result<Vec<Sidecar>, Error> {
	let mut sidecars = Vec::new();
	for kind in app.drivers() {
		let driver = driver(host, kind)?;
		sidecars.extend(sidecar_for(host, app, kind, driver.as_ref()).await?);
	}
	Ok(sidecars)
}

/// Run a driver: recreate every app's sidecar of its kind on `next`, one app at a time, leaving a
/// held app's stopped. When one fails, every sidecar already moved goes back to `current`, and the
/// deploy fails. See spec/architecture/objects.md, "The driver is deployed like an app, and is not
/// one", and spec/architecture/databases.md, "The drivers".
pub async fn drive(
	host: &Host,
	kind: Driver,
	next: &Version,
	current: Option<&Version>,
) -> Result<(), Error> {
	let members = [host.config.own_container.as_str(), host.config.caddy.container.as_str()];
	let apps: Vec<Deployed> =
		host.store.apps()?.into_iter().filter(|app| kind.declared(&app.manifest)).collect();
	let mut moved = Vec::new();
	let mut failure = None;
	for app in &apps {
		moved.push(app);
		let ran = async {
			host.engine.network(&app.manifest.name, &members).await?;
			let Some(sidecar) = sidecar_for(host, &app.manifest, kind, Some(next)).await? else {
				return Ok(());
			};
			replace::sidecar(&host.engine, &host.volumes, &sidecar).await?;
			if app.held {
				host.engine.stop(&sidecar.name).await?;
			}
			Ok::<_, Error>(())
		}
		.await;
		if let Err(error) = ran {
			failure = Some(error);
			break;
		}
	}
	let Some(failure) = failure else { return Ok(()) };
	if let Some(current) = current {
		for app in moved {
			let back = async {
				let Some(sidecar) = sidecar_for(host, &app.manifest, kind, Some(current)).await? else {
					return Ok(());
				};
				replace::sidecar(&host.engine, &host.volumes, &sidecar).await?;
				if app.held {
					host.engine.stop(&sidecar.name).await?;
				}
				Ok::<_, Error>(())
			};
			if let Err(error) = back.await {
				eprintln!("host: putting {}'s sidecar back: {error}", app.manifest.name);
			}
		}
	}
	Err(failure)
}

#[cfg(test)]
mod tests {
	use deploy::sidecar::{Check, Driver};

	fn photos() -> deploy::Manifest {
		let geo = include_str!("../../../../platform/apps/geo/service.toml");
		let text = geo.replace("name = \"geo\"", "name = \"photos\"");
		deploy::Manifest::parse(&format!("{text}\n[objects]\nbuckets = [\"originals\", \"thumbs\"]\n"))
			.unwrap()
	}

	fn driver() -> deploy::Version {
		let manifest =
			deploy::Manifest::parse(include_str!("../../../../platform/apps/objects/service.toml"))
				.unwrap();
		deploy::Version { manifest, image: "sha256:driver".into() }
	}

	fn credentials() -> crate::environment::Credentials {
		crate::environment::Credentials {
			access_key_id: "AKID".into(),
			secret_access_key: "SECRET".into(),
		}
	}

	#[test]
	fn an_app_declaring_objects_is_told_where_they_are() {
		let driver = driver();
		assert_eq!(
			super::binding(&photos(), &driver.manifest),
			[
				format!("S3_ENDPOINT=http://{}:{}", "photos-objects", 17070),
				"S3_REGION=us-east-1".into(),
				"S3_BUCKETS=originals,thumbs".into(),
			]
		);
		let geo =
			deploy::Manifest::parse(include_str!("../../../../platform/apps/geo/service.toml")).unwrap();
		assert!(super::binding(&geo, &driver.manifest).is_empty());
		// What the app's own files said under a bound name gives way; the rest stays.
		let mut env = vec!["S3_REGION=mars".into(), "S3_REGIONAL=kept".into(), "LEVEL=debug".into()];
		crate::rollout::bound(&mut env, super::binding(&photos(), &driver.manifest));
		assert_eq!(env[..2], ["S3_REGIONAL=kept", "LEVEL=debug"]);
		assert_eq!(env.iter().filter(|line| line.starts_with("S3_REGION=")).count(), 1);
	}

	#[test]
	fn a_sidecar_mounts_the_apps_objects_alone_with_its_credentials_as_root() {
		let root = std::path::Path::new("/data/apps/photos");
		let driver = driver();
		let sidecar = super::sidecar_of(root, &photos(), &driver, &credentials()).unwrap();
		assert_eq!(sidecar.name, "photos-objects");
		assert_eq!(sidecar.app, "photos");
		assert_eq!(sidecar.image, "sha256:driver");
		assert_eq!(sidecar.source, root.join("objects"));
		assert_eq!(sidecar.target, "/data");
		assert_eq!(sidecar.directories, ["originals", "thumbs"]);
		let declared = (sidecar.port, sidecar.health.as_str(), sidecar.memory_mb);
		assert_eq!(declared, (17070, "/health", Some(256)));
		assert_eq!(
			sidecar.env,
			[
				"ROOT_ACCESS_KEY_ID=AKID",
				"ROOT_SECRET_ACCESS_KEY=SECRET",
				"VGW_PORT=:17070",
				"VGW_REGION=us-east-1",
				"VGW_HEALTH=/health",
			]
		);
		let geo =
			deploy::Manifest::parse(include_str!("../../../../platform/apps/geo/service.toml")).unwrap();
		assert_eq!(super::sidecar_of(root, &geo, &driver, &credentials()), None);

		// What Docker is asked for: the app's network and no other, one bind mount, sandboxed.
		let body = sidecar.body();
		assert_eq!(body.user, None);
		let config = body.host_config.unwrap();
		assert_eq!(config.network_mode.as_deref(), Some("app-photos"));
		let endpoints = body.networking_config.unwrap().endpoints_config.unwrap();
		assert_eq!(endpoints.keys().collect::<Vec<_>>(), ["app-photos"]);
		let mounts = config.mounts.unwrap();
		assert_eq!(mounts.len(), 1);
		assert_eq!(mounts[0].source.as_deref(), Some("/data/apps/photos/objects"));
		assert_eq!(mounts[0].target.as_deref(), Some("/data"));
		assert_eq!(config.readonly_rootfs, Some(true));
		assert_eq!(config.cap_drop, Some(vec!["ALL".to_owned()]));
		assert_eq!(config.memory, Some(256 * 1024 * 1024));
		assert_eq!(config.memory_swap, config.memory);
		assert!(config.port_bindings.is_none() && config.binds.is_none());
		assert!(config.privileged.is_none());
		assert_eq!(config.tmpfs.unwrap().keys().collect::<Vec<_>>(), ["/tmp"]);
	}

	fn umami(blocks: &str) -> deploy::Manifest {
		let geo = include_str!("../../../../platform/apps/geo/service.toml");
		let text = geo.replace("name = \"geo\"", "name = \"umami\"");
		deploy::Manifest::parse(&format!("{text}\n{blocks}\n")).unwrap()
	}

	fn postgres() -> deploy::Version {
		let manifest =
			deploy::Manifest::parse(include_str!("../../../../platform/apps/postgres/service.toml"))
				.unwrap();
		deploy::Version { manifest, image: "sha256:postgres".into() }
	}

	#[test]
	fn an_app_is_handed_each_database_as_one_url() {
		let app = "umami";
		assert_eq!(
			super::url(Driver::Postgres, app, "pw", 5432),
			format!("postgresql://{app}:pw@{app}-postgres:5432/{app}")
		);
		assert_eq!(super::url_variable(Driver::Postgres), "DATABASE_URL");
	}

	#[test]
	fn a_postgres_sidecar_runs_as_postgres_over_the_apps_postgres_directory() {
		let root = std::path::Path::new("/data/apps/umami");
		let app = umami("[postgres]");
		let sidecar = super::database_of(root, &app, Driver::Postgres, &postgres(), "pw").unwrap();
		assert_eq!(sidecar.name, "umami-postgres");
		assert_eq!(sidecar.image, "sha256:postgres");
		assert_eq!(sidecar.source, root.join("postgres"));
		assert_eq!(sidecar.target, "/var/lib/postgresql/data");
		assert_eq!(
			(sidecar.port, sidecar.check, sidecar.memory_mb),
			(5432, Check::Postgres, Some(192))
		);
		assert_eq!(sidecar.user, Some((70, 70)));
		assert_eq!(sidecar.scratch, ["/var/run/postgresql"]);
		assert_eq!(
			sidecar.env,
			[
				"POSTGRES_USER=umami",
				"POSTGRES_PASSWORD=pw",
				"POSTGRES_DB=umami",
				"PGDATA=/var/lib/postgresql/data",
				"PGPORT=5432",
			]
		);
		// The app's own ceiling wins over the driver's.
		let bigger = umami("[postgres]\nmemory_mb = 384");
		let sidecar = super::database_of(root, &bigger, Driver::Postgres, &postgres(), "pw").unwrap();
		assert_eq!(sidecar.memory_mb, Some(384));
		// None for an app that declares none, and never for objects.
		assert_eq!(super::database_of(root, &umami(""), Driver::Postgres, &postgres(), "pw"), None);
		assert_eq!(super::database_of(root, &photos(), Driver::Objects, &driver(), "pw"), None);
	}
}
