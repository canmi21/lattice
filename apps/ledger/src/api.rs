//! What every service, and the panel, reach through Caddy on the private side. See
//! spec/architecture/ledger.md.

use crate::store::{Cursor, Filter, Store, StoredTask};
use axum::Router;
use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::Response;
use axum::routing::{get, post, put};
use ledger::{Item, Record};
use std::sync::{Arc, Mutex};

pub type Shared = Arc<Mutex<Store>>;

/// A page's smallest and largest size; see spec/architecture/ledger.md, "Read by the panel".
const DEFAULT_LIMIT: usize = 50;
const MAX_LIMIT: usize = 500;

/// `GET /counts`'s window, in whole hours; see spec/architecture/ledger.md, "Counted for
/// telemetry".
const DEFAULT_HOURS: u32 = 24;
const MAX_HOURS: u32 = 168;

pub fn routes(store: Shared) -> Router {
	Router::new()
		.route("/health", get(|| async { response::success(StatusCode::OK, ()) }))
		.route("/tasks", get(list))
		.route("/tasks/{service}/{id}", put(upsert).get(get_one))
		.route("/events", post(events))
		.route("/counts", get(counts))
		.fallback(|| async { response::failure(StatusCode::NOT_FOUND, "no_such_route") })
		.with_state(store)
}

/// A poisoned lock means a write panicked mid-way; what it holds is still worth reading.
fn lock(store: &Shared) -> std::sync::MutexGuard<'_, Store> {
	store.lock().unwrap_or_else(std::sync::PoisonError::into_inner)
}

/// The path's `service` and `id` have to equal the body's, so a caller cannot address one task and
/// send the record of another; see spec/architecture/ledger.md, "Pushed to, never asking".
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
	match lock(&store).upsert(record.into()) {
		Ok(stored) => response::success(StatusCode::OK, stored),
		Err(error) => {
			response::failure_with(StatusCode::INTERNAL_SERVER_ERROR, "store_unavailable", error)
		}
	}
}

/// The task as `Stored` (parent included), its events in `seq` order and the tasks it is the
/// parent of, newest first. See spec/architecture/ledger.md, "Read by the panel".
async fn get_one(
	Path((service, id)): Path<(String, String)>,
	State(store): State<Shared>,
) -> Response {
	match lock(&store).view(&service, &id) {
		Ok(Some(view)) => response::success(StatusCode::OK, view),
		Ok(None) => response::failure(StatusCode::NOT_FOUND, "no_such_task"),
		Err(error) => {
			response::failure_with(StatusCode::INTERNAL_SERVER_ERROR, "store_unavailable", error)
		}
	}
}

/// `service:id`, split on the first `:` so an `id` holding one is still recovered whole.
fn split_parent(parent: &str) -> Option<(String, String)> {
	let (service, id) = parent.split_once(':')?;
	Some((service.to_owned(), id.to_owned()))
}

/// One row of `GET /tasks`: the stored task plus its own `cursor`, so `before=<cursor>` of the
/// last item asks for the next page. Only the list answers this way -- the single-task view has no
/// paging to carry a cursor for.
#[derive(serde::Serialize)]
struct Listed {
	#[serde(flatten)]
	task: StoredTask,
	cursor: String,
}

