//! What `shot` answers, under the scope the gateway and Caddy take off, one question a route:
//! `POST /v1/tasks` whether a capture was taken, `/v1/tasks/<id>` how it stands and all it found,
//! and `/v1/pictures/<id>.png` or `.webp` whether the picture is there, which alone is not the
//! envelope.
//! See spec/architecture/shot.md, "Asking for one".

use crate::asked::{Asked, Query, Refused};
use crate::queue::{Details, Full, Lane, View};
use crate::render::Render;
use crate::service::Shot;
use crate::store::Format;
use axum::Router;
use axum::body::Bytes;
use axum::extract::{Path, State};
use axum::http::{HeaderMap, HeaderValue, StatusCode, header};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use std::sync::Arc;
use uuid::Uuid;

/// The mark the gateway sets on everything it passes on, over whatever the caller sent. See
/// spec/architecture/services.md, "The gateway marks what it passes on".
pub const MARK: (&str, &str) = ("x-gateway", "public");

/// How long a caller may keep a picture: longer than it is kept here, which is the caller's to use.
const PICTURE_CACHE: &str = "public, max-age=900";

/// How long a caller may keep a done task. Nothing done changes, but the store may roll it out at
/// any time, so a few minutes rather than until a fixed expiry, which there is none of.
const TASK_CACHE: &str = "public, max-age=300";

/// The API at `/v1/`, where a task is a thing and starting one is a write; `/health` is host's and
/// never versioned. See spec/architecture/gateway.md, "A version is in the path, and it moves only
/// on a break", and the workspace's spec/addresses.md.
pub fn routes<R: Render>(shot: Arc<Shot<R>>) -> Router {
	let v1 = Router::new()
		.route("/tasks", post(task_post::<R>))
		.route("/tasks/{task}", get(task_get::<R>))
		.route("/pictures/{file}", get(picture::<R>));
	Router::new()
		.route("/health", get(|| async { response::success(StatusCode::OK, ()) }))
		.nest("/v1", v1)
		.fallback(|| async { settled(response::failure(StatusCode::NOT_FOUND, "no_such_route")) })
		.with_state(shot)
}

/// An answer about a capture is about this moment, and is never kept anywhere on the way.
fn settled(mut answer: Response) -> Response {
	answer.headers_mut().insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
	answer
}

fn lane(headers: &HeaderMap) -> Lane {
	let marked = headers.get(MARK.0).is_some_and(|value| value.as_bytes() == MARK.1.as_bytes());
	if marked { Lane::Public } else { Lane::Ours }
}

/// A task started, as `/v1/` has it: the one way to start one, since a `GET` changes nothing.
async fn task_post<R: Render>(
	State(shot): State<Arc<Shot<R>>>,
	headers: HeaderMap,
	body: Bytes,
) -> Response {
	match serde_json::from_slice::<crate::asked::Body>(&body) {
		Ok(body) => capture(&shot, &headers, Ok(Query::from_body(body))),
		Err(error) => settled(response::failure_with(StatusCode::BAD_REQUEST, "invalid_body", error)),
	}
}

fn refused(reason: Refused) -> Response {
	let code = match reason {
		Refused::Url => "invalid_url",
		Refused::Viewport => "invalid_viewport",
		Refused::Timing => "invalid_timing",
	};
	settled(response::failure(StatusCode::BAD_REQUEST, code))
}

fn capture<R: Render>(
	shot: &Shot<R>,
	headers: &HeaderMap,
	query: Result<Query, Refused>,
) -> Response {
	let lane = lane(headers);
	let public = lane == Lane::Public;
	let query = match query {
		Ok(query) => query,
		Err(reason) => return refused(reason),
	};
	let asked = match Asked::read(&query, public) {
		Ok(asked) => asked,
		Err(reason) => return refused(reason),
	};
	let fresh = crate::asked::fresh(&query, public);
	match shot.ask(asked, lane, fresh) {
		Err(Full) => {
			let mut answer = response::failure(StatusCode::SERVICE_UNAVAILABLE, "queue_unavailable");
			answer.headers_mut().insert(header::RETRY_AFTER, HeaderValue::from_static("30"));
			settled(answer)
		}
		Ok(id) => taken(id, shot.about(id)),
	}
}

