//! The public `probe` scope: the declared checks and the archive, read-only, each answer kept a
//! minute. See spec/architecture/probe.md, "Where the results go".

use crate::archive::Archive;
use crate::checks::Check;
use axum::Router;
use axum::extract::rejection::QueryRejection;
use axum::extract::{Path, Query, State};
use axum::http::{HeaderValue, StatusCode, header};
use axum::response::Response;
use axum::routing::get;
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};

#[derive(Clone)]
pub struct AppState {
	pub checks: Arc<Vec<Check>>,
	pub place: String,
	/// A connection of its own, reading beside the one that writes; WAL lets both.
	pub archive: Arc<Mutex<Archive>>,
}

const KEPT: &str = "public, max-age=60";

/// `since` and `until` at most a day apart, and at most ten thousand rounds a page.
const SPAN: i64 = 86_400;
const PAGE: usize = 10_000;

/// The API at `/v1/`, where a check's results are under the check; `/health` is host's and never
/// versioned. See
/// spec/architecture/gateway.md, "A version is in the path, and it moves only on a break", and the
/// workspace's spec/addresses.md.
pub fn routes(state: AppState) -> Router {
	let v1 =
		Router::new().route("/checks", get(checks)).route("/checks/{check}/results", get(results_of));
	Router::new()
		.route("/health", get(|| async { kept(()) }))
		.nest("/v1", v1)
		.fallback(|| async { response::failure(StatusCode::NOT_FOUND, "no_such_route") })
		.with_state(state)
}

fn kept(body: impl Serialize) -> Response {
	let mut answer = response::success(StatusCode::OK, body);
	answer.headers_mut().insert(header::CACHE_CONTROL, HeaderValue::from_static(KEPT));
	answer
}

#[derive(Serialize)]
struct Declared<'a> {
	id: &'a str,
	name: &'a str,
	kind: &'static str,
	target: &'a str,
	place: &'a str,
	/// Named as `checks.interval_seconds` is in the status schema, which the page also reads.
	interval_seconds: f64,
}

async fn checks(State(state): State<AppState>) -> Response {
	let declared: Vec<Declared> = state
		.checks
		.iter()
		.map(|check| Declared {
			id: &check.id,
			name: &check.name,
			kind: check.kind.name(),
			target: &check.target,
			place: &state.place,
			interval_seconds: check.interval.as_secs_f64(),
		})
		.collect();
	kept(declared)
}

/// The range a check's results are asked for.
#[derive(Deserialize)]
struct Range {
	since: i64,
	until: i64,
}

#[derive(Serialize)]
struct Answered {
	place: String,
	results: Vec<crate::round::Round>,
	#[serde(skip_serializing_if = "Option::is_none")]
	next: Option<i64>,
}

async fn results_of(
	State(state): State<AppState>,
	Path(check): Path<String>,
	range: Result<Query<Range>, QueryRejection>,
) -> Response {
	let Ok(Query(range)) = range else {
		return response::failure(StatusCode::BAD_REQUEST, "invalid_range");
	};
	page(state, check, range.since, range.until).await
}

/// One check's rounds from `since` to `until`, a page at a time.
async fn page(state: AppState, check: String, since: i64, until: i64) -> Response {
	if !(since < until && until - since <= SPAN) {
		return response::failure(StatusCode::BAD_REQUEST, "invalid_range");
	}
	if !state.checks.iter().any(|declared| declared.id == check) {
		return response::failure(StatusCode::NOT_FOUND, "no_such_check");
	}
	let archive = state.archive.clone();
	let place = state.place.clone();
	let read = tokio::task::spawn_blocking(move || {
		let archive = archive.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
		archive.page(&check, &place, since, until, PAGE)
	})
	.await;
	match read {
		Ok(Ok(page)) => kept(Answered { place: state.place, results: page.rounds, next: page.next }),
		Ok(Err(error)) => {
			eprintln!("probe: reading the archive: {error}");
			response::failure(StatusCode::SERVICE_UNAVAILABLE, "store_unavailable")
		}
		Err(error) => {
			eprintln!("probe: reading the archive: {error}");
			response::failure(StatusCode::SERVICE_UNAVAILABLE, "store_unavailable")
		}
	}
}

#[cfg(test)]
mod tests {
	use super::*;
	use crate::round::Round;
	use axum::body::Body;
	use axum::http::Request;
	use http_body_util::BodyExt;
	use serde_json::Value;
	use tower::ServiceExt;

