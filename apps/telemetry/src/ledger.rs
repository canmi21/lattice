//! Reaching the ledger's private counts, for how much work each service took on. See
//! spec/architecture/ledger.md, "Counted for telemetry", and spec/architecture/telemetry.md,
//! "Where it comes from".

use bytes::Bytes;
use http_body_util::{BodyExt, Full};
use hyper::Request;
use hyper_rustls::HttpsConnector;
use hyper_util::client::legacy::Client;
use hyper_util::client::legacy::connect::HttpConnector;
use hyper_util::rt::TokioExecutor;
use response::Envelope;
use serde::{Deserialize, Serialize};
use std::future::Future;
use std::pin::Pin;
use std::time::Duration;

/// One row of `GET /counts`, per spec/architecture/ledger.md, "Counted for telemetry". `hour` is
/// the RFC 3339 instant it starts, kept as the ledger sends it rather than reparsed here.
#[derive(Debug, Clone, PartialEq, Deserialize, Serialize)]
pub struct Count {
	pub service: String,
	pub hour: String,
	pub state: String,
	pub count: i64,
}

/// Short: telemetry's own answer must not wait long on a slow ledger. See
/// spec/architecture/telemetry.md, "Where it comes from".
const ATTEMPT: Duration = Duration::from_secs(5);

pub type Counts = Pin<Box<dyn Future<Output = Option<Vec<Count>>> + Send>>;

/// What answers the ledger's counts; a fake one in the tests. `None` is "this source could not be
/// read" -- never a failure of the answer as a whole. See spec/architecture/telemetry.md, "The
/// service".
pub trait Ledger: Send + Sync + 'static {
	fn counts(&self, hours: u32) -> Counts;
}

pub struct Network {
	client: Client<HttpsConnector<HttpConnector>, Full<Bytes>>,
}

impl Network {
	/// Roots compiled in rather than read from the system: an image built from scratch has none.
	/// See apps/geo/src/fetch.rs.
	pub fn new() -> Self {
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

impl Ledger for Network {
	fn counts(&self, hours: u32) -> Counts {
		let url = format!("{}/counts?hours={hours}", urls::INTERNAL_LEDGER);
		let Ok(request) = Request::get(&url).body(Full::new(Bytes::new())) else {
			return Box::pin(async { None });
		};
		let answer = self.client.request(request);
		Box::pin(async move {
			let response = tokio::time::timeout(ATTEMPT, answer).await.ok()?.ok()?;
			if !response.status().is_success() {
				return None;
			}
			let body = response.into_body().collect().await.ok()?.to_bytes();
			match serde_json::from_slice::<Envelope<Vec<Count>>>(&body).ok()? {
				Envelope::Success { data } => Some(data),
				Envelope::Error { .. } => None,
			}
		})
	}
}

#[cfg(test)]
mod tests {
	use super::*;

	struct Fake(Vec<Count>);

	impl Ledger for Fake {
		fn counts(&self, _hours: u32) -> Counts {
			let counts = self.0.clone();
			Box::pin(async move { Some(counts) })
		}
	}

	struct Down;

	impl Ledger for Down {
		fn counts(&self, _hours: u32) -> Counts {
			Box::pin(async { None })
		}
	}

	#[tokio::test]
	async fn a_fake_answers_and_a_down_one_does_not() {
		let row = Count {
			service: "geo".into(),
			hour: "2026-09-28T00:00:00Z".into(),
			state: "done".into(),
			count: 3,
		};
		let fake = Fake(vec![row.clone()]);
		assert_eq!(fake.counts(24).await, Some(vec![row]));
		assert_eq!(Down.counts(24).await, None);
	}
}