/// That a capture was taken, and where to ask after it: its state and nothing it found, which is
/// the task's to tell. `Location` is relative, since this service does not know the scope it is
/// reached under: `tasks/<id>` beside `/v1/tasks`. See
/// spec/architecture/shot.md, "A picture is named by its whole public address".
fn taken(id: Uuid, known: Option<(View, Details)>) -> Response {
	let (state, retry_after) = match known.map(|(view, _)| view) {
		Some(View::Waiting { rendering, retry_after }) => {
			(if rendering { "rendering" } else { "queued" }, retry_after)
		}
		Some(View::Done { .. }) => ("done", 0),
		// Asking again queues a failed capture afresh, so none is failed here; said all the same.
		Some(View::Failed { .. }) | None => ("failed", 0),
	};
	let body = serde_json::json!({ "id": id, "state": state, "retry_after": retry_after });
	let mut answer = response::success(StatusCode::ACCEPTED, body);
	let headers = answer.headers_mut();
	if retry_after > 0 {
		headers.insert(header::RETRY_AFTER, HeaderValue::from(retry_after));
	}
	if let Ok(location) = HeaderValue::from_str(&format!("tasks/{id}")) {
		headers.insert(header::LOCATION, location);
	}
	settled(answer)
}

/// How a capture stands: `202` while it waits or renders, `200` with all it found once done, which
/// may be kept a while. Answered from memory while the queue remembers the capture, and from its
/// record on disk after, until the store rolls it out. A path that names no id is `no_such_task`,
/// as an id never made is; a query is ignored.
async fn task_get<R: Render>(
	State(shot): State<Arc<Shot<R>>>,
	Path(task): Path<String>,
) -> Response {
	task_of(&shot, &task).await
}

async fn task_of<R: Render>(shot: &Shot<R>, task: &str) -> Response {
	let Ok(id) = Uuid::parse_str(task) else {
		return settled(response::failure(StatusCode::NOT_FOUND, "no_such_task"));
	};
	if let Some((view, details)) = shot.about(id) {
		return match view {
			View::Waiting { rendering, retry_after } => {
				let state = if rendering { "rendering" } else { "queued" };
				let body = serde_json::json!({ "id": id, "state": state, "retry_after": retry_after });
				let mut answer = response::success(StatusCode::ACCEPTED, body);
				answer.headers_mut().insert(header::RETRY_AFTER, HeaderValue::from(retry_after));
				settled(answer)
			}
			View::Done { made } => done(crate::record::done(id, &made, &details)),
			View::Failed { reason } => failed(&reason),
		};
	}
	match shot.store.read_record(id).await {
		Some(record) if record["state"] == "done" => done(record),
		Some(record) => failed(record["reason"].as_str().unwrap_or_default()),
		None => settled(response::failure(StatusCode::NOT_FOUND, "no_such_task")),
	}
}

fn done(record: serde_json::Value) -> Response {
	let mut answer = response::success(StatusCode::OK, record);
	answer.headers_mut().insert(header::CACHE_CONTROL, HeaderValue::from_static(TASK_CACHE));
	answer
}

fn failed(reason: &str) -> Response {
	settled(response::failure_with(StatusCode::BAD_GATEWAY, "page_unavailable", reason))
}

/// The picture, or that there is none: waiting, failed and forgotten are the task's to tell apart.
async fn picture<R: Render>(
	State(shot): State<Arc<Shot<R>>>,
	Path(file): Path<String>,
) -> Response {
	let found = file.rsplit_once('.').and_then(|(name, extension)| {
		Some((Uuid::parse_str(name).ok()?, Format::from_extension(extension)?))
	});
	let bytes = match found {
		Some((id, format)) => shot.store.read(id, format).await.map(|bytes| (format, bytes)),
		None => None,
	};
	match bytes {
		Some((format, bytes)) => {
			([(header::CONTENT_TYPE, format.media_type()), (header::CACHE_CONTROL, PICTURE_CACHE)], bytes)
				.into_response()
		}
		None => settled(response::failure(StatusCode::NOT_FOUND, "no_such_picture")),
	}
}

