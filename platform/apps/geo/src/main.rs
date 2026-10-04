//! The gazetteer over HTTP: the place a position is in, for anything on the network that asks.
//!
//! What `local` works out for a photograph, answered as a service. It is reached through the API
//! gateway under the `geo` scope, which strips the prefix before a request arrives here -- see
//! spec/architecture/services.md, "One API host, scoped by path".

mod fetch;
mod ip;
mod store;

use axum::Router;
use axum::extract::rejection::QueryRejection;
use axum::extract::{ConnectInfo, Query, State};
use axum::http::{HeaderMap, StatusCode};
use axum::response::Response;
use axum::routing::get;
use geocode::Gazetteer;
use serde::Deserialize;
use std::future::IntoFuture;
use std::net::{IpAddr, SocketAddr};
use std::path::PathBuf;
use std::sync::{Arc, OnceLock};

/// musl's allocator is slow under many small allocations, and images are built for speed; see
/// spec/architecture/host.md, "An image is built for speed, and for any node of its architecture".
#[global_allocator]
static ALLOCATOR: mimalloc::MiMalloc = mimalloc::MiMalloc;

/// This service's port, inside its container and everywhere else. `service.toml` states it for
/// host, and the test below holds the two together.
const PORT: u16 = 23440;

/// Empty until the gazetteer is read, which is what `/health` reports on.
type Loaded = Arc<OnceLock<Gazetteer>>;

/// What both routes need, cloned once per request; each field is its own `Arc`, so cloning this
/// clones no data.
#[derive(Clone)]
struct AppState {
	gazetteer: Loaded,
	geo: Arc<store::Store>,
}

/// Where to look, in degrees. Spelled out; see spec/architecture/services.md, "Names in an API are
/// spelled out".
#[derive(Deserialize)]
struct Position {
	latitude: f64,
	longitude: f64,
}

/// `address` is optional: absent, the caller's own address is looked up instead.
#[derive(Deserialize)]
struct IpQuery {
	address: Option<String>,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
	let data = PathBuf::from(std::env::var("GEO_DATA").unwrap_or_else(|_| "/data".into()));
	// Writable, unlike GEO_DATA: GeoLite2 is fetched here at run time, not shipped with the image.
	// See spec/architecture/geo.md, "geo fetches it itself, at run time, once a day".
	let state_dir = PathBuf::from(std::env::var("GEO_STATE").unwrap_or_else(|_| "/state".into()));
	let listen = std::env::var("LISTEN").unwrap_or_else(|_| format!("0.0.0.0:{PORT}"));

	let gazetteer: Loaded = Arc::default();
	let geo = Arc::new(store::Store::default());
	let state = AppState { gazetteer: gazetteer.clone(), geo: geo.clone() };
	let router = routes(state);
	let listener = tokio::net::TcpListener::bind(&listen).await?;
	eprintln!(
		"geo: listening on {listen}, reading {}, fetching to {}",
		data.display(),
		state_dir.display()
	);

	// GeoLite2 is fetched independently of the gazetteer: a slow or failing mirror must not hold
	// up `/address` or `/health`, which is what `refresh_forever` running unawaited here gives.
	tokio::spawn(fetch::refresh_forever(state_dir, geo));

	// Served before the data is read, so a health check sees "not yet" rather than a refused
	// connection. Missing data ends the process: a gazetteer that cannot answer is a failed deploy,
	// and exiting is what lets the deploy's check see it and put the previous version back.
	let reading = tokio::task::spawn_blocking(move || {
		let gazetteer_data = Gazetteer::open(&data)
			.ok_or_else(|| anyhow::anyhow!("no gazetteer at {}", data.display()))?;
		gazetteer_data.preload();
		let _ = gazetteer.set(gazetteer_data);
		anyhow::Ok(())
	});

	let mut serving = tokio::spawn(
		axum::serve(listener, router.into_make_service_with_connect_info::<SocketAddr>())
			.with_graceful_shutdown(stopped())
			.into_future(),
	);
	tokio::select! {
		read = reading => {
			read??;
			eprintln!("geo: ready");
		}
		served = &mut serving => return Ok(served??),
	}
	Ok(serving.await??)
}

/// The lookups at `/v1/`; `/health` is host's and never versioned. See
/// spec/architecture/gateway.md, "A version is in the path, and it moves only on a break".
fn routes(state: AppState) -> Router {
	let v1 = Router::new().route("/address", get(address)).route("/ip", get(ip_lookup));
	Router::new()
		.route("/health", get(health))
		.nest("/v1", v1)
		.fallback(|| async { response::failure(StatusCode::NOT_FOUND, "no_such_route") })
		.with_state(state)
}

/// The place a position is in, as an address from the continent down.
async fn address(
	State(state): State<AppState>,
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
	let Some(gazetteer) = state.gazetteer.get() else {
		return loading();
	};
	match gazetteer.lookup(at.latitude, at.longitude) {
		Some(address) => response::success(StatusCode::OK, address),
		None => response::failure(StatusCode::NOT_FOUND, "no_such_place"),
	}
}

/// An address, looked up in GeoLite2: given directly, or the caller's own otherwise. See
/// spec/architecture/geo.md, "`/geo/ip`: an address, looked up".
async fn ip_lookup(
	State(state): State<AppState>,
	headers: HeaderMap,
	ConnectInfo(peer): ConnectInfo<SocketAddr>,
	asked: Result<Query<IpQuery>, QueryRejection>,
) -> Response {
	let Ok(Query(asked)) = asked else {
		return response::failure(StatusCode::BAD_REQUEST, "invalid_address");
	};
	let Some(address) = resolve_address(asked.address.as_deref(), &headers, peer) else {
		return response::failure(StatusCode::BAD_REQUEST, "invalid_address");
	};
	let Some(readers) = state.geo.get() else {
		let message = "GeoLite2 has not been fetched yet";
		return response::failure_with(StatusCode::SERVICE_UNAVAILABLE, "service_unavailable", message);
	};
	response::success(StatusCode::OK, ip::lookup(&readers, address))
}