	fn state(directory: &std::path::Path) -> AppState {
		let path = directory.join("probe.db");
		let mut writer = Archive::open(&path).unwrap();
		let rounds = [
			Round { check: "dns.site".into(), at: 5_000, ok: true, duration_ms: 12, detail: None },
			Round {
				check: "dns.site".into(),
				at: 6_000,
				ok: false,
				duration_ms: 40,
				detail: Some("google: rcode 2".into()),
			},
		];
		writer.keep("home", &rounds).unwrap();
		AppState {
			checks: Arc::new(crate::checks::parse(crate::checks::DECLARED).unwrap()),
			place: "home".into(),
			archive: Arc::new(Mutex::new(Archive::open(&path).unwrap())),
		}
	}

	async fn ask(router: Router, path: &str) -> (StatusCode, Option<HeaderValue>, Value) {
		let answer = router.oneshot(Request::get(path).body(Body::empty()).unwrap()).await.unwrap();
		let status = answer.status();
		let cache = answer.headers().get(header::CACHE_CONTROL).cloned();
		let body = answer.into_body().collect().await.unwrap().to_bytes();
		(status, cache, serde_json::from_slice(&body).unwrap())
	}

	#[tokio::test]
	async fn answers_the_declared_checks_kept_a_minute() {
		let directory = tempfile::tempdir().unwrap();
		let router = routes(state(directory.path()));
		let (status, cache, body) = ask(router.clone(), "/v1/checks").await;
		assert_eq!((status, cache.unwrap()), (StatusCode::OK, HeaderValue::from_static(KEPT)));
		let first = &body["data"][0];
		assert_eq!(first["id"], "health.geo");
		assert_eq!(first["name"], "Geolocation");
		assert_eq!(first["target"], "API_PRIVATE/geo/health");
		assert_eq!(
			(first["kind"].as_str(), first["interval_seconds"].as_f64()),
			(Some("health"), Some(5.0))
		);
		let (status, _, body) = ask(router, "/health").await;
		assert_eq!((status, &body["status"]), (StatusCode::OK, &"success".into()));
	}

	#[tokio::test]
	async fn answers_one_checks_results_from_the_archive() {
		let directory = tempfile::tempdir().unwrap();
		let router = routes(state(directory.path()));
		let (status, cache, body) =
			ask(router.clone(), "/v1/checks/dns.site/results?since=0&until=60").await;
		assert_eq!((status, cache.unwrap()), (StatusCode::OK, HeaderValue::from_static(KEPT)));
		let results = body["data"]["results"].as_array().unwrap();
		assert_eq!(results.len(), 2);
		assert_eq!(results[0]["at"], "1970-01-01T00:00:05Z");
		assert!(results[0].get("detail").is_none());
		assert_eq!(results[1]["detail"], "google: rcode 2");
		assert!(body["data"].get("next").is_none());
		assert_eq!(body["data"]["place"], "home");

		let (status, _, body) =
			ask(router.clone(), "/v1/checks/dns.site/results?since=6&until=60").await;
		assert_eq!((status, body["data"]["results"].as_array().unwrap().len()), (StatusCode::OK, 1));
	}

	#[tokio::test]
	async fn answers_a_checks_results_under_the_check_and_nothing_at_the_old_shape() {
		let directory = tempfile::tempdir().unwrap();
		let router = routes(state(directory.path()));
		let (status, _, body) = ask(router.clone(), "/v1/checks/nope/results?since=0&until=1").await;
		assert_eq!((status, &body["code"]), (StatusCode::NOT_FOUND, &"no_such_check".into()));
		let shapes =
			["/checks", concat!("/results?check=", "dns.site&since=0&until=60"), "/v1/results"];
		for old in shapes {
			assert_eq!(ask(router.clone(), old).await.0, StatusCode::NOT_FOUND, "{old}");
		}
	}

	#[tokio::test]
	async fn refuses_a_range_it_cannot_read_and_a_check_it_does_not_have() {
		let directory = tempfile::tempdir().unwrap();
		let router = routes(state(directory.path()));
		for path in [
			"/v1/checks/dns.site/results?since=10&until=10",
			"/v1/checks/dns.site/results?since=0&until=86401",
			"/v1/checks/dns.site/results?since=x&until=1",
			"/v1/checks/dns.site/results",
		] {
			let (status, _, body) = ask(router.clone(), path).await;
			assert_eq!(
				(status, &body["code"]),
				(StatusCode::BAD_REQUEST, &"invalid_range".into()),
				"{path}"
			);
		}
		let (status, _, body) = ask(router.clone(), "/v1/checks/nope/results?since=0&until=1").await;
		assert_eq!((status, &body["code"]), (StatusCode::NOT_FOUND, &"no_such_check".into()));
		let (status, _, body) = ask(router, "/nothing").await;
		assert_eq!((status, &body["code"]), (StatusCode::NOT_FOUND, &"no_such_route".into()));
	}

	#[test]
	fn every_code_answered_is_in_the_catalogue() {
		for code in response::codes_named(include_str!("api.rs")) {
			assert!(response::message_of(code).is_some(), "{code} is not in libs/response/codes.json");
		}
	}
}