#[cfg(test)]
mod tests {
	use super::*;
	use crate::render::Capture;
	use crate::store::{CAPACITY, Store};
	use axum::body::Body;
	use axum::http::Request;
	use http_body_util::BodyExt;
	use std::time::Instant;
	use tower::ServiceExt;

	/// Captures without a browser: a failure for any page on `broken.test`, a WebP for any other
	/// unless it asks for the whole page.
	struct Fake;

	impl Render for Fake {
		async fn capture(
			&self,
			asked: &Asked,
			_: &dyn crate::render::Events,
		) -> Result<Capture, String> {
			if asked.url.host_str() == Some("broken.test") {
				return Err("net::ERR_NAME_NOT_RESOLVED".into());
			}
			let webp = (!asked.full).then(|| b"webp".to_vec());
			let observed = serde_json::json!({ "page": { "title": "Fake" } });
			Ok(Capture { png: b"png".to_vec(), webp, width: asked.width, height: asked.height, observed })
		}
	}

	struct Answer {
		status: StatusCode,
		headers: HeaderMap,
		body: Vec<u8>,
	}

	impl Answer {
		fn json(&self) -> serde_json::Value {
			serde_json::from_slice(&self.body).unwrap()
		}
	}

	async fn ask(router: &Router, path: &str, public: bool) -> Answer {
		let mut request = Request::get(path);
		if public {
			request = request.header(MARK.0, MARK.1);
		}
		let answer = router.clone().oneshot(request.body(Body::empty()).unwrap()).await.unwrap();
		let (parts, body) = answer.into_parts();
		Answer {
			status: parts.status,
			headers: parts.headers,
			body: body.collect().await.unwrap().to_bytes().to_vec(),
		}
	}

	/// What a capture asks, written as the pairs a query would carry, as the JSON `/v1/tasks` takes:
	/// the tests read as the cases they were, and every one starts a task the one way there is.
	fn body_of(pairs: &str) -> String {
		let mut body = serde_json::json!({});
		for (name, value) in url::form_urlencoded::parse(pairs.as_bytes()) {
			let number = || match value.parse::<i64>() {
				Ok(whole) => serde_json::Value::from(whole),
				Err(_) => value.parse::<f64>().map(serde_json::Value::from).unwrap_or(value.clone().into()),
			};
			let flag = || serde_json::Value::Bool(value == "true");
			let (group, field, written) = match name.as_ref() {
				"scheme" | "host" | "path" | "hash" => ("target", name.to_string(), value.clone().into()),
				"port" => ("target", "port".into(), number()),
				"width" | "height" => ("viewport", name.to_string(), number()),
				"full" => ("viewport", "full".into(), flag()),
				"delay" | "timeout" => ("timing", name.to_string(), number()),
				"fresh" | "internal" | "insecure" => ("access", name.to_string(), flag()),
				"javascript" => ("browser", "javascript".into(), flag()),
				query if query.starts_with("query.") => {
					let key = query.trim_start_matches("query.").to_owned();
					let values = &mut body["target"]["query"][&key];
					if !values.is_array() {
						*values = serde_json::json!([]);
					}
					values.as_array_mut().unwrap().push(value.clone().into());
					continue;
				}
				other => ("target", other.to_owned(), value.clone().into()),
			};
			body[group][field] = written;
		}
		body.to_string()
	}

	/// A task started as `/v1/tasks` starts one, from the pairs a query would have carried.
	async fn start(router: &Router, pairs: &str, public: bool) -> Answer {
		let mut request = Request::post("/v1/tasks").header(header::CONTENT_TYPE, "application/json");
		if public {
			request = request.header(MARK.0, MARK.1);
		}
		let request = request.body(Body::from(body_of(pairs))).unwrap();
		let answer = router.clone().oneshot(request).await.unwrap();
		let (parts, body) = answer.into_parts();
		Answer {
			status: parts.status,
			headers: parts.headers,
			body: body.collect().await.unwrap().to_bytes().to_vec(),
		}
	}