/// `given`, when there is one and it parses; otherwise `Cf-Connecting-Ip`, the gateway's own
/// header, when that parses; otherwise the address the connection itself arrived from. A header
/// that does not parse is not the caller's fault, so it falls back rather than answering `400`.
fn resolve_address(given: Option<&str>, headers: &HeaderMap, peer: SocketAddr) -> Option<IpAddr> {
	if let Some(text) = given {
		return text.parse().ok();
	}
	let forwarded = headers.get("cf-connecting-ip").and_then(|value| value.to_str().ok());
	Some(forwarded.and_then(|text| text.parse().ok()).unwrap_or_else(|| peer.ip()))
}

async fn health(State(state): State<AppState>) -> Response {
	if state.gazetteer.get().is_some() { response::success(StatusCode::OK, ()) } else { loading() }
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

	fn state() -> AppState {
		AppState { gazetteer: Loaded::default(), geo: Arc::new(store::Store::default()) }
	}

	/// What the service answers `path` with while its data is still loading. `ConnectInfo` is
	/// set by hand: `oneshot` runs the `Router` directly, not through
	/// `into_make_service_with_connect_info`, which is what sets it in `main`.
	async fn ask(path: &str) -> (StatusCode, serde_json::Value) {
		ask_headers(path, &[]).await
	}

	async fn ask_headers(path: &str, headers: &[(&str, &str)]) -> (StatusCode, serde_json::Value) {
		let mut request = Request::get(path);
		for (name, value) in headers {
			request = request.header(*name, *value);
		}
		let mut request = request.body(Body::empty()).unwrap();
		request.extensions_mut().insert(ConnectInfo(SocketAddr::from(([203, 0, 113, 9], 0))));
		let answer = routes(state()).oneshot(request).await.unwrap();
		let status = answer.status();
		let body = answer.into_body().collect().await.unwrap().to_bytes();
		(status, serde_json::from_slice(&body).unwrap())
	}

	#[tokio::test]
	async fn refuses_a_position_it_cannot_read_in_the_envelope() {
		for path in ["/v1/address", "/v1/address?lat=1&lon=2", "/v1/address?latitude=a&longitude=2"] {
			let (status, body) = ask(path).await;
			assert_eq!(status, StatusCode::BAD_REQUEST, "{path}");
			assert_eq!(body["code"], "invalid_position", "{path}");
		}
		let (status, body) = ask("/v1/address?latitude=91&longitude=0").await;
		assert_eq!((status, &body["code"]), (StatusCode::BAD_REQUEST, &"invalid_position".into()));
	}

	#[tokio::test]
	async fn says_it_is_loading_rather_than_answering_nothing() {
		let (status, body) = ask("/v1/address?latitude=35.68&longitude=139.69").await;
		assert_eq!(status, StatusCode::SERVICE_UNAVAILABLE);
		assert_eq!(body["code"], "service_unavailable");
		assert_eq!(ask("/health").await.0, StatusCode::SERVICE_UNAVAILABLE);
		let (status, body) = ask("/reverse").await;
		assert_eq!((status, &body["code"]), (StatusCode::NOT_FOUND, &"no_such_route".into()));
	}

	#[tokio::test]
	async fn refuses_an_address_it_cannot_parse() {
		let (status, body) = ask("/v1/ip?address=not-an-address").await;
		assert_eq!((status, &body["code"]), (StatusCode::BAD_REQUEST, &"invalid_address".into()));
	}

	#[tokio::test]
	async fn is_unavailable_rather_than_wrong_before_geolite2_has_landed() {
		let (status, body) = ask("/v1/ip?address=1.1.1.1").await;
		assert_eq!(status, StatusCode::SERVICE_UNAVAILABLE);
		assert_eq!(body["code"], "service_unavailable");
		// /address and /health answer on their own data, unaffected by geo's still being empty.
		assert_eq!(ask("/health").await.0, StatusCode::SERVICE_UNAVAILABLE);
	}

	#[test]
	fn falls_back_from_a_given_address_to_the_header_to_the_peer() {
		let headers = HeaderMap::new();
		let peer = SocketAddr::from(([203, 0, 113, 9], 0));
		assert_eq!(resolve_address(Some("1.1.1.1"), &headers, peer), Some("1.1.1.1".parse().unwrap()));
		assert_eq!(resolve_address(Some("not-an-address"), &headers, peer), None);

		let mut with_header = HeaderMap::new();
		with_header.insert("cf-connecting-ip", "8.8.8.8".parse().unwrap());
		assert_eq!(resolve_address(None, &with_header, peer), Some("8.8.8.8".parse().unwrap()));

		assert_eq!(resolve_address(None, &headers, peer), Some(peer.ip()));

		let mut bad_header = HeaderMap::new();
		bad_header.insert("cf-connecting-ip", "not-an-address".parse().unwrap());
		assert_eq!(resolve_address(None, &bad_header, peer), Some(peer.ip()));
	}

	#[test]
	fn the_port_is_the_one_the_declaration_states() {
		let declaration = include_str!("../service.toml");
		assert!(declaration.lines().any(|line| line.trim() == format!("port = {}", super::PORT)));
	}

	#[test]
	fn every_code_it_answers_with_is_in_the_catalogue() {
		for code in response::codes_named(include_str!("main.rs")) {
			assert!(
				response::message_of(code).is_some(),
				"`{code}` is not in lib/pkgs/response/codes.json"
			);
		}
	}
}
