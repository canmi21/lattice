//! keeper: the one program that deploys host, so that host never replaces itself. It takes a new
//! host, runs it in place of the old one through the same procedure host uses for every app, and
//! puts the old one back if the new one does not become healthy. It keeps no state: what runs is
//! read back from Docker. See spec/architecture/host.md, "host never updates itself; keeper
//! updates host".

use axum::extract::{DefaultBodyLimit, Multipart, Request, State};
use axum::http::{StatusCode, header};
use axum::middleware::{self, Next};
use axum::response::Response;
use axum::routing::{get, post};
use axum::{Json, Router};
use deploy::replace::{Error as Failed, replace};
use deploy::{Engine, Manifest, Shape, Version, Volumes};
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tokio::io::AsyncWriteExt;

/// musl's allocator is slow under many small allocations, and images are built for speed; see
/// spec/architecture/host.md, "An image is built for speed, and for any node of its architecture".
#[global_allocator]
static ALLOCATOR: mimalloc::MiMalloc = mimalloc::MiMalloc;

/// keeper's own port, one below host's. `service.toml` states it for host, and the test below
/// holds the two together.
const PORT: u16 = 11010;

/// host's port, which keeper passes a run on to; host's `service.toml` states it.
const HOST_PORT: u16 = 11011;

struct Keeper {
	node: String,
	token: String,
	own_container: String,
	/// The node's one `.env`, which host is started with.
	platform_env: PathBuf,
	incoming: PathBuf,
	engine: Engine,
	volumes: Volumes,
	replacing: tokio::sync::Mutex<()>,
	/// Absent without a GITHUB_ACTIONS_TOKEN, and then CI's notices are refused.
	github: Option<deploy::github::GitHub>,
	/// The runs a notice has been taken for.
	notices: std::sync::Mutex<std::collections::HashSet<u64>>,
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
		platform_env: apps.join("host").join(".env"),
		incoming: apps.join("keeper").join("data").join("incoming"),
		engine: Engine::connect()?,
		volumes: Volumes::new(
			apps,
			PathBuf::from(setting("SNAPSHOTS_ROOT", "/data/.snapshots")),
			PathBuf::from(setting("LOGS_ROOT", "/data/logs")),
		),
		replacing: tokio::sync::Mutex::new(()),
		github: std::env::var("GITHUB_ACTIONS_TOKEN")
			.ok()
			.filter(|token| !token.is_empty())
			.map(deploy::github::GitHub::new),
		notices: std::sync::Mutex::default(),
	});
	deploy::clear_arrivals(&keeper.incoming)?;
	let listen = setting("LISTEN", &format!("0.0.0.0:{PORT}"));
	let guarded = Router::new()
		.route("/apps/host", post(upload).layer(DefaultBodyLimit::disable()))
		.layer(middleware::from_fn_with_state(keeper.clone(), admit));
	let router = Router::new()
		.route("/health", get(health))
		.route("/notice", post(notice))
		.merge(guarded)
		.with_state(keeper);
	let listener = tokio::net::TcpListener::bind(&listen).await?;
	eprintln!("keeper: listening on {listen}");
	axum::serve(listener, router).with_graceful_shutdown(stopped()).await?;
	Ok(())
}

async fn health(State(keeper): State<Arc<Keeper>>) -> Response {
	match keeper.engine.ping().await {
		Ok(()) => response::success(StatusCode::OK, ()),
		Err(_) => response::failure(StatusCode::SERVICE_UNAVAILABLE, "docker_unavailable"),
	}
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
		return response::failure(StatusCode::UNAUTHORIZED, "invalid_token");
	}
	next.run(request).await
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
			Err(error) => return upload_refused(error),
		};
		match part.name() {
			Some("service") => match part.text().await.map(|text| Manifest::parse(&text)) {
				Ok(Ok(manifest)) => declared = Some(manifest),
				Ok(Err(error)) => {
					return response::failure_with(
						StatusCode::UNPROCESSABLE_ENTITY,
						"invalid_declaration",
						error,
					);
				}
				Err(error) => return upload_refused(error),
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
					return upload_refused(error);
				}
				received = true;
			}
			_ => {}
		}
	}
	let Some(manifest) = declared else {
		return response::failure_with(StatusCode::BAD_REQUEST, "invalid_upload", "No service part");
	};
	if !received {
		return response::failure_with(StatusCode::BAD_REQUEST, "invalid_upload", "No image part");
	}
	match from_archive(&keeper, manifest, &archive).await {
		Ok(image) => {
			response::success(StatusCode::OK, serde_json::json!({ "name": "host", "image": image }))
		}
		Err(Reply(status, code, message)) => response::failure_with(status, code, message),
	}
}

fn upload_refused(error: impl ToString) -> Response {
	response::failure_with(StatusCode::BAD_REQUEST, "invalid_upload", error)
}

/// Load a host archive and put it in place, as an upload or a notice brings one. The archive is
/// gone afterwards whatever happened.
async fn from_archive(
	keeper: &Keeper,
	manifest: Manifest,
	archive: &Path,
) -> Result<String, Reply> {
	let replaced = async {
		if let Err(error) = manifest.check_own("host", &keeper.node) {
			return Err(Reply(
				StatusCode::UNPROCESSABLE_ENTITY,
				"invalid_declaration",
				error.to_string(),
			));
		}
		let _one = keeper.replacing.lock().await;
		let file = tokio::fs::File::open(archive).await.map_err(|e| {
			Reply(StatusCode::INTERNAL_SERVER_ERROR, "service_unavailable", e.to_string())
		})?;
		let loaded = keeper.engine.load("host", tokio_util::io::ReaderStream::new(file)).await;
		let image = loaded
			.map_err(|e| Reply(StatusCode::UNPROCESSABLE_ENTITY, "invalid_image", e.to_string()))?;
		replace_host(keeper, Version { manifest, image }).await
	}
	.await;
	let _ = tokio::fs::remove_file(archive).await;
	replaced
}

