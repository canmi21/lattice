//! `/api/inspect/containers`: every container on the machine, whoever started it. The shape is
//! `deploy::engine::container_info`'s, built pure from what `list` and `inspect` each report; this
//! is the thin reader that calls it. See spec/architecture/inspect.md.

use crate::Host;
use axum::extract::State;
use axum::http::StatusCode;
use axum::response::Response;
use std::sync::Arc;

pub async fn list(State(host): State<Arc<Host>>) -> Response {
	match host.engine.containers().await {
		Ok(containers) => response::success(StatusCode::OK, containers),
		Err(error) => response::failure_with(StatusCode::BAD_GATEWAY, "docker_unavailable", error),
	}
}

#[cfg(test)]
mod tests {
	#[test]
	fn every_code_it_answers_with_is_in_the_catalogue() {
		for code in response::codes_named(include_str!("containers.rs")) {
			assert!(
				response::message_of(code).is_some(),
				"`{code}` is not in lib/pkgs/response/codes.json"
			);
		}
	}
}
