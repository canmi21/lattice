//! The gazetteer over HTTP: the place a position is in, for anything on the network that asks.
//!
//! What `local` works out for a photograph, answered as a service. It is reached through the API
//! gateway under the `geo` scope, which strips the prefix before a request arrives here -- see
//! spec/architecture/services.md, "One API host, scoped by path".

use axum::extract::{Query, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::routing::get;
use axum::{Json, Router};
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

#[derive(Deserialize)]
struct Position {
	lat: f64,
	lon: f64,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
	let data = PathBuf::from(std::env::var("GEO_DATA").unwrap_or_else(|_| "/data".into()));
	let listen = std::env::var("LISTEN").unwrap_or_else(|_| format!("0.0.0.0:{PORT}"));

	let loaded: Loaded = Arc::default();
	let router = Router::new()
		.route("/reverse", get(reverse))
		.route("/health", get(health))
		.with_state(loaded.clone());
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

async fn reverse(State(loaded): State<Loaded>, Query(at): Query<Position>) -> Response {
	let in_range = (-90.0..=90.0).contains(&at.lat) && (-180.0..=180.0).contains(&at.lon);
	if !in_range {
		return (StatusCode::BAD_REQUEST, "lat must be within 90 and lon within 180").into_response();
	}
	let Some(gazetteer) = loaded.get() else {
		return StatusCode::SERVICE_UNAVAILABLE.into_response();
	};
	match gazetteer.lookup(at.lat, at.lon) {
		Some(address) => Json(address).into_response(),
		None => StatusCode::NOT_FOUND.into_response(),
	}
}

async fn health(State(loaded): State<Loaded>) -> StatusCode {
	if loaded.get().is_some() { StatusCode::OK } else { StatusCode::SERVICE_UNAVAILABLE }
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
	#[test]
	fn the_port_is_the_one_the_declaration_states() {
		let declaration = include_str!("../service.toml");
		assert!(declaration.lines().any(|line| line.trim() == format!("port = {}", super::PORT)));
	}
}
