//! What host asks the meter, over a Unix socket in the meter's directory: no port, no network. See
//! spec/architecture/meter.md, "Reached through a socket".

use crate::sampler::{Grain, Kept, Sampler};
use axum::Router;
use axum::extract::{Query, State};
use axum::http::StatusCode;
use axum::response::Response;
use axum::routing::get;
use std::sync::{Arc, Mutex};

pub type Shared = Arc<Mutex<Sampler>>;

/// The socket's name in the meter's directory, which host reads through `/data`.
pub const SOCKET: &str = "meter.sock";

pub fn routes(sampler: Shared) -> Router {
	Router::new()
		.route("/health", get(|| async { response::success(StatusCode::OK, ()) }))
		.route("/info", get(info))
		.route("/now", get(now))
		.route("/series", get(series))
		.route("/containers/now", get(containers_now))
		.route("/containers/series", get(containers_series))
		.fallback(|| async { response::failure(StatusCode::NOT_FOUND, "no_such_route") })
		.with_state(sampler)
}

/// A poisoned lock means a tick panicked mid-way; what it holds is still worth reading.
pub fn lock(sampler: &Shared) -> std::sync::MutexGuard<'_, Sampler> {
	sampler.lock().unwrap_or_else(std::sync::PoisonError::into_inner)
}

async fn info(State(sampler): State<Shared>) -> Response {
	response::success(StatusCode::OK, lock(&sampler).info())
}

/// The latest sample, with what does not change beside it, which is everything a first paint needs.
async fn now(State(sampler): State<Shared>) -> Response {
	let sampler = lock(&sampler);
	match sampler.machine().now() {
		Some(sample) => response::success(
			StatusCode::OK,
			serde_json::json!({ "info": sampler.info(), "sample": sample }),
		),
		None => response::failure(StatusCode::SERVICE_UNAVAILABLE, "metrics_unavailable"),
	}
}

#[derive(serde::Deserialize)]
struct Asked {
	grain: Option<String>,
	/// Names or dotted prefixes, separated by commas.
	metrics: Option<String>,
	since: Option<String>,
	until: Option<String>,
}

/// The containers' latest sample, `<name>.<metric>`, with only the metrics asked for.
async fn containers_now(State(sampler): State<Shared>, Query(asked): Query<Asked>) -> Response {
	let metrics = requested(&asked);
	match lock(&sampler).containers().and_then(Kept::now) {
		Some(sample) => {
			let mut sample = sample.clone();
			sample.values.retain(|name, _| crate::retention::asks_for(&metrics, name));
			response::success(StatusCode::OK, sample)
		}
		None => response::failure(StatusCode::SERVICE_UNAVAILABLE, "metrics_unavailable"),
	}
}

/// Names or dotted prefixes, separated by commas; none is everything.
fn requested(asked: &Asked) -> Vec<String> {
	asked
		.metrics
		.iter()
		.flat_map(|metrics| metrics.split(','))
		.map(str::trim)
		.filter(|name| !name.is_empty())
		.map(str::to_owned)
		.collect()
}

async fn series(State(sampler): State<Shared>, Query(asked): Query<Asked>) -> Response {
	answer_series(&asked, lock(&sampler).machine())
}

/// Containers' series: a container's name is the prefix that asks for all of it.
async fn containers_series(State(sampler): State<Shared>, Query(asked): Query<Asked>) -> Response {
	let sampler = lock(&sampler);
	match sampler.containers() {
		Some(kept) => answer_series(&asked, kept),
		None => response::failure(StatusCode::SERVICE_UNAVAILABLE, "metrics_unavailable"),
	}
}

fn answer_series(asked: &Asked, kept: &Kept) -> Response {
	let grain = asked.grain.as_deref().and_then(|grain| {
		serde_json::from_value::<Grain>(serde_json::Value::String(grain.to_owned())).ok()
	});
	let bound = |value: Option<&str>, default: i64| value.map_or(Some(default), |v| v.parse().ok());
	let (Some(grain), Some(since), Some(until)) =
		(grain, bound(asked.since.as_deref(), 0), bound(asked.until.as_deref(), i64::MAX))
	else {
		return response::failure(StatusCode::BAD_REQUEST, "invalid_series");
	};
	let metrics = requested(asked);
	match kept.series(grain, &metrics, since, until) {
		Ok(points) => response::success(StatusCode::OK, points),
		Err(error) => {
			response::failure_with(StatusCode::INTERNAL_SERVER_ERROR, "store_unavailable", error)
		}
	}
}

#[cfg(test)]
mod tests {
	use super::*;
	use crate::probe::{
		self,
		tests::{STAT, machine},
	};
	use crate::store::Store;
	use axum::body::Body;
	use axum::http::Request;
	use http_body_util::BodyExt;
	use std::future::IntoFuture;
	use tower::ServiceExt;

