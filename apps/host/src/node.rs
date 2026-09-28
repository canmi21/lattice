//! The machine itself, as the meter samples it. host asks on the meter's socket and passes the
//! answer on unchanged, since the meter already answers in the envelope. See
//! spec/architecture/meter.md, "Reached through a socket".

use axum::http::{StatusCode, header};
use axum::response::{IntoResponse, Response};
use std::path::Path;

/// The file the meter reads which container is which from, in its directory; the same name as
/// `NAMES` in the meter. See spec/architecture/meter.md, "Each container".
pub const NAMES: &str = "containers.json";

/// How often the meter is told which container is which: a container started since is sampled
/// from the next telling on.
pub const TELLING: std::time::Duration = std::time::Duration::from_secs(30);

/// Write every running container's id and name where the meter reads them, through a temporary
/// file and a rename so it never reads half of one. Nothing when no meter's directory is there.
pub async fn tell(engine: &deploy::Engine, directory: &Path) -> anyhow::Result<()> {
	if !tokio::fs::try_exists(directory).await.unwrap_or(false) {
		return Ok(());
	}
	let named = engine.named().await?;
	let temporary = directory.join(format!("{NAMES}.next"));
	tokio::fs::write(&temporary, serde_json::to_vec(&named)?).await?;
	tokio::fs::rename(&temporary, directory.join(NAMES)).await?;
	Ok(())
}

/// What the meter answers `path` with, or `meter_unavailable` when there is no socket to ask or
/// nothing answers on it.
pub async fn relay(socket: Option<&Path>, path: &str) -> Response {
	let Some(socket) = socket else {
		let message = "No meter is deployed on this node";
		return response::failure_with(StatusCode::SERVICE_UNAVAILABLE, "meter_unavailable", message);
	};
	match deploy::http::get_unix(socket, path).await {
		Ok((status, body)) => {
			let status = StatusCode::from_u16(status).unwrap_or(StatusCode::BAD_GATEWAY);
			(status, [(header::CONTENT_TYPE, "application/json")], body).into_response()
		}
		Err(error) => {
			response::failure_with(StatusCode::SERVICE_UNAVAILABLE, "meter_unavailable", error)
		}
	}
}

#[cfg(test)]
mod tests {
	use super::*;
	use axum::Router;
	use axum::routing::get;
	use http_body_util::BodyExt;
	use std::future::IntoFuture;

	async fn read(answer: Response) -> (StatusCode, serde_json::Value) {
		let status = answer.status();
		let body = answer.into_body().collect().await.unwrap().to_bytes();
		(status, serde_json::from_slice(&body).unwrap())
	}

	#[tokio::test]
	async fn passes_the_agents_answer_on_and_says_when_there_is_none() {
		let directory = tempfile::tempdir().unwrap();
		let socket = directory.path().join("meter.sock");
		let meter = Router::new()
			.route(
				"/series",
				get(|query: axum::extract::RawQuery| async move {
					response::success(StatusCode::OK, query.0.unwrap_or_default())
				}),
			)
			.fallback(|| async { response::failure(StatusCode::NOT_FOUND, "no_such_route") });
		let listener = tokio::net::UnixListener::bind(&socket).unwrap();
		tokio::spawn(axum::serve(listener, meter).into_future());

		let (status, body) = read(relay(Some(&socket), "/series?grain=minute&metrics=cpu").await).await;
		assert_eq!((status, body["data"].as_str()), (StatusCode::OK, Some("grain=minute&metrics=cpu")));
		let (status, body) = read(relay(Some(&socket), "/nothing").await).await;
		assert_eq!((status, &body["code"]), (StatusCode::NOT_FOUND, &"no_such_route".into()));

		let (status, body) = read(relay(None, "/now").await).await;
		assert_eq!(
			(status, &body["code"]),
			(StatusCode::SERVICE_UNAVAILABLE, &"meter_unavailable".into())
		);
		let gone = directory.path().join("gone.sock");
		let (status, body) = read(relay(Some(&gone), "/now").await).await;
		assert_eq!(
			(status, &body["code"]),
			(StatusCode::SERVICE_UNAVAILABLE, &"meter_unavailable".into())
		);
	}

	#[test]
	fn every_code_it_answers_with_is_in_the_catalogue() {
		for code in response::codes_named(include_str!("node.rs")) {
			assert!(response::message_of(code).is_some(), "`{code}` is not in libs/response/codes.json");
		}
	}
}