impl From<StoredTask> for Listed {
	fn from(task: StoredTask) -> Self {
		let cursor = Cursor {
			updated_at: task.updated_at.as_nanosecond() as i64,
			id: task.task.record.id.clone(),
		}
		.encode();
		Self { task, cursor }
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
	parent: Option<String>,
}

/// Newest `updated_at` first. A `before` that does not read as a cursor is treated as absent, and a
/// `state`, `caller` or `parent` that does not read as one matches nothing, rather than failing a
/// read that is otherwise well formed.
async fn list(State(store): State<Shared>, Query(asked): Query<Asked>) -> Response {
	let limit = asked.limit.unwrap_or(DEFAULT_LIMIT).clamp(1, MAX_LIMIT);
	let before = asked.before.as_deref().and_then(Cursor::parse);
	let parent = asked.parent.as_deref().and_then(split_parent);
	let filter = Filter {
		service: asked.service,
		state: asked.state,
		kind: asked.kind,
		caller: asked.caller,
		parent_service: parent.as_ref().map(|(service, _)| service.clone()),
		parent_id: parent.as_ref().map(|(_, id)| id.clone()),
	};
	match lock(&store).list(&filter, before.as_ref(), limit) {
		Ok(rows) => {
			response::success(StatusCode::OK, rows.into_iter().map(Listed::from).collect::<Vec<_>>())
		}
		Err(error) => {
			response::failure_with(StatusCode::INTERNAL_SERVER_ERROR, "store_unavailable", error)
		}
	}
}

#[derive(serde::Deserialize)]
struct CountsAsked {
	hours: Option<String>,
}

/// `hours` out of range is brought into it and a value that does not parse falls back to the
/// default, both per the "forgiven" rule spec/architecture/ledger.md states for `GET /tasks` and
/// extends here.
fn hours_asked(hours: Option<&str>) -> u32 {
	hours.and_then(|text| text.parse::<u32>().ok()).unwrap_or(DEFAULT_HOURS).clamp(1, MAX_HOURS)
}

/// `GET /counts`: tasks by service, hour bucket and state, for the window `hours` names. See
/// spec/architecture/ledger.md, "Counted for telemetry".
async fn counts(State(store): State<Shared>, Query(asked): Query<CountsAsked>) -> Response {
	let hours = hours_asked(asked.hours.as_deref());
	match lock(&store).counts(hours) {
		Ok(rows) => response::success(StatusCode::OK, rows),
		Err(error) => {
			response::failure_with(StatusCode::INTERNAL_SERVER_ERROR, "store_unavailable", error)
		}
	}
}

/// `POST /events`: a batch of `Item`, each a task or an event, taken in one transaction. Answers
/// how many items were taken. See spec/architecture/ledger.md, "Pushed to, never asking".
async fn events(
	State(store): State<Shared>,
	body: Result<axum::Json<Vec<Item>>, axum::extract::rejection::JsonRejection>,
) -> Response {
	let Ok(axum::Json(items)) = body else {
		return response::failure(StatusCode::BAD_REQUEST, "invalid_body");
	};
	match lock(&store).batch(items) {
		Ok(taken) => response::success(StatusCode::OK, serde_json::json!({ "taken": taken })),
		Err(error) => {
			response::failure_with(StatusCode::INTERNAL_SERVER_ERROR, "store_unavailable", error)
		}
	}
}

#[cfg(test)]
mod tests {
	use super::*;
	use crate::store::StoredTask;
	use axum::body::Body;
	use axum::http::Request;
	use http_body_util::BodyExt;
	use ledger::{Caller, Event, Level, Parent, State as TaskState, Task};
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

