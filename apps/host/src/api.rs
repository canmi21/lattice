//! host's HTTP surface. One token admits everything but `/health`, on the LAN as much as through
//! the tunnel -- see spec/architecture/host.md, "One token, behind two doors".

use crate::Host;
use crate::rollout::{self, Error as DeployError};
use crate::store::Route;
use axum::extract::{DefaultBodyLimit, Multipart, Path, Request, State};
use axum::http::{StatusCode, header};
use axum::middleware::{self, Next};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post, put};
use axum::{Json, Router};
use deploy::Manifest;
use deploy::manifest;
use deploy::replace::Error as Failed;
use serde::Deserialize;
use std::sync::Arc;
use tokio::io::AsyncWriteExt;

pub fn router(host: Arc<Host>) -> Router {
	let guarded = Router::new()
		.route("/apps", get(apps))
		.route("/apps/{name}", post(upload).layer(DefaultBodyLimit::disable()))
		.route("/routes", get(routes))
		.route("/routes/{name}", put(put_route).delete(delete_route))
		.route("/caddy", get(caddy).post(reapply))
		.layer(middleware::from_fn_with_state(host.clone(), admit));
	Router::new().route("/health", get(health)).merge(guarded).with_state(host)
}

/// What keeper asks before it lets a new host stay: that it reads its own state and reaches
/// Docker, which are what every other request needs. Open, since it says nothing about either.
async fn health(State(host): State<Arc<Host>>) -> StatusCode {
	let ready = host.store.apps().is_ok() && host.engine.ping().await.is_ok();
	if ready { StatusCode::OK } else { StatusCode::SERVICE_UNAVAILABLE }
}

/// Compared in time independent of where the first difference is.
fn same(given: &[u8], expected: &[u8]) -> bool {
	given.len() == expected.len()
		&& given.iter().zip(expected).fold(0, |acc, (a, b)| acc | (a ^ b)) == 0
}

async fn admit(State(host): State<Arc<Host>>, request: Request, next: Next) -> Response {
	let given = request
		.headers()
		.get(header::AUTHORIZATION)
		.and_then(|value| value.to_str().ok())
		.and_then(|value| value.strip_prefix("Bearer "))
		.unwrap_or_default();
	if !same(given.as_bytes(), host.config.token.as_bytes()) {
		return StatusCode::UNAUTHORIZED.into_response();
	}
	next.run(request).await
}

fn failed(status: StatusCode, message: impl ToString) -> Response {
	(status, message.to_string()).into_response()
}

async fn apps(State(host): State<Arc<Host>>) -> Response {
	match host.store.apps() {
		Ok(apps) => Json(apps).into_response(),
		Err(error) => failed(StatusCode::INTERNAL_SERVER_ERROR, error),
	}
}

