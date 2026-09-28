//! What the panel reaches on `cron`'s private scope. See spec/architecture/cron.md, "A job is
//! declared by the service that does it" and "Seen in the panel".

use crate::scheduler::Shared;
use axum::Router;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::Response;
use axum::routing::{get, post};

pub fn routes(cron: Shared) -> Router {
	Router::new()
		.route("/health", get(|| async { response::success(StatusCode::OK, ()) }))
		.route("/schedules", get(list))
		.route("/schedules/{service}/{name}/run", post(run))
		.route("/schedules/{service}/{name}/pause", post(pause))
		.route("/schedules/{service}/{name}/resume", post(resume))
		.fallback(|| async { response::failure(StatusCode::NOT_FOUND, "no_such_route") })
		.with_state(cron)
}

async fn list(State(cron): State<Shared>) -> Response {
	response::success(StatusCode::OK, cron.views())
}

/// 202 with the run's id: the run goes on after the answer.
async fn run(
	Path((service, name)): Path<(String, String)>,
	State(cron): State<Shared>,
) -> Response {
	match cron.run_now(&service, &name) {
		Some(run) => response::success(StatusCode::ACCEPTED, serde_json::json!({ "run": run })),
		None => response::failure(StatusCode::NOT_FOUND, "no_such_route"),
	}
}

async fn pause(
	Path((service, name)): Path<(String, String)>,
	State(cron): State<Shared>,
) -> Response {
	paused(&cron, &service, &name, true)
}

async fn resume(
	Path((service, name)): Path<(String, String)>,
	State(cron): State<Shared>,
) -> Response {
	paused(&cron, &service, &name, false)
}

fn paused(cron: &Shared, service: &str, name: &str, paused: bool) -> Response {
	if cron.set_paused(service, name, paused) {
		response::success(StatusCode::OK, serde_json::json!({ "paused": paused }))
	} else {
		response::failure(StatusCode::NOT_FOUND, "no_such_route")
	}
}

#[cfg(test)]
mod tests {
	use super::*;
	use crate::reach::{Answer, Call, Target, Transport};
	use crate::scheduler::Cron;
	use crate::store::Store;
	use crate::table::Table;
	use axum::body::Body;
	use axum::http::Request;
	use std::sync::{Arc, Mutex};
	use tokio::sync::Semaphore;
	use tower::ServiceExt;

	/// Answers 200 once let through, keeping every call's target and parent header.
	struct Fake {
		calls: Mutex<Vec<(Target, String)>>,
		gate: Arc<Semaphore>,
	}

	impl Transport for Fake {
		fn send(&self, call: Call) -> Answer {
			let parent = call.request.headers()[crate::reach::PARENT].to_str().unwrap().to_owned();
			self.calls.lock().unwrap().push((call.target, parent));
			let gate = self.gate.clone();
			Box::pin(async move {
				gate.acquire().await.unwrap().forget();
				Ok(200)
			})
		}
	}

