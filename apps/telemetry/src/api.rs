//! The routes `telemetry` answers, over the three sources in `AppState`. See
//! spec/architecture/telemetry.md, "The API".

use crate::ledger::{Count, Ledger};
use crate::meter::{self, Meter};
use crate::services;
use axum::Router;
use axum::extract::rejection::QueryRejection;
use axum::extract::{Path, Query, State};
use axum::http::{HeaderValue, StatusCode, header};
use axum::response::Response;
use axum::routing::get;
use serde::Deserialize;
use serde_json::Value;
use std::sync::Arc;

#[derive(Clone)]
pub struct AppState {
	pub meter: Arc<Meter>,
	pub ledger: Arc<dyn Ledger>,
	pub services: Arc<services::Store>,
}

/// What moves is kept five seconds, and the rest a minute. See
/// spec/architecture/telemetry.md, "The API".
const SHORT: &str = "public, max-age=5";
const LONG: &str = "public, max-age=60";

/// The machine's own metrics, chosen here rather than by the caller. `temperature.` is a prefix,
/// every zone at once. See spec/architecture/meter.md, "Metrics".
const MACHINE_METRICS: &str = "cpu.usage,memory.used,load.1,network.received,network.sent,\
disk.read,disk.written,storage.used,temperature.";

/// `1` to `168` hours, `24` when absent. See spec/architecture/ledger.md, "Counted for telemetry".
const ACTIVITY_HOURS: std::ops::RangeInclusive<u32> = 1..=168;
const ACTIVITY_DEFAULT_HOURS: u32 = 24;

/// The API at `/v1/`, and unversioned until its callers move; `/health` is host's and never
/// versioned. See spec/architecture/gateway.md, "A version is in the path, and it moves only on a
/// break".
pub fn routes(state: AppState) -> Router {
	let v1 = Router::new()
		.route("/machine", get(machine))
		.route("/machine/series", get(machine_series))
		.route("/services", get(list_services))
		.route("/services/{name}", get(one_service))
		.route("/topology", get(topology))
		.route("/activity", get(activity));
	Router::new()
		.route("/health", get(health))
		.nest("/v1", v1.clone())
		.merge(v1)
		.fallback(|| async { response::failure(StatusCode::NOT_FOUND, "no_such_route") })
		.with_state(state)
}

/// `body`, with the caching the route answers under; `libs/response`'s envelope wraps `body`.
fn cached(status: StatusCode, body: impl serde::Serialize, control: &'static str) -> Response {
	let mut answer = response::success(status, body);
	answer.headers_mut().insert(header::CACHE_CONTROL, HeaderValue::from_static(control));
	answer
}

/// A meter answer, folded to `Some` data or `None`: for a field beside others that must not fail
/// just because this one part could not be read.
fn part(answer: meter::Answer) -> Option<Value> {
	match answer {
		meter::Answer::Data(data) => Some(data),
		meter::Answer::Unavailable | meter::Answer::Invalid { .. } => None,
	}
}

async fn health() -> Response {
	response::success(StatusCode::OK, ())
}

/// The machine's facts and its latest second, from the meter's `/now`. See
/// spec/architecture/telemetry.md, "The API".
async fn machine(State(state): State<AppState>) -> Response {
	match state.meter.get("/now").await {
		meter::Answer::Data(data) => cached(StatusCode::OK, data, SHORT),
		meter::Answer::Unavailable => cached(StatusCode::OK, Value::Null, SHORT),
		meter::Answer::Invalid { status, code, message } => {
			response::failure_with(status, &code, message)
		}
	}
}

#[derive(Deserialize)]
struct Span {
	grain: Option<String>,
	since: Option<String>,
	until: Option<String>,
}

/// The query the meter's own `/series` and `/containers/series` read: `metrics` is chosen here,
/// `grain`, `since` and `until` pass through from the caller untouched. See
/// spec/architecture/meter.md, "Retention".
fn series_query(metrics: &str, span: &Span) -> String {
	let mut query = url::form_urlencoded::Serializer::new(String::new());
	query.append_pair("metrics", metrics);
	for (key, value) in [("grain", &span.grain), ("since", &span.since), ("until", &span.until)] {
		if let Some(value) = value {
			query.append_pair(key, value);
		}
	}
	query.finish()
}

