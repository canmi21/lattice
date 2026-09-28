//! keeper: the one program that deploys host, so that host never replaces itself. It takes a new
//! host, runs it in place of the old one through the same procedure host uses for every app, and
//! puts the old one back if the new one does not become healthy. It keeps no state: what runs is
//! read back from Docker. See spec/architecture/host.md, "host never updates itself; keeper
//! updates host".

use axum::extract::{DefaultBodyLimit, Multipart, Request, State};
use axum::http::{StatusCode, header};
use axum::middleware::{self, Next};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use deploy::replace::{Error as Failed, replace};
use deploy::{Engine, Manifest, Shape, Version, Volumes};
use std::collections::HashSet;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::io::AsyncWriteExt;

/// musl's allocator is slow under many small allocations, and images are built for speed; see
/// spec/architecture/host.md, "An image is built for speed, and for any node of its architecture".
#[global_allocator]
static ALLOCATOR: mimalloc::MiMalloc = mimalloc::MiMalloc;

/// keeper's own port, one below host's. `service.toml` states it for host, and the test below
/// holds the two together.
const PORT: u16 = 11010;

struct Keeper {
	node: String,
	token: String,
	own_container: String,
	caddy_container: String,
	/// The node's one `.env`, which host is started with.
	platform_env: PathBuf,
	incoming: PathBuf,
	engine: Engine,
	volumes: Volumes,
	replacing: tokio::sync::Mutex<()>,
}

fn setting(key: &str, default: &str) -> String {
	std::env::var(key).ok().filter(|value| !value.is_empty()).unwrap_or_else(|| default.into())
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
	let apps = PathBuf::from(setting("APPS_ROOT", "/data/apps"));
	let keeper = Arc::new(Keeper {
		node: std::env::var("NODE")?,
		token: std::env::var("HOST_TOKEN")?,
		own_container: setting("OWN_CONTAINER", "keeper"),
		caddy_container: setting("CADDY_CONTAINER", "caddy"),
		platform_env: apps.join("host").join(".env"),
		incoming: apps.join("keeper").join("data").join("incoming"),
		engine: Engine::connect()?,
		volumes: Volumes::new(apps, PathBuf::from(setting("SNAPSHOTS_ROOT", "/data/.snapshots"))),
		replacing: tokio::sync::Mutex::new(()),
	});
	deploy::clear_arrivals(&keeper.incoming)?;
	let listen = setting("LISTEN", &format!("0.0.0.0:{PORT}"));
	let guarded = Router::new()
		.route("/apps/host", post(upload).layer(DefaultBodyLimit::disable()))
		.layer(middleware::from_fn_with_state(keeper.clone(), admit));
	let router = Router::new().route("/health", get(health)).merge(guarded).with_state(keeper);
	let listener = tokio::net::TcpListener::bind(&listen).await?;
	eprintln!("keeper: listening on {listen}");
	axum::serve(listener, router).with_graceful_shutdown(stopped()).await?;
	Ok(())
}

async fn health(State(keeper): State<Arc<Keeper>>) -> StatusCode {
	if keeper.engine.ping().await.is_ok() { StatusCode::OK } else { StatusCode::SERVICE_UNAVAILABLE }
}

/// Compared in time independent of where the first difference is.
fn same(given: &[u8], expected: &[u8]) -> bool {
	given.len() == expected.len()
		&& given.iter().zip(expected).fold(0, |acc, (a, b)| acc | (a ^ b)) == 0
}

async fn admit(State(keeper): State<Arc<Keeper>>, request: Request, next: Next) -> Response {
	let given = request
		.headers()
		.get(header::AUTHORIZATION)
		.and_then(|value| value.to_str().ok())
		.and_then(|value| value.strip_prefix("Bearer "))
		.unwrap_or_default();
	if !same(given.as_bytes(), keeper.token.as_bytes()) {
		return StatusCode::UNAUTHORIZED.into_response();
	}
	next.run(request).await
}

fn failed(status: StatusCode, message: impl ToString) -> Response {
	(status, message.to_string()).into_response()
}

