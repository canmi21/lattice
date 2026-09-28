//! How a run asks its service: `POST api.canmi.icu/<scope><path>` through Caddy, or `POST <path>`
//! on the service's socket. See spec/architecture/cron.md, "A run is a request, and a task in the
//! ledger".

use crate::table::{Job, Reach};
use bytes::Bytes;
use http_body_util::Full;
use hyper::Request;
use hyper_rustls::HttpsConnector;
use hyper_util::client::legacy::Client;
use hyper_util::client::legacy::connect::HttpConnector;
use hyper_util::rt::{TokioExecutor, TokioIo};
use std::future::Future;
use std::path::PathBuf;
use std::pin::Pin;

/// The header a service reads its ledger task's `parent` from.
pub const PARENT: &str = "x-task-parent";

/// The private API host's origin. `urls` names the ledger's scope on it and not the host itself,
/// so the origin is that URL less its scope.
pub fn origin() -> &'static str {
	urls::INTERNAL_LEDGER.strip_suffix("/ledger").unwrap_or(urls::INTERNAL_LEDGER)
}

/// Where a request goes.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Target {
	/// Through Caddy; the request's URI is absolute.
	Api,
	/// On this socket; the request's URI is the path alone.
	Socket(PathBuf),
}

#[derive(Debug)]
pub struct Call {
	pub target: Target,
	pub request: Request<Full<Bytes>>,
}

/// The request one run makes, carrying the run's id as its parent.
pub fn call(job: &Job, run: &str, origin: &str) -> Result<Call, String> {
	let (target, builder) = match &job.reach {
		Reach::Scope(scope) => {
			(Target::Api, Request::post(format!("{}/{scope}{}", origin.trim_end_matches('/'), job.path)))
		}
		// Any `Host` does on a socket; one has to be sent all the same.
		Reach::Socket(socket) => {
			(Target::Socket(socket.clone()), Request::post(&job.path).header("host", "localhost"))
		}
	};
	let request = builder
		.header(PARENT, format!("cron:{run}"))
		.body(Full::new(Bytes::new()))
		.map_err(|error| error.to_string())?;
	Ok(Call { target, request })
}

pub type Answer = Pin<Box<dyn Future<Output = Result<u16, String>> + Send>>;

/// What sends a call and answers its status; a fake one in the tests.
pub trait Transport: Send + Sync + 'static {
	fn send(&self, call: Call) -> Answer;
}

pub struct Network {
	client: Client<HttpsConnector<HttpConnector>, Full<Bytes>>,
}

impl Network {
	pub fn new() -> Self {
		// Roots compiled in rather than read from the system: an image built from scratch has none.
		let https = hyper_rustls::HttpsConnectorBuilder::new()
			.with_webpki_roots()
			.https_or_http()
			.enable_http1()
			.build();
		Self { client: Client::builder(TokioExecutor::new()).build(https) }
	}
}

impl Default for Network {
	fn default() -> Self {
		Self::new()
	}
}

impl Transport for Network {
	fn send(&self, call: Call) -> Answer {
		match call.target {
			Target::Api => {
				let answer = self.client.request(call.request);
				Box::pin(async move {
					answer.await.map(|answer| answer.status().as_u16()).map_err(|error| error.to_string())
				})
			}
			Target::Socket(socket) => Box::pin(async move {
				let stream = tokio::net::UnixStream::connect(&socket)
					.await
					.map_err(|error| format!("could not connect to {}: {error}", socket.display()))?;
				let (mut sender, connection) = hyper::client::conn::http1::handshake(TokioIo::new(stream))
					.await
					.map_err(|error| error.to_string())?;
				tokio::spawn(connection);
				let answer = sender.send_request(call.request).await.map_err(|error| error.to_string())?;
				Ok(answer.status().as_u16())
			}),
		}
	}
}

#[cfg(test)]
mod tests {
	use super::*;
	use crate::table::{CatchUp, Overlap};

	fn job(reach: Reach) -> Job {
		Job {
			service: "geo".into(),
			name: "refresh".into(),
			cron: Some("0 4 * * *".into()),
			every: None,
			path: "/jobs/refresh".into(),
			catch_up: CatchUp::Once,
			overlap: Overlap::Skip,
			timeout: 300,
			reach,
		}
	}

	#[test]
	fn the_origin_is_the_api_host() {
		assert!(urls::INTERNAL_LEDGER.starts_with(origin()));
		assert!(!origin().ends_with('/'));
		assert_eq!(origin().matches('/').count(), 2);
	}

	#[test]
	fn a_scope_is_asked_through_the_api_host() {
		let call = call(&job(Reach::Scope("geo".into())), "r1", origin()).unwrap();
		assert_eq!(call.target, Target::Api);
		assert_eq!(call.request.method(), hyper::Method::POST);
		assert_eq!(call.request.uri().to_string(), format!("{}/geo/jobs/refresh", origin()));
		assert_eq!(call.request.headers()[PARENT], "cron:r1");
	}

	#[test]
	fn a_socket_is_asked_the_path_alone() {
		let call = call(&job(Reach::Socket("/sockets/apt/apt.sock".into())), "r2", origin()).unwrap();
		assert_eq!(call.target, Target::Socket("/sockets/apt/apt.sock".into()));
		assert_eq!(call.request.method(), hyper::Method::POST);
		assert_eq!(call.request.uri().to_string(), "/jobs/refresh");
		assert_eq!(call.request.headers()[PARENT], "cron:r2");
		assert!(call.request.headers().contains_key("host"));
	}
}