/// A deploy: the declaration as the part `service`, then the image archive as the part `image`.
/// The archive is written to disk before anything is stopped, so a transfer cut short never
/// leaves the app down.
async fn upload(
	State(host): State<Arc<Host>>,
	Path(name): Path<String>,
	mut parts: Multipart,
) -> Response {
	if let Err(error) = rollout::deployable(&name) {
		return failed(StatusCode::UNPROCESSABLE_ENTITY, error);
	}
	let mut declared: Option<Manifest> = None;
	let archive = deploy::arrival(&host.config.incoming);
	let mut received = false;
	loop {
		let part = match parts.next_field().await {
			Ok(Some(part)) => part,
			Ok(None) => break,
			Err(error) => return failed(StatusCode::BAD_REQUEST, error),
		};
		match part.name() {
			Some("service") => {
				let text = match part.text().await {
					Ok(text) => text,
					Err(error) => return failed(StatusCode::BAD_REQUEST, error),
				};
				match Manifest::parse(&text) {
					Ok(manifest) => declared = Some(manifest),
					Err(error) => return failed(StatusCode::UNPROCESSABLE_ENTITY, error),
				}
			}
			Some("image") => {
				if let Err(error) = save(&archive, part).await {
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
	if let Err(error) = rollout::admit(&host, &name, &manifest) {
		return failed(StatusCode::UNPROCESSABLE_ENTITY, error);
	}

	// One deploy at a time on a node: two would snapshot, stop and route over each other.
	let _one = host.deploying.lock().await;
	let file = match tokio::fs::File::open(&archive).await {
		Ok(file) => file,
		Err(error) => return failed(StatusCode::INTERNAL_SERVER_ERROR, error),
	};
	let loaded = host.engine.load(&name, tokio_util::io::ReaderStream::new(file)).await;
	let _ = tokio::fs::remove_file(&archive).await;
	let image = match loaded {
		Ok(image) => image,
		Err(error) => return failed(StatusCode::UNPROCESSABLE_ENTITY, error),
	};
	match rollout::deploy(&host, manifest, image).await {
		Ok(outcome) => Json(outcome).into_response(),
		Err(error @ (DeployError::Invalid(_) | DeployError::PortTaken { .. })) => {
			failed(StatusCode::UNPROCESSABLE_ENTITY, error)
		}
		Err(error @ DeployError::Replace(Failed::Unhealthy { .. } | Failed::FirstFailed { .. })) => {
			failed(StatusCode::BAD_GATEWAY, error)
		}
		Err(error) => failed(StatusCode::INTERNAL_SERVER_ERROR, error),
	}
}

async fn save(
	path: &std::path::Path,
	mut part: axum::extract::multipart::Field<'_>,
) -> anyhow::Result<()> {
	if let Some(parent) = path.parent() {
		tokio::fs::create_dir_all(parent).await?;
	}
	let mut file = tokio::fs::File::create(path).await?;
	while let Some(chunk) = part.chunk().await? {
		file.write_all(&chunk).await?;
	}
	file.flush().await?;
	Ok(())
}

async fn routes(State(host): State<Arc<Host>>) -> Response {
	match host.store.routes() {
		Ok(routes) => Json(routes).into_response(),
		Err(error) => failed(StatusCode::INTERNAL_SERVER_ERROR, error),
	}
}

#[derive(Deserialize)]
struct RouteBody {
	upstream: String,
	private: bool,
	public: bool,
}

async fn put_route(
	State(host): State<Arc<Host>>,
	Path(name): Path<String>,
	Json(body): Json<RouteBody>,
) -> Response {
	if let Err(error) = manifest::check_name(&name) {
		return failed(StatusCode::UNPROCESSABLE_ENTITY, error);
	}
	let route = Route { name, upstream: body.upstream, private: body.private, public: body.public };
	if let Err(error) = host.store.put_route(&route) {
		return failed(StatusCode::CONFLICT, error);
	}
	routed(&host).await
}

async fn delete_route(State(host): State<Arc<Host>>, Path(name): Path<String>) -> Response {
	match host.store.delete_route(&name) {
		Ok(true) => routed(&host).await,
		Ok(false) => StatusCode::NOT_FOUND.into_response(),
		Err(error) => failed(StatusCode::INTERNAL_SERVER_ERROR, error),
	}
}

/// What Caddy would be given now, without giving it. What to read before switching Caddy over.
async fn caddy(State(host): State<Arc<Host>>) -> Response {
	match rollout::render(&host) {
		Ok(rendered) => Json(rendered).into_response(),
		Err(error) => failed(StatusCode::INTERNAL_SERVER_ERROR, error),
	}
}

async fn reapply(State(host): State<Arc<Host>>) -> Response {
	if let Err(error) = rollout::attach(&host).await {
		return failed(StatusCode::INTERNAL_SERVER_ERROR, error);
	}
	routed(&host).await
}

/// The state changed; Caddy follows. Stored even when Caddy cannot be reached, so the answer says
/// which half happened.
async fn routed(host: &Host) -> Response {
	match rollout::route(host).await {
		Ok(()) => StatusCode::NO_CONTENT.into_response(),
		Err(error) => {
			failed(StatusCode::BAD_GATEWAY, format!("stored, but Caddy was not updated: {error}"))
		}
	}
}

#[cfg(test)]
mod tests {
	#[test]
	fn a_token_matches_only_itself() {
		assert!(super::same(b"secret", b"secret"));
		assert!(!super::same(b"secreT", b"secret"));
		assert!(!super::same(b"secret-and-more", b"secret"));
		assert!(!super::same(b"", b"secret"));
	}
}