#[derive(serde::Deserialize)]
struct Notice {
	run: u64,
}

/// A CI run has finished; if it built host, host is replaced. Open, since it can only ask keeper
/// to look: the run is checked against GitHub first. Each run is taken once, and again only if
/// taking it failed. See spec/architecture/host.md, "keeper has its own intake".
async fn notice(State(keeper): State<Arc<Keeper>>, Json(notice): Json<Notice>) -> Response {
	if keeper.github.is_none() {
		return response::failure(StatusCode::SERVICE_UNAVAILABLE, "github_unavailable");
	}
	let notices = || keeper.notices.lock().unwrap_or_else(std::sync::PoisonError::into_inner);
	if !notices().insert(notice.run) {
		return response::success(StatusCode::OK, serde_json::json!({ "run": notice.run }));
	}
	let taker = keeper.clone();
	tokio::spawn(async move {
		if !from_run(&taker, notice.run).await {
			taker.notices.lock().unwrap_or_else(std::sync::PoisonError::into_inner).remove(&notice.run);
		}
	});
	response::success(StatusCode::ACCEPTED, serde_json::json!({ "run": notice.run }))
}

/// The host a run built, if it built one, put in place. True when nothing failed.
async fn from_run(keeper: &Keeper, run: u64) -> bool {
	let Some(github) = keeper.github.as_ref() else { return false };
	let artifacts = match github.artifacts(run).await {
		Ok(built) => built.artifacts,
		Err(error) => {
			eprintln!("keeper: run {run}: {error}");
			return false;
		}
	};
	let Some(artifact) = artifacts.iter().find(|artifact| artifact.app == "host") else {
		return true;
	};
	let fetched = match github.fetch(artifact, &keeper.incoming).await {
		Ok(fetched) => fetched,
		Err(error) => {
			eprintln!("keeper: run {run}: {error}");
			return false;
		}
	};
	let manifest = match Manifest::parse(&fetched.declaration) {
		Ok(manifest) => manifest,
		Err(error) => {
			eprintln!("keeper: run {run}: {error}");
			let _ = tokio::fs::remove_file(&fetched.image).await;
			return true;
		}
	};
	let replaced = match from_archive(keeper, manifest, &fetched.image).await {
		Ok(image) => {
			eprintln!("keeper: run {run}: host is {image}");
			true
		}
		Err(Reply(_, _, message)) => {
			eprintln!("keeper: run {run}: {message}");
			false
		}
	};
	// Whether the new host stayed or the old one is back, the run's other images are host's now.
	pass_on(run).await;
	replaced
}

/// Hand `run` to host with host's part done, over the network the replacement joined keeper to.
async fn pass_on(run: u64) {
	let body = serde_json::json!({ "run": run, "host_replaced": true }).to_string().into_bytes();
	let address = format!("host:{HOST_PORT}");
	match deploy::http::post(&address, "/notice", body).await {
		Ok(status) if (200..300).contains(&status) => {}
		Ok(status) => eprintln!("keeper: run {run}: host answered {status} to the run passed on"),
		Err(error) => eprintln!("keeper: run {run}: passing it on to host: {error}"),
	}
}

/// A refusal on its way to the envelope: the status, the code, and what exactly went wrong.
struct Reply(StatusCode, &'static str, String);

async fn replace_host(keeper: &Keeper, next: Version) -> Result<String, Reply> {
	let internal = |error: &dyn std::fmt::Display| {
		Reply(StatusCode::INTERNAL_SERVER_ERROR, "service_unavailable", error.to_string())
	};
	// A host started by hand carries no recorded version; the one just sent stands in for its
	// declaration, beside the image it really runs.
	let current = keeper.engine.current("host", &next.manifest).await.map_err(|e| internal(&e))?;
	let env = deploy::read_env(&keeper.platform_env).map_err(|e| internal(&e))?;
	// host's network is keeper's and the panel's; Caddy routes nothing to host.
	let members = [keeper.own_container.as_str()];
	let shape = Shape::Platform { env };
	let replaced =
		replace(&keeper.engine, &keeper.volumes, &members, &shape, &next, current.as_ref(), None);
	match replaced.await {
		Ok(_) => {}
		Err(error @ (Failed::Unhealthy { .. } | Failed::FirstFailed { .. })) => {
			return Err(Reply(StatusCode::BAD_GATEWAY, "app_unavailable", error.to_string()));
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
	fn host_is_where_host_declares_it() {
		let declaration = include_str!("../../host/service.toml");
		assert!(declaration.lines().any(|line| line.trim() == format!("port = {}", super::HOST_PORT)));
	}

	#[test]
	fn a_token_matches_only_itself() {
		assert!(super::same(b"secret", b"secret"));
		assert!(!super::same(b"secreT", b"secret"));
		assert!(!super::same(b"", b"secret"));
	}

	#[test]
	fn every_code_it_answers_with_is_in_the_catalogue() {
		for code in response::codes_named(include_str!("main.rs")) {
			assert!(response::message_of(code).is_some(), "`{code}` is not in libs/response/codes.json");
		}
	}
}
