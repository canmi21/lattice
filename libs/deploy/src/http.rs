//! The two requests the platform makes itself: a health check over a container network, and a load
//! through Caddy's admin socket. One connection each, HTTP/1.1, nothing kept open.

use bytes::Bytes;
use http_body_util::{BodyExt, Full};
use hyper::Request;
use hyper_util::rt::TokioIo;
use std::path::Path;
use std::time::Duration;
use tokio::io::{AsyncRead, AsyncWrite};

/// Long enough for a slow answer from a loaded machine, short enough that a hung app fails its
/// check inside the deploy's own deadline rather than holding it.
const ATTEMPT: Duration = Duration::from_secs(5);

#[derive(Debug, thiserror::Error)]
pub enum Error {
	#[error("could not connect: {0}")]
	Connect(std::io::Error),
	#[error("HTTP: {0}")]
	Http(#[from] hyper::Error),
	#[error("no answer within {} seconds", ATTEMPT.as_secs())]
	Timeout,
	#[error("the request could not be built: {0}")]
	Request(#[from] hyper::http::Error),
}

async fn send<S>(stream: S, request: Request<Full<Bytes>>) -> Result<(u16, String), Error>
where
	S: AsyncRead + AsyncWrite + Unpin + Send + 'static,
{
	let (mut sender, connection) =
		hyper::client::conn::http1::handshake(TokioIo::new(stream)).await?;
	tokio::spawn(connection);
	let response = sender.send_request(request).await?;
	let status = response.status().as_u16();
	let body = response.into_body().collect().await?.to_bytes();
	Ok((status, String::from_utf8_lossy(&body).into_owned()))
}

/// The status a container answers `path` with at `address`, which Docker's DNS resolves on the
/// network host shares with it.
pub async fn status(address: &str, path: &str) -> Result<u16, Error> {
	let attempt = async {
		let stream = tokio::net::TcpStream::connect(address).await.map_err(Error::Connect)?;
		let request = Request::get(path).header("host", address).body(Full::new(Bytes::new()))?;
		send(stream, request).await
	};
	let (status, _) = tokio::time::timeout(ATTEMPT, attempt).await.map_err(|_| Error::Timeout)??;
	Ok(status)
}

/// POST a JSON body to `address` over a container network, for its status: keeper passing a run
/// on to host.
pub async fn post(address: &str, path: &str, body: Vec<u8>) -> Result<u16, Error> {
	let attempt = async {
		let stream = tokio::net::TcpStream::connect(address).await.map_err(Error::Connect)?;
		let request = Request::post(path)
			.header("host", address)
			.header("content-type", "application/json")
			.body(Full::new(Bytes::from(body)))?;
		send(stream, request).await
	};
	let (status, _) = tokio::time::timeout(ATTEMPT, attempt).await.map_err(|_| Error::Timeout)??;
	Ok(status)
}

/// POST a JSON body through a unix socket. Caddy's admin endpoint on a socket accepts only an empty
/// host or a loopback address as `Host`, and a client cannot send an empty one, so it is
/// 127.0.0.1.
pub async fn post_unix(socket: &Path, path: &str, body: Vec<u8>) -> Result<(u16, String), Error> {
	let stream = tokio::net::UnixStream::connect(socket).await.map_err(Error::Connect)?;
	let request = Request::post(path)
		.header("host", "127.0.0.1")
		.header("content-type", "application/json")
		.body(Full::new(Bytes::from(body)))?;
	tokio::time::timeout(Duration::from_secs(30), send(stream, request))
		.await
		.map_err(|_| Error::Timeout)?
}