	fn service() -> (tempfile::TempDir, Arc<Shot<Fake>>, Router) {
		let root = tempfile::tempdir().unwrap();
		let (shot, router) = over(root.path(), CAPACITY);
		(root, shot, router)
	}

	/// The service over a directory, as it starts: a fresh queue over whatever the store keeps.
	fn over(root: &std::path::Path, capacity: u64) -> (Arc<Shot<Fake>>, Router) {
		let shot = Shot::new(Store::open(root, capacity).unwrap(), Fake, None);
		let router = routes(shot.clone());
		(shot, router)
	}

	async fn capture(router: &Router, pairs: &str) -> String {
		start(router, pairs, false).await.json()["data"]["id"].as_str().unwrap().to_owned()
	}

	/// Render whatever is queued, as the background renderers would.
	async fn drain(shot: &Shot<Fake>) {
		loop {
			let next = shot.queue().take();
			let Some((id, asked)) = next else { break };
			shot.render_one(id, &asked).await;
		}
	}

	#[tokio::test]
	async fn answers_at_once_then_serves_both_pictures() {
		let (_root, shot, router) = service();
		let first = start(&router, "host=example.test&width=390", false).await;
		assert_eq!(first.status, StatusCode::ACCEPTED);
		let body = first.json();
		assert_eq!(body["data"]["state"], "queued");
		let id = body["data"]["id"].as_str().unwrap().to_owned();
		assert_eq!(first.headers[header::LOCATION], format!("tasks/{id}"));
		// The id is said once; where to ask is the header's.
		assert!(body["data"].get("task").is_none());
		assert_eq!(first.headers[header::RETRY_AFTER], "5");
		assert_eq!(first.headers[header::CACHE_CONTROL], "no-store");
		// Taking it tells nothing of what it will find.
		assert!(body["data"].get("request").is_none() && body["data"].get("page").is_none());
		// Waiting: the task says so, and the picture is simply not there.
		let waiting = ask(&router, &format!("/v1/tasks/{id}"), true).await;
		assert_eq!(waiting.status, StatusCode::ACCEPTED);
		assert_eq!(waiting.json()["data"]["state"], "queued");
		assert_eq!(waiting.headers[header::CACHE_CONTROL], "no-store");
		let early = ask(&router, &format!("/v1/pictures/{id}.png"), true).await;
		assert_eq!(
			(early.status, early.json()["code"].clone()),
			(StatusCode::NOT_FOUND, "no_such_picture".into())
		);
		assert_eq!(early.headers[header::CACHE_CONTROL], "no-store");
		// Asked again before it is done: the same capture.
		let again = start(&router, "host=example.test&width=390", true).await;
		assert_eq!(again.json()["data"]["id"], id.as_str());

		drain(&shot).await;
		let done = ask(&router, &format!("/v1/tasks/{id}"), true).await;
		assert_eq!(done.status, StatusCode::OK);
		assert_eq!(
			done.json()["data"]["png"],
			format!("{}/pictures/{id}.png", monoflake::INTERNAL_SHOT)
		);
		assert_eq!(
			done.json()["data"]["webp"],
			format!("{}/pictures/{id}.webp", monoflake::INTERNAL_SHOT)
		);
		assert_eq!(done.headers[header::CACHE_CONTROL], TASK_CACHE);
		let data = done.json()["data"].clone();
		assert_eq!(data["pictures"]["width"], 390);
		assert_eq!(data["pictures"]["png_bytes"], 3);
		assert_eq!(data["request"]["url"], "https://example.test/");
		assert_eq!(data["request"]["delay"], 0.21);
		assert!(data["task"]["rendered_ms"].is_i64() && data["task"].get("expires_at").is_none());
		assert_eq!(data["page"]["title"], "Fake");
		for (extension, media) in [("png", "image/png"), ("webp", "image/webp")] {
			let picture = ask(&router, &format!("/v1/pictures/{id}.{extension}"), true).await;
			assert_eq!(picture.status, StatusCode::OK);
			assert_eq!(picture.headers[header::CONTENT_TYPE], media);
			assert_eq!(picture.headers[header::CACHE_CONTROL], PICTURE_CACHE);
			assert_eq!(picture.body, extension.as_bytes());
		}
		// Done, asking again says so, and still only where to look.
		let cached = start(&router, "host=example.test&width=390", false).await;
		let data = cached.json()["data"].clone();
		assert_eq!((cached.status, data["id"].clone()), (StatusCode::ACCEPTED, id.clone().into()));
		assert_eq!((data["state"].clone(), data["retry_after"].clone()), ("done".into(), 0.into()));
		assert!(cached.headers.get(header::RETRY_AFTER).is_none() && data.get("png").is_none());
	}

