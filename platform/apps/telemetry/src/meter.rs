//! Reaching the meter over its socket, mounted at `/sockets/meter/meter.sock` inside telemetry's
//! own container by its `Reporter` shape. See spec/architecture/meter.md, "Reached through a
//! socket", and spec/architecture/telemetry.md, "Where it comes from".

use axum::http::StatusCode;
use bytes::Bytes;
use http_body_util::{BodyExt, Full};
use hyper::Request;
use hyper_util::rt::TokioIo;
use response::Envelope;
use serde_json::Value;
use std::path::PathBuf;
use std::time::Duration;

/// Where the meter's socket lands once host mounts its directory in. See
/// spec/architecture/telemetry.md, "Where it comes from".
pub const DEFAULT_SOCKET: &str = "/sockets/meter/meter.sock";

/// Long enough for a loaded machine's answer, short enough that a stuck meter does not hold a
/// caller's request open; the same bound host itself uses to reach the meter.
const ATTEMPT: Duration = Duration::from_secs(5);

/// What one call to the meter came back with.
#[derive(Debug, Clone, PartialEq)]
pub enum Answer {
	/// The meter answered, and answered successfully.
	Data(Value),
	/// The meter could not be reached or read at all: down, or its body unreadable. A source that
	/// cannot be read leaves its part null rather than failing the rest -- see
	/// spec/architecture/telemetry.md, "The service".
	Unavailable,
	/// The meter read the request fine and refused it: the query passed through from the caller,
	/// `grain`, `since` or `until`, was not one it could act on.
	Invalid { status: StatusCode, code: String, message: String },
}

/// The meter, reached on its socket. Cheap to clone: the socket path is the only state.
#[derive(Debug, Clone)]
pub struct Meter {
	socket: PathBuf,
}

impl Meter {
	pub fn new(socket: PathBuf) -> Self {
		Self { socket }
	}

	/// GET `path` on the meter's socket, parsed as the envelope it answers in.
	pub async fn get(&self, path: &str) -> Answer {
		let socket = self.socket.clone();
		let path = path.to_owned();
		let attempt = async move {
			let stream = tokio::net::UnixStream::connect(&socket).await?;
			let request =
				Request::get(&path).header("host", "127.0.0.1").body(Full::new(Bytes::new()))?;
			let (mut sender, connection) =
				hyper::client::conn::http1::handshake(TokioIo::new(stream)).await?;
			tokio::spawn(connection);
			let response = sender.send_request(request).await?;
			let status =
				StatusCode::from_u16(response.status().as_u16()).unwrap_or(StatusCode::BAD_GATEWAY);
			let body = response.into_body().collect().await?.to_bytes();
			anyhow::Ok((status, body))
		};
		let Ok(Ok((status, body))) = tokio::time::timeout(ATTEMPT, attempt).await else {
			return Answer::Unavailable;
		};
		let Ok(envelope) = serde_json::from_slice::<Envelope<Value>>(&body) else {
			return Answer::Unavailable;
		};
		match envelope {
			Envelope::Success { data } => Answer::Data(data),
			Envelope::Error { code, message } if status.is_client_error() => {
				Answer::Invalid { status, code, message }
			}
			Envelope::Error { .. } => Answer::Unavailable,
		}
	}
}

#[cfg(test)]
mod tests {
	use super::*;
	use axum::Router;
	use axum::routing::get;
	use std::future::IntoFuture;

	fn fake() -> (tempfile::TempDir, PathBuf) {
		let directory = tempfile::tempdir().unwrap();
		let socket = directory.path().join("meter.sock");
		(directory, socket)
	}

	async fn serve(socket: &PathBuf, router: Router) {
		let listener = tokio::net::UnixListener::bind(socket).unwrap();
		tokio::spawn(axum::serve(listener, router).into_future());
	}

	#[tokio::test]
	async fn reads_a_success_and_forwards_a_client_error() {
		let (_dir, socket) = fake();
		let router = Router::new()
			.route(
				"/now",
				get(|| async { response::success(StatusCode::OK, serde_json::json!({"sample": 1})) }),
			)
			.route(
				"/series",
				get(|| async { response::failure(StatusCode::BAD_REQUEST, "invalid_series") }),
			);
		serve(&socket, router).await;
		let meter = Meter::new(socket);

		match meter.get("/now").await {
			Answer::Data(value) => assert_eq!(value["sample"], 1),
			other => panic!("expected data, got {other:?}"),
		}
		match meter.get("/series").await {
			Answer::Invalid { status, code, .. } => {
				assert_eq!((status, code.as_str()), (StatusCode::BAD_REQUEST, "invalid_series"));
			}
			other => panic!("expected an invalid answer, got {other:?}"),
		}
	}

	#[tokio::test]
	async fn is_unavailable_rather_than_failing_when_there_is_nothing_to_ask() {
		let (dir, _socket) = fake();
		let meter = Meter::new(dir.path().join("gone.sock"));
		assert_eq!(meter.get("/now").await, Answer::Unavailable);
	}

	#[tokio::test]
	async fn a_server_error_from_the_meter_is_unavailable_too() {
		let (_dir, socket) = fake();
		let router = Router::new().route(
			"/now",
			get(|| async { response::failure(StatusCode::SERVICE_UNAVAILABLE, "metrics_unavailable") }),
		);
		serve(&socket, router).await;
		let meter = Meter::new(socket);
		assert_eq!(meter.get("/now").await, Answer::Unavailable);
	}
}
