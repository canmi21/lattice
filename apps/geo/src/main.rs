//! The gazetteer over HTTP: the place a position is in, for anything on the network that asks.
//!
//! What `local` works out for a photograph, answered as a service. It is reached through the API
//! gateway under the `geo` scope, which strips the prefix before a request arrives here -- see
//! spec/architecture/services.md, "One API host, scoped by path".

use axum::Router;
use axum::extract::rejection::QueryRejection;
use axum::extract::{Query, State};
use axum::http::StatusCode;
use axum::response::Response;
use axum::routing::get;
use geocode::Gazetteer;
use serde::Deserialize;
use std::future::IntoFuture;
use std::path::PathBuf;
use std::sync::{Arc, OnceLock};

/// musl's allocator is slow under many small allocations, and images are built for speed; see
/// spec/architecture/host.md, "An image is built for speed, and for any node of its architecture".
#[global_allocator]
static ALLOCATOR: mimalloc::MiMalloc = mimalloc::MiMalloc;

/// This service's port, inside its container and everywhere else. `service.toml` states it for
/// host, and the test below holds the two together.
const PORT: u16 = 23440;

/// Empty until the data is read, which is what `/health` reports on.
type Loaded = Arc<OnceLock<Gazetteer>>;

/// Where to look, in degrees. Spelled out; see spec/architecture/services.md, "Names in an API are
/// spelled out".
#[derive(Deserialize)]
struct Position {
	latitude: f64,
	longitude: f64,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
	let data = PathBuf::from(std::env::var("GEO_DATA").unwrap_or_else(|_| "/data".into()));
	let listen = std::env::var("LISTEN").unwrap_or_else(|_| format!("0.0.0.0:{PORT}"));

	let loaded: Loaded = Arc::default();
	let router = routes(loaded.clone());
	let listener = tokio::net::TcpListener::bind(&listen).await?;
	eprintln!("geo: listening on {listen}, reading {}", data.display());

	// Served before the data is read, so a health check sees "not yet" rather than a refused
	// connection. Missing data ends the process: a gazetteer that cannot answer is a failed deploy,
	// and exiting is what lets the deploy's check see it and put the previous version back.
	let reading = tokio::task::spawn_blocking(move || {
		let gazetteer = Gazetteer::open(&data)
			.ok_or_else(|| anyhow::anyhow!("no gazetteer at {}", data.display()))?;
		gazetteer.preload();
		let _ = loaded.set(gazetteer);
		anyhow::Ok(())
	});

	let mut serving =
		tokio::spawn(axum::serve(listener, router).with_graceful_shutdown(stopped()).into_future());
	tokio::select! {
		read = reading => {
			read??;
			eprintln!("geo: ready");
		}
		served = &mut serving => return Ok(served??),
	}
	Ok(serving.await??)
}

fn routes(loaded: Loaded) -> Router {
	Router::new()
		.route("/address", get(address))
		.route("/health", get(health))
		.fallback(|| async { response::failure(StatusCode::NOT_FOUND, "no_such_route") })
		.with_state(loaded)
}

/// The place a position is in, as an address from the continent down.
async fn address(
	State(loaded): State<Loaded>,
	asked: Result<Query<Position>, QueryRejection>,
) -> Response {
	let Ok(Query(at)) = asked else {
		let message = "Latitude and longitude are both needed, as numbers";
		return response::failure_with(StatusCode::BAD_REQUEST, "invalid_position", message);
	};
	let in_range = (-90.0..=90.0).contains(&at.latitude) && (-180.0..=180.0).contains(&at.longitude);
	if !in_range {
		return response::failure(StatusCode::BAD_REQUEST, "invalid_position");
	}
	let Some(gazetteer) = loaded.get() else {
		return loading();
	};
	match gazetteer.lookup(at.latitude, at.longitude) {
		Some(address) => response::success(StatusCode::OK, address),
		None => response::failure(StatusCode::NOT_FOUND, "no_such_place"),
	}
}

async fn health(State(loaded): State<Loaded>) -> Response {
	if loaded.get().is_some() { response::success(StatusCode::OK, ()) } else { loading() }
}

fn loading() -> Response {
	let message = "The gazetteer is still loading";
	response::failure_with(StatusCode::SERVICE_UNAVAILABLE, "service_unavailable", message)
}

/// `docker stop` sends SIGTERM, and a process that is PID 1 in its container ignores it unless it
/// asks; without this every deploy would wait out Docker's grace period and then be killed.
async fn stopped() {
	let interrupted = async {
		let _ = tokio::signal::ctrl_c().await;
	};
	let terminated = async {
		if let Ok(mut signal) =
			tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
		{
			signal.recv().await;
		}
	};
	tokio::select! {
		() = interrupted => {}
		() = terminated => {}
	}
}

#[cfg(test)]
mod tests {
	use super::*;
	use axum::body::Body;
	use axum::http::Request;
	use http_body_util::BodyExt;
	use tower::ServiceExt;

	/// What the service answers `path` with while its data is still loading.
	async fn ask(path: &str) -> (StatusCode, serde_json::Value) {
		let request = Request::get(path).body(Body::empty()).unwrap();
		let answer = routes(Loaded::default()).oneshot(request).await.unwrap();
		let status = answer.status();
		let body = answer.into_body().collect().await.unwrap().to_bytes();
		(status, serde_json::from_slice(&body).unwrap())
	}

	#[tokio::test]
	async fn refuses_a_position_it_cannot_read_in_the_envelope() {
		for path in ["/address", "/address?lat=1&lon=2", "/address?latitude=a&longitude=2"] {
			let (status, body) = ask(path).await;
			assert_eq!(status, StatusCode::BAD_REQUEST, "{path}");
			assert_eq!(body["code"], "invalid_position", "{path}");
		}
		let (status, body) = ask("/address?latitude=91&longitude=0").await;
		assert_eq!((status, &body["code"]), (StatusCode::BAD_REQUEST, &"invalid_position".into()));
	}

	#[tokio::test]
	async fn says_it_is_loading_rather_than_answering_nothing() {
		let (status, body) = ask("/address?latitude=35.68&longitude=139.69").await;
		assert_eq!(status, StatusCode::SERVICE_UNAVAILABLE);
		assert_eq!(body["code"], "service_unavailable");
		assert_eq!(ask("/health").await.0, StatusCode::SERVICE_UNAVAILABLE);
		let (status, body) = ask("/reverse").await;
		assert_eq!((status, &body["code"]), (StatusCode::NOT_FOUND, &"no_such_route".into()));
	}

	#[test]
	fn the_port_is_the_one_the_declaration_states() {
		let declaration = include_str!("../service.toml");
		assert!(declaration.lines().any(|line| line.trim() == format!("port = {}", super::PORT)));
	}

	#[test]
	fn every_code_it_answers_with_is_in_the_catalogue() {
		for code in response::codes_named(include_str!("main.rs")) {
			assert!(response::message_of(code).is_some(), "`{code}` is not in libs/response/codes.json");
		}
	}
}