	#[tokio::test]
	async fn fresh_captures_anew_and_only_ours_may_ask_it() {
		let (_root, shot, router) = service();
		let old = capture(&router, "host=example.test").await;
		drain(&shot).await;

		// The public may not ask fresh: ignored, so the kept capture answers as it would anyway.
		let public = start(&router, "host=example.test&fresh=true", true).await;
		assert_eq!(public.json()["data"]["id"], old);

		// Ours does: a new id, queued rather than the kept capture.
		let fresh = start(&router, "host=example.test&fresh=true", false).await;
		let new_id = fresh.json()["data"]["id"].as_str().unwrap().to_owned();
		assert_ne!(new_id, old);
		assert_eq!(fresh.json()["data"]["state"], "queued");

		// The next plain ask of the same parameters, from anyone, is answered with the fresh id.
		assert_eq!(start(&router, "host=example.test", true).await.json()["data"]["id"], new_id);

		drain(&shot).await;
		// The one fresh passed over stays readable by its own id.
		let kept = ask(&router, &format!("/v1/tasks/{old}"), false).await;
		assert_eq!(kept.status, StatusCode::OK);
		assert_eq!(kept.json()["data"]["request"]["fresh"], false);
		let made = ask(&router, &format!("/v1/tasks/{new_id}"), false).await;
		assert_eq!(made.json()["data"]["request"]["fresh"], true);
	}

	#[tokio::test]
	async fn a_whole_page_may_have_no_webp() {
		let (_root, shot, router) = service();
		let id = start(&router, "host=tall.test&full=true", false).await.json()["data"]["id"]
			.as_str()
			.unwrap()
			.to_owned();
		drain(&shot).await;
		assert_eq!(
			ask(&router, &format!("/v1/tasks/{id}"), false).await.json()["data"]["webp"],
			serde_json::Value::Null
		);
		assert_eq!(
			ask(&router, &format!("/v1/pictures/{id}.webp"), false).await.status,
			StatusCode::NOT_FOUND
		);
	}

	#[tokio::test]
	async fn says_why_a_capture_failed_after_memory_forgets_it() {
		let (_root, shot, router) = service();
		let id = start(&router, "host=broken.test", false).await.json()["data"]["id"]
			.as_str()
			.unwrap()
			.to_owned();
		drain(&shot).await;
		let failed = ask(&router, &format!("/v1/tasks/{id}"), false).await;
		assert_eq!(failed.status, StatusCode::BAD_GATEWAY);
		assert_eq!(failed.json()["code"], "page_unavailable");
		assert_eq!(failed.json()["message"], "net::ERR_NAME_NOT_RESOLVED");
		assert_eq!(
			ask(&router, &format!("/v1/pictures/{id}.png"), false).await.status,
			StatusCode::NOT_FOUND
		);
		shot.queue().sweep(Instant::now() + crate::queue::WINDOW);
		assert!(shot.view(id.parse().unwrap()).is_none());
		let kept = ask(&router, &format!("/v1/tasks/{id}"), false).await;
		assert_eq!(kept.status, StatusCode::BAD_GATEWAY);
		assert_eq!(kept.json()["message"], "net::ERR_NAME_NOT_RESOLVED");
		assert_eq!(kept.headers[header::CACHE_CONTROL], "no-store");
		// Its window past, the same ask is a capture of its own.
		assert_ne!(capture(&router, "host=broken.test").await, id);
	}