/// The machine's history at the meter's three grains. `grain`, `since` and `until` pass through;
/// the metrics are the machine's own. See spec/architecture/telemetry.md, "The API".
async fn machine_series(State(state): State<AppState>, Query(span): Query<Span>) -> Response {
	let query = series_query(MACHINE_METRICS, &span);
	match state.meter.get(&format!("/series?{query}")).await {
		meter::Answer::Data(data) => cached(StatusCode::OK, data, LONG),
		meter::Answer::Unavailable => cached(StatusCode::OK, Value::Null, LONG),
		meter::Answer::Invalid { status, code, message } => {
			response::failure_with(status, &code, message)
		}
	}
}

/// Every service: its image, its state, when it was deployed, and what it uses now -- the
/// container the meter samples under its own name, when it runs one on this node. See
/// spec/architecture/telemetry.md, "The API", and spec/architecture/meter.md, "Each container".
async fn list_services(State(state): State<AppState>) -> Response {
	let Some(services) = state.services.read() else {
		return cached(StatusCode::OK, Value::Null, SHORT);
	};
	let mut answered = Vec::with_capacity(services.apps.len());
	for service in services.apps {
		let now = if service.has_container() {
			let query = series_query(&service.name, &Span { grain: None, since: None, until: None });
			part(state.meter.get(&format!("/containers/now?{query}")).await)
		} else {
			None
		};
		answered.push(serde_json::json!({
			"name": service.name,
			"image": service.image,
			"state": service.state(),
			"deployed_at": service.deployed_at,
			"now": now,
		}));
	}
	cached(StatusCode::OK, answered, SHORT)
}

/// One service's declaration, its history and its series -- the container the meter samples under
/// its own name, when it runs one on this node. See spec/architecture/telemetry.md, "The API".
async fn one_service(
	State(state): State<AppState>,
	Path(name): Path<String>,
	Query(span): Query<Span>,
) -> Response {
	let Some(service) = state.services.find(&name) else {
		return response::failure(StatusCode::NOT_FOUND, "no_such_app");
	};
	let series = if service.has_container() {
		let query = series_query(&name, &span);
		match state.meter.get(&format!("/containers/series?{query}")).await {
			meter::Answer::Data(data) => Some(data),
			meter::Answer::Unavailable => None,
			meter::Answer::Invalid { status, code, message } => {
				return response::failure_with(status, &code, message);
			}
		}
	} else {
		None
	};
	let body = serde_json::json!({
		"declaration": service.declaration,
		"history": service.history,
		"series": series,
	});
	cached(StatusCode::OK, body, LONG)
}

/// The whole arrangement, drawn from `services.json` alone: nothing here asks the meter or the
/// ledger. See spec/architecture/telemetry.md, "The API".
async fn topology(State(state): State<AppState>) -> Response {
	match state.services.read() {
		Some(services) => cached(StatusCode::OK, services::topology(&services), LONG),
		None => cached(StatusCode::OK, Value::Null, LONG),
	}
}

#[derive(Deserialize)]
struct Activity {
	hours: Option<u32>,
}

/// Tasks per service and hour, and how they ended, from the ledger's `GET /counts`. See
/// spec/architecture/ledger.md, "Counted for telemetry".
async fn activity(
	State(state): State<AppState>,
	asked: Result<Query<Activity>, QueryRejection>,
) -> Response {
	let Ok(Query(Activity { hours })) = asked else {
		return response::failure(StatusCode::BAD_REQUEST, "invalid_range");
	};
	let hours = hours.unwrap_or(ACTIVITY_DEFAULT_HOURS);
	if !ACTIVITY_HOURS.contains(&hours) {
		return response::failure(StatusCode::BAD_REQUEST, "invalid_range");
	}
	let counts: Option<Vec<Count>> = state.ledger.counts(hours).await;
	cached(StatusCode::OK, counts, LONG)
}

#[cfg(test)]
mod tests {
	use super::*;
	use crate::ledger::Ledger;
	use axum::body::Body;
	use axum::http::Request;
	use http_body_util::BodyExt;
	use std::future::IntoFuture;
	use tower::ServiceExt;

