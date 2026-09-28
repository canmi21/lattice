//! What every service, and the panel, reach through Caddy on the private side. See
//! spec/architecture/ledger.md.

use crate::store::{Cursor, Filter, Store};
use axum::Router;
use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::Response;
use axum::routing::{get, put};
use ledger::Record;
use std::sync::{Arc, Mutex};

pub type Shared = Arc<Mutex<Store>>;

/// A page's smallest and largest size; see spec/architecture/ledger.md, "Read by the panel".
const DEFAULT_LIMIT: usize = 50;
const MAX_LIMIT: usize = 500;

pub fn routes(store: Shared) -> Router {
	Router::new()
		.route("/health", get(|| async { response::success(StatusCode::OK, ()) }))
		.route("/tasks", get(list))
		.route("/tasks/{service}/{id}", put(upsert).get(get_one))
		.fallback(|| async { response::failure(StatusCode::NOT_FOUND, "no_such_route") })
		.with_state(store)
}

/// A poisoned lock means a write panicked mid-way; what it holds is still worth reading.
fn lock(store: &Shared) -> std::sync::MutexGuard<'_, Store> {
	store.lock().unwrap_or_else(std::sync::PoisonError::into_inner)
}

/// The path's `service` and `id` have to equal the body's, so a caller cannot address one task and
/// send the record of another; see spec/architecture/ledger.md, "One service, pushed to, never
/// asking".
async fn upsert(
	Path((service, id)): Path<(String, String)>,
	State(store): State<Shared>,
	body: Result<axum::Json<Record>, axum::extract::rejection::JsonRejection>,
) -> Response {
	let Ok(axum::Json(record)) = body else {
		return response::failure(StatusCode::BAD_REQUEST, "invalid_body");
	};
	if record.service != service || record.id != id {
		return response::failure(StatusCode::BAD_REQUEST, "invalid_body");
	}
	match lock(&store).upsert(record) {
		Ok(stored) => response::success(StatusCode::OK, stored),
		Err(error) => {
			response::failure_with(StatusCode::INTERNAL_SERVER_ERROR, "store_unavailable", error)
		}
	}
}

async fn get_one(
	Path((service, id)): Path<(String, String)>,
	State(store): State<Shared>,
) -> Response {
	match lock(&store).get(&service, &id) {
		Ok(Some(stored)) => response::success(StatusCode::OK, stored),
		Ok(None) => response::failure(StatusCode::NOT_FOUND, "no_such_task"),
		Err(error) => {
			response::failure_with(StatusCode::INTERNAL_SERVER_ERROR, "store_unavailable", error)
		}
	}
}

#[derive(serde::Deserialize)]
struct Asked {
	before: Option<String>,
	limit: Option<usize>,
	service: Option<String>,
	state: Option<String>,
	kind: Option<String>,
	caller: Option<String>,
}

/// Newest `updated_at` first. A `before` that does not read as a cursor is treated as absent, and a
/// `state` or `caller` that is not one of the words the wire uses matches nothing, rather than
/// failing a read that is otherwise well formed.
async fn list(State(store): State<Shared>, Query(asked): Query<Asked>) -> Response {
	let limit = asked.limit.unwrap_or(DEFAULT_LIMIT).clamp(1, MAX_LIMIT);
	let before = asked.before.as_deref().and_then(Cursor::parse);
	let filter =
		Filter { service: asked.service, state: asked.state, kind: asked.kind, caller: asked.caller };
	match lock(&store).list(&filter, before.as_ref(), limit) {
		Ok(rows) => response::success(StatusCode::OK, rows),
		Err(error) => {
			response::failure_with(StatusCode::INTERNAL_SERVER_ERROR, "store_unavailable", error)
		}
	}
}

#[cfg(test)]
mod tests {
	use super::*;
	use axum::body::Body;
	use axum::http::Request;
	use http_body_util::BodyExt;
	use ledger::{Caller, State as TaskState, Stored};
	use tower::ServiceExt;

	fn record(service: &str, id: &str) -> Record {
		Record {
			service: service.into(),
			id: id.into(),
			kind: "capture".into(),
			state: TaskState::Queued,
			caller: Caller::Public,
			asked_at: "2026-09-28T12:00:00Z".parse().unwrap(),
			started_at: None,
			finished_at: None,
			summary: serde_json::json!({ "url": "https://example.com/" }),
			detail: None,
		}
	}