	async fn ask(router: Router, path: &str) -> (StatusCode, serde_json::Value) {
		let request = Request::get(path).body(Body::empty()).unwrap();
		let answer = router.oneshot(request).await.unwrap();
		let status = answer.status();
		let body = answer.into_body().collect().await.unwrap().to_bytes();
		(status, serde_json::from_slice(&body).unwrap())
	}

	#[tokio::test]
	async fn answers_what_it_holds_in_the_envelope() {
		let (root, roots) = machine(STAT);
		let store = Store::open(&root.path().join("hours.db")).unwrap();
		let shared: Shared = Arc::new(Mutex::new(Sampler::new(roots.clone(), store)));
		let router = routes(shared.clone());

		let (status, body) = ask(router.clone(), "/now").await;
		assert_eq!(
			(status, &body["code"]),
			(StatusCode::SERVICE_UNAVAILABLE, &"metrics_unavailable".into())
		);

		for at in 100..105 {
			shared.lock().unwrap().take(probe::reading_at(&roots, at as f64)).unwrap();
		}
		let (status, body) = ask(router.clone(), "/now").await;
		assert_eq!(status, StatusCode::OK);
		assert_eq!(body["data"]["sample"]["at"], 104);
		assert_eq!(body["data"]["info"]["cores"], 2);

		let (_, body) =
			ask(router.clone(), "/series?grain=second&metrics=load,memory.used&since=102").await;
		let points = body["data"].as_array().unwrap();
		assert_eq!(points.len(), 3);
		let names: Vec<&String> = points[0]["values"].as_object().unwrap().keys().collect();
		assert_eq!(names, ["load.1", "load.15", "load.5", "memory.used"]);
		assert_eq!(points[0]["values"]["load.1"]["average"], 0.5);

		for path in ["/series", "/series?grain=day", "/series?grain=hour&since=yesterday"] {
			let (status, body) = ask(router.clone(), path).await;
			assert_eq!(
				(status, &body["code"]),
				(StatusCode::BAD_REQUEST, &"invalid_series".into()),
				"{path}"
			);
		}
		assert_eq!(ask(router.clone(), "/health").await.0, StatusCode::OK);
		assert_eq!(ask(router, "/metrics").await.1["code"], "no_such_route");
	}

	#[tokio::test]
	async fn answers_each_containers_series_apart() {
		let (root, roots) = machine(STAT);
		let store = |name: &str| Store::open(&root.path().join(name)).unwrap();
		let names = crate::containers::Names::at(root.path());
		let sampler =
			Sampler::new(roots, store("hours.db")).with_containers(names, store("containers.db"));
		let shared: Shared = Arc::new(Mutex::new(sampler));
		let router = routes(shared.clone());
		assert_eq!(ask(router.clone(), "/containers/now").await.0, StatusCode::SERVICE_UNAVAILABLE);

		let counters = crate::containers::Counters { cpu: 0, memory: 7, ..Default::default() };
		for at in 100..103 {
			let containers = [("geo".to_owned(), counters), ("shot".to_owned(), counters)].into();
			let reading = crate::containers::Reading { at: at as f64, containers };
			shared.lock().unwrap().take_containers(reading).unwrap();
		}
		let (status, body) = ask(router.clone(), "/containers/now?metrics=geo").await;
		assert_eq!(status, StatusCode::OK);
		let names: Vec<&String> = body["data"]["values"].as_object().unwrap().keys().collect();
		assert_eq!(names.len(), 6);
		assert!(names.iter().all(|name| name.starts_with("geo.")));
		let (_, body) = ask(router, "/containers/series?grain=second&metrics=shot.memory").await;
		assert_eq!(body["data"].as_array().unwrap().len(), 2);
		assert_eq!(body["data"][0]["values"]["shot.memory"]["average"], 7.0);
	}

	#[tokio::test]
	async fn answers_over_a_real_socket() {
		use tokio::io::{AsyncReadExt, AsyncWriteExt};
		let (root, roots) = machine(STAT);
		let store = Store::open(&root.path().join("hours.db")).unwrap();
		let shared: Shared = Arc::new(Mutex::new(Sampler::new(roots, store)));
		let socket = root.path().join(SOCKET);
		let listener = tokio::net::UnixListener::bind(&socket).unwrap();
		tokio::spawn(axum::serve(listener, routes(shared)).into_future());

		let mut stream = tokio::net::UnixStream::connect(&socket).await.unwrap();
		stream
			.write_all(b"GET /info HTTP/1.1\r\nhost: meter\r\nconnection: close\r\n\r\n")
			.await
			.unwrap();
		let mut answer = String::new();
		stream.read_to_string(&mut answer).await.unwrap();
		assert!(answer.starts_with("HTTP/1.1 200"), "{answer}");
		assert!(answer.contains(r#""model":"FriendlyElec NanoPi M5""#), "{answer}");
	}

	#[test]
	fn every_code_it_answers_with_is_in_the_catalogue() {
		for code in response::codes_named(include_str!("api.rs")) {
			assert!(
				response::message_of(code).is_some(),
				"`{code}` is not in lib/pkgs/response/codes.json"
			);
		}
	}
}