	const TABLE: &str = r#"{ "jobs": [
		{ "service": "geo", "name": "refresh", "cron": "0 4 * * *", "every": null,
			"path": "/jobs/refresh", "catch_up": "once", "overlap": "skip", "timeout": 300,
			"reach": { "scope": "geo" } },
		{ "service": "apt", "name": "update", "cron": null, "every": "6h",
			"path": "/jobs/update", "catch_up": "skip", "overlap": "queue", "timeout": 1800,
			"reach": { "socket": "/sockets/apt/apt.sock" } }
	] }"#;

	fn cron() -> (tempfile::TempDir, Arc<Fake>, Shared) {
		let directory = tempfile::tempdir().unwrap();
		let store = Store::open(&directory.path().join(crate::store::FILE)).unwrap();
		let fake = Arc::new(Fake { calls: Mutex::new(Vec::new()), gate: Arc::new(Semaphore::new(0)) });
		// A ledger nobody answers: its records wait and are dropped, which the work never notices.
		let cron = Cron::new(
			store,
			ledger::Ledger::to(String::new()),
			fake.clone(),
			crate::reach::origin().into(),
		);
		cron.load(Table::parse(TABLE).unwrap(), "2026-09-28T12:00:00Z".parse().unwrap());
		(directory, fake, cron)
	}

	async fn ask(cron: &Shared, method: &str, path: &str) -> (StatusCode, serde_json::Value) {
		let request = Request::builder().method(method).uri(path).body(Body::empty()).unwrap();
		let response = routes(cron.clone()).oneshot(request).await.unwrap();
		let status = response.status();
		let body = axum::body::to_bytes(response.into_body(), usize::MAX).await.unwrap();
		(status, serde_json::from_slice(&body).unwrap())
	}

	async fn settle() {
		for _ in 0..20 {
			tokio::task::yield_now().await;
		}
	}

	#[tokio::test]
	async fn lists_every_job_with_its_next_time() {
		let (_directory, _fake, cron) = cron();
		let (status, body) = ask(&cron, "GET", "/schedules").await;
		assert_eq!(status, StatusCode::OK);
		let jobs = body["data"].as_array().unwrap();
		assert_eq!(jobs.len(), 2);
		// `(service, name)` order: apt before geo.
		assert_eq!(jobs[0]["service"], "apt");
		assert_eq!(jobs[0]["next"], "2026-09-28T18:00:00Z");
		assert_eq!(jobs[1]["next"], "2026-09-29T04:00:00Z");
		assert_eq!(jobs[1]["reach"]["scope"], "geo");
		assert_eq!(jobs[1]["paused"], false);
		assert_eq!(jobs[1]["last"], serde_json::Value::Null);
	}

	#[tokio::test]
	async fn runs_now_and_answers_the_run_id() {
		let (_directory, fake, cron) = cron();
		fake.gate.add_permits(1);
		let (status, body) = ask(&cron, "POST", "/schedules/geo/refresh/run").await;
		assert_eq!(status, StatusCode::ACCEPTED);
		let run = body["data"]["run"].as_str().unwrap().to_owned();
		settle().await;
		assert_eq!(fake.calls.lock().unwrap()[0], (Target::Api, format!("cron:{run}")));
		let (_, body) = ask(&cron, "GET", "/schedules").await;
		let last = &body["data"][1]["last"];
		assert_eq!(last["run"], run.as_str());
		assert_eq!(last["outcome"], "done");
		assert_eq!(last["status"], 200);
	}

	#[tokio::test]
	async fn an_unknown_job_is_not_found() {
		let (_directory, _fake, cron) = cron();
		for path in ["/schedules/geo/nope/run", "/schedules/nope/refresh/pause"] {
			let (status, body) = ask(&cron, "POST", path).await;
			assert_eq!(status, StatusCode::NOT_FOUND);
			assert_eq!(body["code"], "no_such_route");
		}
	}

	#[tokio::test]
	async fn pauses_and_resumes() {
		let (_directory, _fake, cron) = cron();
		assert_eq!(ask(&cron, "POST", "/schedules/geo/refresh/pause").await.0, StatusCode::OK);
		assert_eq!(ask(&cron, "GET", "/schedules").await.1["data"][1]["paused"], true);
		assert_eq!(ask(&cron, "POST", "/schedules/geo/refresh/resume").await.0, StatusCode::OK);
		assert_eq!(ask(&cron, "GET", "/schedules").await.1["data"][1]["paused"], false);
	}

	#[tokio::test]
	async fn skip_skips_and_queue_runs_after() {
		let (_directory, fake, cron) = cron();
		// geo skips: the second run, due while the first goes on, is never asked.
		cron.run_now("geo", "refresh").unwrap();
		settle().await;
		cron.run_now("geo", "refresh").unwrap();
		settle().await;
		assert_eq!(fake.calls.lock().unwrap().len(), 1);
		fake.gate.add_permits(1);
		settle().await;

		// apt queues: the second is asked once the first is answered, and a third is skipped.
		let first = cron.run_now("apt", "update").unwrap();
		settle().await;
		let second = cron.run_now("apt", "update").unwrap();
		cron.run_now("apt", "update").unwrap();
		settle().await;
		assert_eq!(fake.calls.lock().unwrap().len(), 2);
		assert_eq!(ask(&cron, "GET", "/schedules").await.1["data"][0]["queued"], true);
		fake.gate.add_permits(1);
		settle().await;
		let calls = fake.calls.lock().unwrap().clone();
		assert_eq!(calls.len(), 3);
		assert_eq!(calls[1], (Target::Socket("/sockets/apt/apt.sock".into()), format!("cron:{first}")));
		assert_eq!(calls[2].1, format!("cron:{second}"));
	}

	#[tokio::test]
	async fn a_job_that_missed_its_time_runs_once_on_load() {
		let directory = tempfile::tempdir().unwrap();
		let store = Store::open(&directory.path().join(crate::store::FILE)).unwrap();
		let old = "2026-09-27T04:00:00Z".parse().unwrap();
		store.set_due("geo", "refresh", old).unwrap();
		store.set_due("apt", "update", old).unwrap();
		let fake = Arc::new(Fake { calls: Mutex::new(Vec::new()), gate: Arc::new(Semaphore::new(1)) });
		let cron = Cron::new(
			store,
			ledger::Ledger::to(String::new()),
			fake.clone(),
			crate::reach::origin().into(),
		);
		cron.load(Table::parse(TABLE).unwrap(), "2026-09-28T12:00:00Z".parse().unwrap());
		settle().await;
		// geo catches up once; apt skips what it missed.
		let calls = fake.calls.lock().unwrap().clone();
		assert_eq!(calls.len(), 1);
		assert_eq!(calls[0].0, Target::Api);
		let (_, body) = ask(&cron, "GET", "/schedules").await;
		assert_eq!(body["data"][1]["last"]["due"], "2026-09-28T04:00:00Z");
	}

	#[test]
	fn every_code_it_answers_with_is_in_the_catalogue() {
		for code in response::codes_named(include_str!("api.rs")) {
			assert!(response::message_of(code).is_some(), "`{code}` is not in libs/response/codes.json");
		}
	}
}