	fn shared() -> (tempfile::TempDir, Shared) {
		let directory = tempfile::tempdir().unwrap();
		let store = Store::open(&directory.path().join("ledger.db")).unwrap();
		(directory, Arc::new(Mutex::new(store)))
	}

	async fn put(router: Router, path: &str, record: &Record) -> (StatusCode, serde_json::Value) {
		let body = serde_json::to_vec(record).unwrap();
		let request =
			Request::put(path).header("content-type", "application/json").body(Body::from(body)).unwrap();
		answer(router, request).await
	}

	async fn ask(router: Router, path: &str) -> (StatusCode, serde_json::Value) {
		let request = Request::get(path).body(Body::empty()).unwrap();
		answer(router, request).await
	}

	async fn answer(router: Router, request: Request<Body>) -> (StatusCode, serde_json::Value) {
		let response = router.oneshot(request).await.unwrap();
		let status = response.status();
		let body = response.into_body().collect().await.unwrap().to_bytes();
		(status, serde_json::from_slice(&body).unwrap())
	}

	#[tokio::test]
	async fn upserts_and_reads_back_in_the_envelope() {
		let (_directory, store) = shared();
		let router = routes(store);
		let (status, body) = put(router.clone(), "/tasks/shot/a", &record("shot", "a")).await;
		assert_eq!(status, StatusCode::OK);
		assert_eq!(body["data"]["service"], "shot");
		assert!(body["data"]["updated_at"].is_string());

		let (status, body) = ask(router.clone(), "/tasks/shot/a").await;
		assert_eq!(status, StatusCode::OK);
		assert_eq!(body["data"]["id"], "a");

		let (status, body) = ask(router.clone(), "/tasks/shot/missing").await;
		assert_eq!((status, &body["code"]), (StatusCode::NOT_FOUND, &"no_such_task".into()));

		assert_eq!(ask(router.clone(), "/health").await.0, StatusCode::OK);
		assert_eq!(ask(router, "/nope").await.1["code"], "no_such_route");
	}

	#[tokio::test]
	async fn refuses_a_path_and_body_that_disagree() {
		let (_directory, store) = shared();
		let router = routes(store);
		let (status, body) = put(router, "/tasks/shot/a", &record("shot", "b")).await;
		assert_eq!((status, &body["code"]), (StatusCode::BAD_REQUEST, &"invalid_body".into()));
	}

	#[tokio::test]
	async fn lists_newest_first_paged_and_filtered() {
		let (_directory, store) = shared();
		let router = routes(store);
		for id in ["a", "b", "c"] {
			put(router.clone(), &format!("/tasks/shot/{id}"), &record("shot", id)).await;
		}
		put(router.clone(), "/tasks/geo/d", &record("geo", "d")).await;

		let (status, body) = ask(router.clone(), "/tasks?limit=2").await;
		assert_eq!(status, StatusCode::OK);
		let rows = body["data"].as_array().unwrap();
		assert_eq!(rows.len(), 2);
		assert_eq!(rows[0]["id"], "d");

		let stored: Stored = serde_json::from_value(rows[1].clone()).unwrap();
		let cursor =
			Cursor { updated_at: stored.updated_at.as_nanosecond() as i64, id: stored.record.id };
		let path = format!("/tasks?before={}", Cursor::encode(&cursor));
		let (_, body) = ask(router.clone(), &path).await;
		let rest = body["data"].as_array().unwrap();
		assert_eq!(rest.len(), 2);
		assert_eq!(rest[0]["id"], "b");

		let (_, body) = ask(router.clone(), "/tasks?service=geo").await;
		let rows = body["data"].as_array().unwrap();
		assert_eq!(rows.len(), 1);
		assert_eq!(rows[0]["service"], "geo");
	}

	#[test]
	fn every_code_it_answers_with_is_in_the_catalogue() {
		for code in response::codes_named(include_str!("api.rs")) {
			assert!(response::message_of(code).is_some(), "`{code}` is not in libs/response/codes.json");
		}
	}
}
