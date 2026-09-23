//! Forwarding a request to a half that has no address.
//!
//! One connection per request rather than a pool: these are a handful of local calls from one
//! editor, and a pool would be state to keep correct for a saving that cannot be measured over a
//! unix socket. What a pool would buy on a network is the connection setup, and there is none.

use axum::body::Body;
use axum::extract::{Request, State};
use axum::http::{StatusCode, header};
use axum::response::{IntoResponse, Response};
use http_body_util::BodyExt as _;
use std::path::Path;
use std::sync::Arc;
use tokio::net::UnixStream;

use super::Shell;

/// Answer a request by asking the other half, or say plainly that it is not there.
///
/// A 502 with a sentence beats a hang or an empty 500: the half is a child process, and the
/// failure a person meets is that it died, which they can act on only if they are told.
pub async fn forward(State(shell): State<Arc<Shell>>, request: Request) -> Response {
	match relay(&shell.socket, request).await {
		Ok(response) => response,
		Err(reason) => (
			StatusCode::BAD_GATEWAY,
			[(header::CONTENT_TYPE, "text/plain; charset=utf-8")],
			format!("the collection half did not answer: {reason}\n"),
		)
			.into_response(),
	}
}

async fn relay(socket: &Path, request: Request) -> Result<Response, String> {
	let stream = UnixStream::connect(socket).await.map_err(|error| error.to_string())?;
	let io = hyper_util::rt::TokioIo::new(stream);
	let (mut sender, connection) =
		hyper::client::conn::http1::handshake(io).await.map_err(|error| error.to_string())?;
	// The connection drives itself until the response body is done; dropping the task would cut
	// the body off mid-flight, which reads as a truncated JSON document rather than as an error.
	tokio::spawn(async move {
		let _ = connection.await;
	});
	let answered = sender.send_request(request).await.map_err(|error| error.to_string())?;
	let (mut parts, body) = answered.into_parts();
	let collected = body.collect().await.map_err(|error| error.to_string())?.to_bytes();
	// The body arrives chunked and leaves with a length, so the headers describing how it was
	// framed cannot travel with it: keeping `transfer-encoding` beside a known length is a
	// protocol error, and hyper answers it by dropping the connection with nothing written --
	// which reads as "the server hung up" and says nothing about why.
	for hop in [header::TRANSFER_ENCODING, header::CONNECTION, header::CONTENT_LENGTH] {
		parts.headers.remove(hop);
	}
	Ok(Response::from_parts(parts, Body::from(collected)))
}

/// Ask the other half whether it is answering, rather than whether its socket file exists.
pub async fn reachable(socket: &Path) -> bool {
	UnixStream::connect(socket).await.is_ok()
}