	async fn post_events(router: Router, items: &[Item]) -> (StatusCode, serde_json::Value) {
		let body = serde_json::to_vec(items).unwrap();
		let request = Request::post("/events")
			.header("content-type", "application/json")
			.body(Body::from(body))
			.unwrap();
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

		let stored: StoredTask = serde_json::from_value(rows[1].clone()).unwrap();
		let cursor =
			Cursor { updated_at: stored.updated_at.as_nanosecond() as i64, id: stored.task.record.id };
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

	fn event(task: &str, seq: u64) -> Event {
		Event {
			service: "shot".into(),
			task: task.into(),
			seq,
			at: "2026-09-28T12:00:01Z".parse().unwrap(),
			stage: "resolving".into(),
			level: Level::Info,
			message: "starting".into(),
			data: serde_json::Value::Null,
		}
	}

	#[tokio::test]
	async fn a_mixed_batch_is_stored_once_even_posted_twice() {
		let (_directory, store) = shared();
		let router = routes(store);
		let items = vec![
			Item::Task(record("shot", "a").into()),
			Item::Event(event("a", 1)),
			Item::Event(event("a", 2)),
		];
		let (status, body) = post_events(router.clone(), &items).await;
		assert_eq!(status, StatusCode::OK);
		assert_eq!(body["data"]["taken"], 3);
		let (status, body) = post_events(router.clone(), &items).await;
		assert_eq!(status, StatusCode::OK);
		assert_eq!(body["data"]["taken"], 3);

		let (_, body) = ask(router, "/tasks/shot/a").await;
		assert_eq!(body["data"]["events"].as_array().unwrap().len(), 2);
	}

	#[tokio::test]
	async fn events_are_answered_in_seq_order_however_they_arrived() {
		let (_directory, store) = shared();
		let router = routes(store);
		post_events(router.clone(), &[Item::Task(record("shot", "a").into())]).await;
		post_events(
			router.clone(),
			&[Item::Event(event("a", 5)), Item::Event(event("a", 1)), Item::Event(event("a", 3))],
		)
		.await;

		let (_, body) = ask(router, "/tasks/shot/a").await;
		let seqs: Vec<u64> = body["data"]["events"]
			.as_array()
			.unwrap()
			.iter()
			.map(|event| event["seq"].as_u64().unwrap())
			.collect();
		assert_eq!(seqs, vec![1, 3, 5]);
	}

	#[tokio::test]
	async fn the_task_view_carries_events_and_children() {
		let (_directory, store) = shared();
		let router = routes(store);
		post_events(router.clone(), &[Item::Task(record("shot", "parent").into())]).await;
		let child = Task {
			record: record("shot", "child"),
			parent: Some(Parent { service: "shot".into(), id: "parent".into() }),
		};
		post_events(router.clone(), &[Item::Task(child), Item::Event(event("parent", 1))]).await;

		let (_, body) = ask(router, "/tasks/shot/parent").await;
		assert_eq!(body["data"]["events"].as_array().unwrap().len(), 1);
		let children = body["data"]["children"].as_array().unwrap();
		assert_eq!(children.len(), 1);
		assert_eq!(children[0]["id"], "child");
		assert_eq!(children[0]["parent"]["id"], "parent");
	}

	#[tokio::test]
	async fn the_parent_filter_narrows_the_list() {
		let (_directory, store) = shared();
		let router = routes(store);
		post_events(router.clone(), &[Item::Task(record("shot", "parent").into())]).await;
		let child = Task {
			record: record("shot", "child"),
			parent: Some(Parent { service: "shot".into(), id: "parent".into() }),
		};
		post_events(router.clone(), &[Item::Task(child)]).await;

		let (_, body) = ask(router, "/tasks?parent=shot:parent").await;
		let rows = body["data"].as_array().unwrap();
		assert_eq!(rows.len(), 1);
		assert_eq!(rows[0]["id"], "child");
	}

	#[tokio::test]
	async fn the_upsert_rule_still_holds_through_events() {
		let (_directory, store) = shared();
		let router = routes(store);
		let mut done = record("shot", "a");
		done.state = TaskState::Done;
		done.finished_at = Some("2026-09-28T12:05:00Z".parse().unwrap());
		post_events(router.clone(), &[Item::Task(done.into())]).await;

		let mut running = record("shot", "a");
		running.state = TaskState::Running;
		running.finished_at = Some("2026-09-28T12:04:00Z".parse().unwrap());
		post_events(router.clone(), &[Item::Task(running.into())]).await;

		let (_, body) = ask(router, "/tasks/shot/a").await;
		assert_eq!(body["data"]["state"], "done");
	}

	#[tokio::test]
	async fn paging_with_the_returned_cursor_walks_every_row_once_even_tied_at_the_millisecond() {
		let (_directory, store) = shared();
		let router = routes(store.clone());
		for id in ["a", "b", "c", "d"] {
			put(router.clone(), &format!("/tasks/shot/{id}"), &record("shot", id)).await;
		}
		// `b` and `c` tie at the same millisecond, so the walk relies on the `id` tiebreaker.
		let tied = 1_700_000_000_123_000_000i64;
		lock(&store).force_updated_at("shot", "b", tied);
		lock(&store).force_updated_at("shot", "c", tied);

		let mut seen = Vec::new();
		let mut before: Option<String> = None;
		loop {
			let path = match &before {
				Some(cursor) => format!("/tasks?limit=1&before={cursor}"),
				None => "/tasks?limit=1".to_owned(),
			};
			let (_, body) = ask(router.clone(), &path).await;
			let rows = body["data"].as_array().unwrap();
			if rows.is_empty() {
				break;
			}
			seen.push(rows[0]["id"].as_str().unwrap().to_owned());
			before = Some(rows[0]["cursor"].as_str().unwrap().to_owned());
		}
		seen.sort();
		assert_eq!(seen, vec!["a", "b", "c", "d"]);
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

	/// A record asked `hours_ago` hours before now. See spec/architecture/ledger.md, "Counted for
	/// telemetry".
	fn record_asked(service: &str, id: &str, state: TaskState, hours_ago: i64) -> Record {
		let asked_at =
			jiff::Timestamp::now().checked_sub(jiff::SignedDuration::from_hours(hours_ago)).unwrap();
		Record { asked_at, state, ..record(service, id) }
	}

	#[tokio::test]
	async fn counts_buckets_by_service_hour_and_state() {
		let (_directory, store) = shared();
		let router = routes(store);
		put(router.clone(), "/tasks/shot/a", &record_asked("shot", "a", TaskState::Done, 0)).await;
		put(router.clone(), "/tasks/shot/b", &record_asked("shot", "b", TaskState::Done, 0)).await;
		put(router.clone(), "/tasks/shot/c", &record_asked("shot", "c", TaskState::Failed, 0)).await;
		put(router.clone(), "/tasks/geo/d", &record_asked("geo", "d", TaskState::Done, 0)).await;

		let (status, body) = ask(router, "/counts?hours=1").await;
		assert_eq!(status, StatusCode::OK);
		let rows = body["data"].as_array().unwrap();
		let find = |service: &str, state: &str| {
			rows.iter().find(|row| row["service"] == service && row["state"] == state).cloned()
		};
		assert_eq!(find("shot", "done").unwrap()["count"], 2);
		assert_eq!(find("shot", "failed").unwrap()["count"], 1);
		assert_eq!(find("geo", "done").unwrap()["count"], 1);
	}

	#[tokio::test]
	async fn counts_window_keeps_hours_plus_the_one_under_way() {
		let (_directory, store) = shared();
		let router = routes(store);
		put(router.clone(), "/tasks/shot/now", &record_asked("shot", "now", TaskState::Done, 0)).await;
		put(router.clone(), "/tasks/shot/one", &record_asked("shot", "one", TaskState::Done, 1)).await;
		put(router.clone(), "/tasks/shot/two", &record_asked("shot", "two", TaskState::Done, 2)).await;

		let (_, body) = ask(router.clone(), "/counts?hours=1").await;
		let total: i64 =
			body["data"].as_array().unwrap().iter().map(|row| row["count"].as_i64().unwrap()).sum();
		assert_eq!(total, 2);

		let (_, body) = ask(router, "/counts?hours=2").await;
		let total: i64 =
			body["data"].as_array().unwrap().iter().map(|row| row["count"].as_i64().unwrap()).sum();
		assert_eq!(total, 3);
	}

	#[test]
	fn counts_hours_is_clamped_and_forgiven() {
		assert_eq!(hours_asked(None), DEFAULT_HOURS);
		assert_eq!(hours_asked(Some("not a number")), DEFAULT_HOURS);
		assert_eq!(hours_asked(Some("0")), 1);
		assert_eq!(hours_asked(Some("9999")), MAX_HOURS);
		assert_eq!(hours_asked(Some("48")), 48);
	}

	#[tokio::test]
	async fn counts_is_empty_with_nothing_asked() {
		let (_directory, store) = shared();
		let router = routes(store);
		let (status, body) = ask(router, "/counts").await;
		assert_eq!(status, StatusCode::OK);
		assert_eq!(body["data"].as_array().unwrap().len(), 0);
	}
}