	#[tokio::test]
	async fn answers_from_disk_after_a_restart() {
		let (root, shot, router) = service();
		let id = capture(&router, "host=example.test").await;
		let broken = capture(&router, "host=broken.test").await;
		drain(&shot).await;
		let before = ask(&router, &format!("/v1/tasks/{id}"), false).await.json();
		drop((shot, router));

		let (_shot, router) = over(root.path(), CAPACITY);
		let after = ask(&router, &format!("/v1/tasks/{id}"), false).await;
		assert_eq!(after.status, StatusCode::OK);
		assert_eq!(after.headers[header::CACHE_CONTROL], TASK_CACHE);
		assert_eq!(after.json(), before);
		assert_eq!(ask(&router, &format!("/v1/pictures/{id}.webp"), false).await.body, b"webp");
		let failed = ask(&router, &format!("/v1/tasks/{broken}"), false).await;
		assert_eq!(failed.status, StatusCode::BAD_GATEWAY);
		assert_eq!(failed.json()["message"], "net::ERR_NAME_NOT_RESOLVED");
		// Remembered by nobody now, the same ask is captured afresh.
		assert_ne!(capture(&router, "host=example.test").await, id);
	}

	#[tokio::test]
	async fn rolls_out_the_oldest_capture_past_its_capacity() {
		// One capture's size, measured, sets a store with room for one and a half.
		let (root, shot, router) = service();
		capture(&router, "host=a.test").await;
		drain(&shot).await;
		let one = shot.store.bytes();
		drop(root);
		let root = tempfile::tempdir().unwrap();
		let (shot, router) = over(root.path(), one + one / 2);

		let first = capture(&router, "host=a.test").await;
		drain(&shot).await;
		let second = capture(&router, "host=b.test").await;
		drain(&shot).await;
		for path in [format!("/v1/tasks/{first}"), format!("/v1/pictures/{first}.png")] {
			assert_eq!(ask(&router, &path, false).await.status, StatusCode::NOT_FOUND, "{path}");
		}
		assert_eq!(
			ask(&router, &format!("/v1/tasks/{first}"), false).await.json()["code"],
			"no_such_task"
		);
		assert_eq!(ask(&router, &format!("/v1/tasks/{second}"), false).await.status, StatusCode::OK);
		assert!(shot.store.bytes() <= one + one / 2);
		// Rolled out, it is forgotten by the queue as well, and asked again is a new capture.
		assert_ne!(capture(&router, "host=a.test").await, first);
	}

	#[tokio::test]
	async fn refuses_what_it_cannot_read_or_find() {
		let (_root, _shot, router) = service();
		for (pairs, code) in [
			("", "invalid_url"),
			("scheme=file&host=x.test", "invalid_url"),
			("host=a.test&width=10", "invalid_viewport"),
			("host=a.test&delay=11", "invalid_timing"),
		] {
			let answer = start(&router, pairs, false).await;
			assert_eq!(answer.json()["code"], code, "{pairs}");
			assert_eq!(answer.headers[header::CACHE_CONTROL], "no-store", "{pairs}");
		}
		let cases = [
			("/v1/tasks/not-an-id", "no_such_task"),
			("/v1/tasks/00000000-0000-0000-0000-000000000000", "no_such_task"),
			("/v1/pictures/not-an-id.png", "no_such_picture"),
			("/v1/pictures/00000000-0000-0000-0000-000000000000", "no_such_picture"),
			("/v1/pictures/00000000-0000-0000-0000-000000000000.gif", "no_such_picture"),
			("/v1/pictures/00000000-0000-0000-0000-000000000000.png", "no_such_picture"),
			("/00000000-0000-0000-0000-000000000000", "no_such_route"),
		];
		for (path, code) in cases {
			let answer = ask(&router, path, false).await;
			assert_eq!(answer.json()["code"], code, "{path}");
			assert_eq!(answer.headers[header::CACHE_CONTROL], "no-store", "{path}");
		}
	}

