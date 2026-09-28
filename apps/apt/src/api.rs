//! What `cron` asks, over a Unix socket in this service's own directory: no port, no network. See
//! spec/architecture/apt.md, "The door".

use crate::bus::{Bus, Properties, UNIT_UPDATE, UNIT_UPGRADE};
use crate::run::{self, JOB_UPDATE, JOB_UPGRADE};
use axum::Router;
use axum::extract::State;
use axum::http::{HeaderMap, StatusCode};
use axum::response::Response;
use axum::routing::{get, post};
use std::sync::Arc;

/// The socket's name in this service's directory, which host mounts into `cron` for it. See
/// spec/architecture/cron.md, "host gives `cron` the table".
pub const SOCKET: &str = "apt.sock";

#[derive(Clone)]
pub struct AppState {
	pub bus: Arc<dyn Bus>,
	/// None in a test that does not care what is told.
	pub ledger: Option<ledger::Ledger>,
}

pub fn routes(state: AppState) -> Router {
	Router::new()
		.route("/health", get(health))
		.route("/status", get(status))
		.route("/jobs/update", post(job_update))
		.route("/jobs/upgrade", post(job_upgrade))
		.fallback(|| async { response::failure(StatusCode::NOT_FOUND, "no_such_route") })
		.with_state(state)
}

/// Success once systemd answers at all -- read through `UNIT_UPDATE`, though which unit is asked
/// about does not matter here.
async fn health(State(state): State<AppState>) -> Response {
	match state.bus.properties(UNIT_UPDATE).await {
		Ok(_) => response::success(StatusCode::OK, ()),
		Err(_) => response::failure(StatusCode::SERVICE_UNAVAILABLE, "service_unavailable"),
	}
}

async fn status(State(state): State<AppState>) -> Response {
	let update = state.bus.properties(UNIT_UPDATE).await;
	let upgrade = state.bus.properties(UNIT_UPGRADE).await;
	match (update, upgrade) {
		(Ok(update), Ok(upgrade)) => response::success(
			StatusCode::OK,
			serde_json::json!({
				JOB_UPDATE: job_view(UNIT_UPDATE, &update),
				JOB_UPGRADE: job_view(UNIT_UPGRADE, &upgrade),
			}),
		),
		_ => response::failure(StatusCode::SERVICE_UNAVAILABLE, "service_unavailable"),
	}
}

async fn job_update(State(state): State<AppState>, headers: HeaderMap) -> Response {
	start_job(&state, JOB_UPDATE, UNIT_UPDATE, parent_header(&headers)).await
}

async fn job_upgrade(State(state): State<AppState>, headers: HeaderMap) -> Response {
	start_job(&state, JOB_UPGRADE, UNIT_UPGRADE, parent_header(&headers)).await
}

fn parent_header(headers: &HeaderMap) -> Option<&str> {
	headers.get("x-task-parent")?.to_str().ok()
}

/// Starts a job's unit and answers `202` with its state; `409` while it is already running. See
/// spec/architecture/apt.md, the door's route table.
async fn start_job(state: &AppState, job: &'static str, unit: &'static str, parent: Option<&str>) -> Response {
	let current = match state.bus.properties(unit).await {
		Ok(properties) => properties,
		Err(_) => return response::failure(StatusCode::SERVICE_UNAVAILABLE, "service_unavailable"),
	};
	if current.running() {
		return response::failure(StatusCode::CONFLICT, "job_running");
	}

	let parent = run::parent_of(parent);
	match run::start_and_follow(state.bus.clone(), state.ledger.clone(), job, unit, parent).await {
		Ok(properties) => response::success(StatusCode::ACCEPTED, job_view(unit, &properties)),
		Err(_) => response::failure(StatusCode::SERVICE_UNAVAILABLE, "service_unavailable"),
	}
}

/// One job as `/status` and a job route answer it: its unit, whether it is running, and its last
/// run, when it has had one.
fn job_view(unit: &str, properties: &Properties) -> serde_json::Value {
	let last_run = (properties.exec_main_start_timestamp != 0).then(|| {
		serde_json::json!({
			"started_at": micros(properties.exec_main_start_timestamp),
			"finished_at": (properties.exec_main_exit_timestamp != 0)
				.then(|| micros(properties.exec_main_exit_timestamp)),
			"result": properties.result,
			"exit_status": properties.exec_main_status,
		})
	});
	serde_json::json!({ "unit": unit, "running": properties.running(), "last_run": last_run })
}

/// Microseconds since the epoch, as systemd gives a unit's timestamps, read as RFC 3339.
fn micros(value: u64) -> Option<String> {
	i64::try_from(value).ok().and_then(|us| jiff::Timestamp::from_microsecond(us).ok()).map(|at| at.to_string())
}

#[cfg(test)]
mod tests {
	use super::*;
	use crate::bus::tests::FakeBus;
	use axum::body::Body;
	use axum::http::Request;
	use http_body_util::BodyExt;
	use tower::ServiceExt;

	fn state(bus: FakeBus) -> AppState {
		AppState { bus: Arc::new(bus), ledger: None }
	}

	async fn ask(router: Router, method: &str, path: &str, parent: Option<&str>) -> (StatusCode, serde_json::Value) {
		let mut request = Request::builder().method(method).uri(path);
		if let Some(parent) = parent {
			request = request.header("x-task-parent", parent);
		}
		let request = request.body(Body::empty()).unwrap();
		let answer = router.oneshot(request).await.unwrap();
		let status = answer.status();
		let body = answer.into_body().collect().await.unwrap().to_bytes();
		(status, serde_json::from_slice(&body).unwrap())
	}

	#[tokio::test]
	async fn health_and_status_read_the_bus() {
		let router = routes(state(FakeBus::idle()));
		assert_eq!(ask(router.clone(), "GET", "/health", None).await.0, StatusCode::OK);

		let (status, body) = ask(router, "GET", "/status", None).await;
		assert_eq!(status, StatusCode::OK);
		assert_eq!(body["data"]["update"]["unit"], "apt-nightly-update.service");
		assert_eq!(body["data"]["update"]["running"], false);
		assert_eq!(body["data"]["update"]["last_run"], serde_json::Value::Null);
	}

	#[tokio::test]
	async fn starting_a_job_answers_202_with_its_state() {
		let router = routes(state(FakeBus::starting()));
		let (status, body) = ask(router, "POST", "/jobs/update", Some("cron:abc")).await;
		assert_eq!(status, StatusCode::ACCEPTED);
		assert_eq!(body["data"]["unit"], "apt-nightly-update.service");
		assert_eq!(body["data"]["running"], true);
	}

	#[tokio::test]
	async fn a_running_job_refuses_a_second_start() {
		let router = routes(state(FakeBus::always_active()));
		let (status, body) = ask(router, "POST", "/jobs/upgrade", None).await;
		assert_eq!(status, StatusCode::CONFLICT);
		assert_eq!(body["code"], "job_running");
	}

	#[tokio::test]
	async fn an_unknown_route_is_the_envelope_too() {
		let router = routes(state(FakeBus::idle()));
		let (status, body) = ask(router, "GET", "/jobs", None).await;
		assert_eq!(status, StatusCode::NOT_FOUND);
		assert_eq!(body["code"], "no_such_route");
	}

	#[test]
	fn every_code_it_answers_with_is_in_the_catalogue() {
		for code in response::codes_named(include_str!("api.rs")) {
			assert!(response::message_of(code).is_some(), "`{code}` is not in libs/response/codes.json");
		}
	}
}