	const EXAMPLE: &str = r#"{
		"written_at": "2026-09-28T23:00:00Z",
		"apps": [
			{
				"name": "geo",
				"image": "sha256:geo",
				"deployed_at": "2026-09-28T22:40:00Z",
				"held": false,
				"declaration": {
					"version": 1, "name": "geo", "placements": ["home"],
					"container": { "port": 23440, "health": "/health" },
					"api": { "public": true, "limits": [] }
				},
				"history": [{ "action": "deploy", "outcome": "succeeded" }]
			},
			{
				"name": "cdn",
				"image": "sha256:cdn",
				"deployed_at": "2026-09-28T22:41:00Z",
				"held": true,
				"declaration": { "version": 1, "name": "cdn", "placements": ["workers"] },
				"history": []
			}
		]
	}"#;

	struct FakeLedger;

	impl Ledger for FakeLedger {
		fn counts(&self, hours: u32) -> crate::ledger::Counts {
			let row = Count {
				service: "geo".into(),
				hour: "2026-09-28T00:00:00Z".into(),
				state: "done".into(),
				count: hours as i64,
			};
			Box::pin(async move { Some(vec![row]) })
		}
	}

	struct DownLedger;

	impl Ledger for DownLedger {
		fn counts(&self, _hours: u32) -> crate::ledger::Counts {
			Box::pin(async { None })
		}
	}

	/// A meter with no socket bound: every call to it answers `Unavailable`.
	fn down_meter() -> Arc<Meter> {
		Arc::new(Meter::new(std::env::temp_dir().join("telemetry-tests-no-such.sock")))
	}

	async fn fake_meter() -> (tempfile::TempDir, Arc<Meter>) {
		let directory = tempfile::tempdir().unwrap();
		let socket = directory.path().join("meter.sock");
		let router = axum::Router::new()
			.route(
				"/now",
				get(|| async { response::success(StatusCode::OK, serde_json::json!({"sample": 1})) }),
			)
			.route(
				"/series",
				get(|| async { response::failure(StatusCode::BAD_REQUEST, "invalid_series") }),
			)
			.route(
				"/containers/now",
				get(|| async { response::success(StatusCode::OK, serde_json::json!({"geo.cpu": 2})) }),
			)
			.route(
				"/containers/series",
				get(|| async { response::success(StatusCode::OK, serde_json::json!([{"at": 1}])) }),
			);
		let listener = tokio::net::UnixListener::bind(&socket).unwrap();
		tokio::spawn(axum::serve(listener, router).into_future());
		(directory, Arc::new(Meter::new(socket)))
	}

	fn state(meter: Arc<Meter>, ledger: Arc<dyn Ledger>, directory: &std::path::Path) -> AppState {
		std::fs::write(directory.join(services::FILE), EXAMPLE).unwrap();
		AppState { meter, ledger, services: Arc::new(services::Store::new(directory)) }
	}

	async fn ask(router: Router, path: &str) -> (StatusCode, HeaderValue, Value) {
		let request = Request::get(path).body(Body::empty()).unwrap();
		let answer = router.oneshot(request).await.unwrap();
		let status = answer.status();
		let cache = answer
			.headers()
			.get(header::CACHE_CONTROL)
			.cloned()
			.unwrap_or_else(|| HeaderValue::from_static(""));
		let body = answer.into_body().collect().await.unwrap().to_bytes();
		(status, cache, serde_json::from_slice(&body).unwrap())
	}

	#[tokio::test]
	async fn answers_health_and_falls_back_to_no_such_route() {
		let directory = tempfile::tempdir().unwrap();
		let router = routes(state(down_meter(), Arc::new(FakeLedger), directory.path()));
		let (status, _, body) = ask(router.clone(), "/health").await;
		assert_eq!((status, &body["status"]), (StatusCode::OK, &"success".into()));
		let (status, _, body) = ask(router, "/nothing").await;
		assert_eq!((status, &body["code"]), (StatusCode::NOT_FOUND, &"no_such_route".into()));
	}

	#[tokio::test]
	async fn answers_the_same_at_v1_as_unversioned() {
		let directory = tempfile::tempdir().unwrap();
		let router = routes(state(down_meter(), Arc::new(FakeLedger), directory.path()));
		let versioned = ask(router.clone(), "/v1/machine").await;
		assert_eq!(versioned, ask(router.clone(), "/machine").await);
		assert_eq!(ask(router, "/v1/health").await.0, StatusCode::NOT_FOUND);
	}

	#[tokio::test]
	async fn machine_answers_the_meter_and_null_when_it_is_down() {
		let (_dir, meter) = fake_meter().await;
		let directory = tempfile::tempdir().unwrap();
		let router = routes(state(meter, Arc::new(FakeLedger), directory.path()));
		let (status, cache, body) = ask(router, "/machine").await;
		assert_eq!(status, StatusCode::OK);
		assert_eq!(cache, "public, max-age=5");
		assert_eq!(body["data"]["sample"], 1);

		let directory = tempfile::tempdir().unwrap();
		let router = routes(state(down_meter(), Arc::new(FakeLedger), directory.path()));
		let (status, _, body) = ask(router, "/machine").await;
		assert_eq!((status, &body["data"]), (StatusCode::OK, &Value::Null));
	}

	#[tokio::test]
	async fn machine_series_forwards_a_bad_request_from_the_meter() {
		let (_dir, meter) = fake_meter().await;
		let directory = tempfile::tempdir().unwrap();
		let router = routes(state(meter, Arc::new(FakeLedger), directory.path()));
		let (status, _, body) = ask(router, "/machine/series?grain=bad").await;
		assert_eq!((status, &body["code"]), (StatusCode::BAD_REQUEST, &"invalid_series".into()));
	}

	#[tokio::test]
	async fn lists_services_with_what_the_meter_knows_and_none_for_workers() {
		let (_dir, meter) = fake_meter().await;
		let directory = tempfile::tempdir().unwrap();
		let router = routes(state(meter, Arc::new(FakeLedger), directory.path()));
		let (status, cache, body) = ask(router, "/services").await;
		assert_eq!((status, cache), (StatusCode::OK, HeaderValue::from_static("public, max-age=5")));
		let geo = &body["data"][0];
		assert_eq!((&geo["name"], &geo["state"]), (&"geo".into(), &"running".into()));
		assert_eq!(geo["now"]["geo.cpu"], 2);
		let cdn = &body["data"][1];
		assert_eq!((&cdn["state"], &cdn["now"]), (&"stopped".into(), &Value::Null));
	}

	#[tokio::test]
	async fn one_service_answers_its_declaration_and_no_such_app_for_an_unknown_name() {
		let (_dir, meter) = fake_meter().await;
		let directory = tempfile::tempdir().unwrap();
		let router = routes(state(meter, Arc::new(FakeLedger), directory.path()));
		let (status, cache, body) = ask(router.clone(), "/services/geo").await;
		assert_eq!((status, cache), (StatusCode::OK, HeaderValue::from_static("public, max-age=60")));
		assert_eq!(body["data"]["declaration"]["name"], "geo");
		assert_eq!(body["data"]["series"], serde_json::json!([{"at": 1}]));

		let (status, _, body) = ask(router, "/services/nothing").await;
		assert_eq!((status, &body["code"]), (StatusCode::NOT_FOUND, &"no_such_app".into()));
	}

	#[tokio::test]
	async fn topology_is_drawn_from_services_json_alone() {
		let directory = tempfile::tempdir().unwrap();
		let router = routes(state(down_meter(), Arc::new(FakeLedger), directory.path()));
		let (status, cache, body) = ask(router, "/topology").await;
		assert_eq!((status, cache), (StatusCode::OK, HeaderValue::from_static("public, max-age=60")));
		assert_eq!(body["data"]["services"][0]["name"], "geo");
	}

	#[tokio::test]
	async fn activity_reads_the_ledger_and_refuses_an_hours_out_of_range() {
		let directory = tempfile::tempdir().unwrap();
		let router = routes(state(down_meter(), Arc::new(FakeLedger), directory.path()));
		let (status, _, body) = ask(router.clone(), "/activity").await;
		assert_eq!(status, StatusCode::OK);
		assert_eq!(body["data"][0]["count"], 24);

		let (status, _, body) = ask(router.clone(), "/activity?hours=0").await;
		assert_eq!((status, &body["code"]), (StatusCode::BAD_REQUEST, &"invalid_range".into()));
		let (status, _, body) = ask(router, "/activity?hours=169").await;
		assert_eq!((status, &body["code"]), (StatusCode::BAD_REQUEST, &"invalid_range".into()));
	}

	#[tokio::test]
	async fn activity_is_null_rather_than_failing_when_the_ledger_is_down() {
		let directory = tempfile::tempdir().unwrap();
		let router = routes(state(down_meter(), Arc::new(DownLedger), directory.path()));
		let (status, _, body) = ask(router, "/activity?hours=6").await;
		assert_eq!((status, &body["data"]), (StatusCode::OK, &Value::Null));
	}

	#[test]
	fn every_code_it_answers_with_is_in_the_catalogue() {
		for code in response::codes_named(include_str!("api.rs")) {
			assert!(response::message_of(code).is_some(), "`{code}` is not in libs/response/codes.json");
		}
	}
}
