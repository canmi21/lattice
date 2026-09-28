//! What `shot` answers, under the scope the gateway and Caddy take off: `/capture` to ask, `/<id>`
//! to ask after one, `/<id>.png` and `/<id>.webp` for the picture, which alone is not the envelope.
//! See spec/architecture/shot.md, "Asking for one".

use crate::asked::{Asked, Query, Refused};
use crate::queue::{Full, Lane, View};
use crate::render::Render;
use crate::service::Shot;
use crate::store::Format;
use axum::Router;
use axum::extract::{Path, Query as Read, State};
use axum::http::{HeaderMap, HeaderValue, StatusCode, header};
use axum::response::{IntoResponse, Response};
use axum::routing::get;
use std::sync::Arc;
use uuid::Uuid;

/// The mark the gateway sets on everything it passes on, over whatever the caller sent. See
/// spec/architecture/services.md, "The gateway marks what it passes on".
pub const MARK: (&str, &str) = ("x-gateway", "public");

/// How long a caller may keep a picture: longer than it is kept here, which is the caller's to use.
const PICTURE_CACHE: &str = "public, max-age=900";

pub fn routes<R: Render>(shot: Arc<Shot<R>>) -> Router {
	Router::new()
		.route("/health", get(|| async { response::success(StatusCode::OK, ()) }))
		.route("/capture", get(capture::<R>))
		.route("/{file}", get(file::<R>))
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

async fn capture<R: Render>(
	State(shot): State<Arc<Shot<R>>>,
	headers: HeaderMap,
	Read(query): Read<Query>,
) -> Response {
	let lane = lane(&headers);
	let asked = match Asked::read(&query, lane == Lane::Public) {
		Ok(asked) => asked,
		Err(Refused::Url) => return settled(response::failure(StatusCode::BAD_REQUEST, "invalid_url")),
		Err(Refused::Viewport) => {
			return settled(response::failure(StatusCode::BAD_REQUEST, "invalid_viewport"));
		}
		Err(Refused::Timing) => {
			return settled(response::failure(StatusCode::BAD_REQUEST, "invalid_timing"));
		}
	};
	let asked = shot.queue().ask(asked, lane);
	match asked {
		Err(Full) => {
			let mut answer = response::failure(StatusCode::SERVICE_UNAVAILABLE, "queue_unavailable");
			answer.headers_mut().insert(header::RETRY_AFTER, HeaderValue::from_static("30"));
			settled(answer)
		}
		Ok(id) => {
			shot.wake();
			about(id, shot.view(id))
		}
	}
}

/// What a capture is now, in the envelope. Addresses in it are relative, since this service does
/// not know the scope it is reached under: `<id>` beside `capture`, `<id>.png` beside `<id>`.
fn about(id: Uuid, view: Option<View>) -> Response {
	let answer = match view {
		None => response::failure(StatusCode::NOT_FOUND, "no_such_shot"),
		Some(View::Waiting { rendering, retry_after }) => {
			let state = if rendering { "rendering" } else { "queued" };
			let body = serde_json::json!({ "id": id, "state": state, "retry_after": retry_after });
			let mut answer = response::success(StatusCode::ACCEPTED, body);
			let headers = answer.headers_mut();
			headers.insert(header::RETRY_AFTER, HeaderValue::from(retry_after));
			if let Ok(location) = HeaderValue::from_str(&id.to_string()) {
				headers.insert(header::LOCATION, location);
			}
			answer
		}
		Some(View::Done { webp }) => response::success(
			StatusCode::OK,
			serde_json::json!({
				"id": id,
				"state": "done",
				"png": format!("{id}.png"),
				"webp": webp.then(|| format!("{id}.webp")),
			}),
		),
		Some(View::Failed { reason }) => {
			response::failure_with(StatusCode::BAD_GATEWAY, "page_unavailable", reason)
		}
	};
	settled(answer)
}

/// `/<id>` for how a capture stands, `/<id>.png` or `/<id>.webp` for the picture.
async fn file<R: Render>(State(shot): State<Arc<Shot<R>>>, Path(file): Path<String>) -> Response {
	let (name, format) = match file.rsplit_once('.') {
		Some((name, extension)) => match Format::from_extension(extension) {
			Some(format) => (name, Some(format)),
			None => return about(Uuid::nil(), None),
		},
		None => (file.as_str(), None),
	};
	let Ok(id) = Uuid::parse_str(name) else { return about(Uuid::nil(), None) };
	let Some(format) = format else { return about(id, shot.view(id)) };
	match shot.store.read(id, format).await {
		Some(bytes) => {
			([(header::CONTENT_TYPE, format.media_type()), (header::CACHE_CONTROL, PICTURE_CACHE)], bytes)
				.into_response()
		}
		None => about(id, None),
	}
}

#[cfg(test)]
mod tests {
	use super::*;
	use crate::render::Capture;
	use crate::store::Store;
	use axum::body::Body;
	use axum::http::Request;
	use http_body_util::BodyExt;
	use std::time::Instant;
	use tower::ServiceExt;

	/// Captures without a browser: a failure for any page on `broken.test`, a WebP for any other
	/// unless it asks for the whole page.
	struct Fake;

	impl Render for Fake {
		async fn capture(&self, asked: &Asked) -> Result<Capture, String> {
			if asked.url.host_str() == Some("broken.test") {
				return Err("net::ERR_NAME_NOT_RESOLVED".into());
			}
			Ok(Capture { png: b"png".to_vec(), webp: (!asked.full).then(|| b"webp".to_vec()) })
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

	fn service() -> (tempfile::TempDir, Arc<Shot<Fake>>, Router) {
		let root = tempfile::tempdir().unwrap();
		let shot = Shot::new(Store::open(root.path()).unwrap(), Fake);
		let router = routes(shot.clone());
		(root, shot, router)
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
		let first = ask(&router, "/capture?host=example.test&width=390", false).await;
		assert_eq!(first.status, StatusCode::ACCEPTED);
		let body = first.json();
		assert_eq!(body["data"]["state"], "queued");
		let id = body["data"]["id"].as_str().unwrap().to_owned();
		assert_eq!(first.headers[header::LOCATION], id.as_str());
		assert_eq!(first.headers[header::RETRY_AFTER], "5");
		assert_eq!(first.headers[header::CACHE_CONTROL], "no-store");
		// Asked again before it is done: the same capture.
		let again = ask(&router, "/capture?host=example.test&width=390", true).await;
		assert_eq!(again.json()["data"]["id"], id.as_str());

		drain(&shot).await;
		let done = ask(&router, &format!("/{id}"), true).await;
		assert_eq!(done.status, StatusCode::OK);
		assert_eq!(done.json()["data"]["png"], format!("{id}.png"));
		assert_eq!(done.json()["data"]["webp"], format!("{id}.webp"));
		for (extension, media) in [("png", "image/png"), ("webp", "image/webp")] {
			let picture = ask(&router, &format!("/{id}.{extension}"), true).await;
			assert_eq!(picture.status, StatusCode::OK);
			assert_eq!(picture.headers[header::CONTENT_TYPE], media);
			assert_eq!(picture.headers[header::CACHE_CONTROL], PICTURE_CACHE);
			assert_eq!(picture.body, extension.as_bytes());
		}
		// Done, asking again answers with it straight away.
		let cached = ask(&router, "/capture?host=example.test&width=390", false).await;
		assert_eq!(
			(cached.status, cached.json()["data"]["id"].clone()),
			(StatusCode::OK, id.clone().into())
		);
	}

	#[tokio::test]
	async fn a_whole_page_may_have_no_webp() {
		let (_root, shot, router) = service();
		let id = ask(&router, "/capture?host=tall.test&full=true", false).await.json()["data"]["id"]
			.as_str()
			.unwrap()
			.to_owned();
		drain(&shot).await;
		assert_eq!(
			ask(&router, &format!("/{id}"), false).await.json()["data"]["webp"],
			serde_json::Value::Null
		);
		assert_eq!(ask(&router, &format!("/{id}.webp"), false).await.status, StatusCode::NOT_FOUND);
	}

	#[tokio::test]
	async fn says_why_a_capture_failed_and_forgets_it_after_five_minutes() {
		let (_root, shot, router) = service();
		let id = ask(&router, "/capture?host=broken.test", false).await.json()["data"]["id"]
			.as_str()
			.unwrap()
			.to_owned();
		drain(&shot).await;
		let failed = ask(&router, &format!("/{id}"), false).await;
		assert_eq!(failed.status, StatusCode::BAD_GATEWAY);
		assert_eq!(failed.json()["code"], "page_unavailable");
		assert_eq!(failed.json()["message"], "net::ERR_NAME_NOT_RESOLVED");

		shot.sweep(Instant::now() + crate::queue::KEPT).await;
		let gone = ask(&router, &format!("/{id}"), false).await;
		assert_eq!(
			(gone.status, gone.json()["code"].clone()),
			(StatusCode::NOT_FOUND, "no_such_shot".into())
		);
	}

	#[tokio::test]
	async fn refuses_what_it_cannot_read_or_find() {
		let (_root, _shot, router) = service();
		let cases = [
			("/capture", "invalid_url"),
			("/capture?scheme=file&host=x.test", "invalid_url"),
			("/capture?host=a.test&width=10", "invalid_viewport"),
			("/capture?host=a.test&delay=11", "invalid_timing"),
			("/not-an-id", "no_such_shot"),
			("/not-an-id.png", "no_such_shot"),
			("/00000000-0000-0000-0000-000000000000.gif", "no_such_shot"),
			("/00000000-0000-0000-0000-000000000000.png", "no_such_shot"),
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
			let answer = ask(&router, &format!("/capture?host=p{n}.test"), true).await;
			assert_eq!(answer.status, StatusCode::ACCEPTED);
		}
		let refused = ask(&router, "/capture?host=late.test", true).await;
		assert_eq!(refused.status, StatusCode::SERVICE_UNAVAILABLE);
		assert_eq!(refused.json()["code"], "queue_unavailable");
		assert_eq!(refused.headers[header::RETRY_AFTER], "30");
		let ours = ask(&router, "/capture?host=late.test", false).await;
		assert_eq!(ours.status, StatusCode::ACCEPTED);
	}

	#[test]
	fn every_code_it_answers_with_is_in_the_catalogue() {
		for code in response::codes_named(include_str!("api.rs")) {
			assert!(response::message_of(code).is_some(), "`{code}` is not in libs/response/codes.json");
		}
	}
}