	#[tokio::test]
	async fn a_full_public_queue_refuses_the_public_and_not_us() {
		let (_root, _shot, router) = service();
		for n in 0..Lane::Public.capacity() {
			let answer = start(&router, &format!("host=p{n}.test"), true).await;
			assert_eq!(answer.status, StatusCode::ACCEPTED);
		}
		let refused = start(&router, "host=late.test", true).await;
		assert_eq!(refused.status, StatusCode::SERVICE_UNAVAILABLE);
		assert_eq!(refused.json()["code"], "queue_unavailable");
		assert_eq!(refused.headers[header::RETRY_AFTER], "30");
		let ours = start(&router, "host=late.test", false).await;
		assert_eq!(ours.status, StatusCode::ACCEPTED);
	}

	async fn post(router: &Router, body: &str) -> Answer {
		post_to(router, "/v1/tasks", body).await
	}

	async fn post_to(router: &Router, path: &str, body: &str) -> Answer {
		let request = Request::post(path)
			.header(header::CONTENT_TYPE, "application/json")
			.body(Body::from(body.to_owned()))
			.unwrap();
		let answer = router.clone().oneshot(request).await.unwrap();
		let (parts, body) = answer.into_parts();
		let body = body.collect().await.unwrap().to_bytes().to_vec();
		Answer { status: parts.status, headers: parts.headers, body }
	}

	#[tokio::test]
	async fn pairs_and_json_ask_the_same() {
		let (_root, shot, router) = service();
		let got =
			start(&router, "host=x.test&path=docs&query.tag=a&query.tag=b&width=390", false).await;
		let posted = post(
			&router,
			r#"{"target":{"host":"x.test","path":"docs","query":{"tag":["a","b"]}},"viewport":{"width":390}}"#,
		)
		.await;
		assert_eq!(posted.status, StatusCode::ACCEPTED);
		assert_eq!(posted.json()["data"]["id"], got.json()["data"]["id"]);
		drain(&shot).await;
		let id = posted.json()["data"]["id"].as_str().unwrap().to_owned();
		let task = ask(&router, &format!("/v1/tasks/{id}"), false).await.json();
		assert_eq!(task["data"]["request"]["url"], "https://x.test/docs?tag=a&tag=b");
		for broken in ["not json", r#"{"url":"https://x.test"}"#, r#"{"viewport":{"width":"wide"}}"#] {
			let answer = post(&router, broken).await;
			assert_eq!(
				(answer.status, answer.json()["code"].clone()),
				(StatusCode::BAD_REQUEST, "invalid_body".into()),
				"{broken}"
			);
		}
	}

	#[tokio::test]
	async fn v1_starts_a_task_by_post_and_names_it_in_the_path() {
		let (_root, shot, router) = service();
		let body = r#"{"target":{"host":"x.test","path":"docs"}}"#;
		let started = post_to(&router, "/v1/tasks", body).await;
		assert_eq!(started.status, StatusCode::ACCEPTED);
		let id = started.json()["data"]["id"].as_str().unwrap().to_owned();
		assert_eq!(started.headers[header::LOCATION], format!("tasks/{id}").as_str());
		drain(&shot).await;
		let task = ask(&router, &format!("/v1/tasks/{id}"), false).await;
		assert_eq!(task.status, StatusCode::OK);
		assert_eq!(ask(&router, "/v1/tasks/not-an-id", false).await.json()["code"], "no_such_task");
		let old =
			["/capture?host=x.test", &format!("/status?task={id}"), &format!("/pictures/{id}.png")];
		for old in old {
			assert_eq!(ask(&router, old, false).await.status, StatusCode::NOT_FOUND, "{old}");
		}
		assert_eq!(ask(&router, "/v1/tasks", false).await.status, StatusCode::METHOD_NOT_ALLOWED);
	}

	#[tokio::test]
	async fn a_post_asks_fresh_as_access_fresh() {
		let (_root, shot, router) = service();
		let old = capture(&router, "host=example.test").await;
		drain(&shot).await;
		let posted =
			post(&router, r#"{"target":{"host":"example.test"},"access":{"fresh":true}}"#).await;
		let new_id = posted.json()["data"]["id"].as_str().unwrap().to_owned();
		assert_ne!(new_id, old);
		assert_eq!(capture(&router, "host=example.test").await, new_id);
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