/// The same request host takes for any app: the declaration as `service`, the archive as `image`,
/// written to disk whole before the running host is touched.
async fn upload(State(keeper): State<Arc<Keeper>>, mut parts: Multipart) -> Response {
	let archive = deploy::arrival(&keeper.incoming);
	let mut declared = None;
	let mut received = false;
	loop {
		let mut part = match parts.next_field().await {
			Ok(Some(part)) => part,
			Ok(None) => break,
			Err(error) => return failed(StatusCode::BAD_REQUEST, error),
		};
		match part.name() {
			Some("service") => match part.text().await.map(|text| Manifest::parse(&text)) {
				Ok(Ok(manifest)) => declared = Some(manifest),
				Ok(Err(error)) => return failed(StatusCode::UNPROCESSABLE_ENTITY, error),
				Err(error) => return failed(StatusCode::BAD_REQUEST, error),
			},
			Some("image") => {
				let saved = async {
					tokio::fs::create_dir_all(&keeper.incoming).await?;
					let mut file = tokio::fs::File::create(&archive).await?;
					while let Some(chunk) = part.chunk().await? {
						file.write_all(&chunk).await?;
					}
					file.flush().await?;
					anyhow::Ok(())
				};
				if let Err(error) = saved.await {
					return failed(StatusCode::BAD_REQUEST, error);
				}
				received = true;
			}
			_ => {}
		}
	}
	let Some(manifest) = declared else {
		return failed(StatusCode::BAD_REQUEST, "no `service` part");
	};
	if !received {
		return failed(StatusCode::BAD_REQUEST, "no `image` part");
	}
	if let Err(error) = manifest.check_platform("host", &keeper.node) {
		return failed(StatusCode::UNPROCESSABLE_ENTITY, error);
	}
	let _one = keeper.replacing.lock().await;
	let file = match tokio::fs::File::open(&archive).await {
		Ok(file) => file,
		Err(error) => return failed(StatusCode::INTERNAL_SERVER_ERROR, error),
	};
	let loaded = keeper.engine.load("host", tokio_util::io::ReaderStream::new(file)).await;
	let _ = tokio::fs::remove_file(&archive).await;
	let image = match loaded {
		Ok(image) => image,
		Err(error) => return failed(StatusCode::UNPROCESSABLE_ENTITY, error),
	};
	match replace_host(&keeper, Version { manifest, image }).await {
		Ok(image) => Json(serde_json::json!({ "name": "host", "image": image })).into_response(),
		Err(Reply(status, message)) => failed(status, message),
	}
}

struct Reply(StatusCode, String);

async fn replace_host(keeper: &Keeper, next: Version) -> Result<String, Reply> {
	let internal =
		|error: &dyn std::fmt::Display| Reply(StatusCode::INTERNAL_SERVER_ERROR, error.to_string());
	// A host started by hand carries no recorded version; the one just sent stands in for its
	// declaration, beside the image it really runs.
	let current = keeper.engine.current("host", &next.manifest).await.map_err(|e| internal(&e))?;
	let env = deploy::read_env(&keeper.platform_env).map_err(|e| internal(&e))?;
	let members = [keeper.own_container.as_str(), keeper.caddy_container.as_str()];
	let shape = Shape::Platform { env };
	match replace(&keeper.engine, &keeper.volumes, &members, &shape, &next, current.as_ref()).await {
		Ok(()) => {}
		Err(error @ (Failed::Unhealthy { .. } | Failed::FirstFailed { .. })) => {
			return Err(Reply(StatusCode::BAD_GATEWAY, error.to_string()));
		}
		Err(error) => return Err(internal(&error)),
	}
	// host's images are keeper's to collect: the one now running, and the one it would go back to.
	let keep: HashSet<String> = [Some(next.image.clone()), current.map(|current| current.image)]
		.into_iter()
		.flatten()
		.collect();
	keeper.engine.collect(&["host"], &keep).await.map_err(|e| internal(&e))?;
	Ok(next.image)
}

/// `docker stop` sends SIGTERM to a process that is PID 1 in its container, which ignores it
/// unless it asks.
async fn stopped() {
	let terminated = async {
		if let Ok(mut signal) =
			tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
		{
			signal.recv().await;
		}
	};
	tokio::select! {
		_ = tokio::signal::ctrl_c() => {}
		() = terminated => {}
	}
}

#[cfg(test)]
mod tests {
	#[test]
	fn the_port_is_the_one_the_declaration_states() {
		let declaration = include_str!("../service.toml");
		assert!(declaration.lines().any(|line| line.trim() == format!("port = {}", super::PORT)));
	}

	#[test]
	fn a_token_matches_only_itself() {
		assert!(super::same(b"secret", b"secret"));
		assert!(!super::same(b"secreT", b"secret"));
		assert!(!super::same(b"", b"secret"));
	}
}
