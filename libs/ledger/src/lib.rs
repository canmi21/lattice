//! The ledger's record of one task, and the client every service hands its records to. A record is
//! handed over and the call returns at once; a background task sends it, keeps what could not be
//! sent in a bounded queue with the oldest dropped first, and tries again with backoff. A ledger
//! that is down costs records, never the work. See spec/architecture/ledger.md.

use bytes::Bytes;
use http_body_util::Full;
use hyper::{Method, Request};
use hyper_util::client::legacy::Client;
use hyper_util::client::legacy::connect::HttpConnector;
use hyper_util::rt::TokioExecutor;
use jiff::Timestamp;
use serde::{Deserialize, Serialize};
use std::collections::VecDeque;
use std::time::Duration;
use tokio::sync::mpsc;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum State {
	Queued,
	Running,
	Done,
	Failed,
}

/// Who asked: the public, as the gateway marked the request, or one of ours.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Caller {
	Public,
	Ours,
}

/// One task as its service sees it now; the ledger keeps the latest it was sent.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Record {
	pub service: String,
	pub id: String,
	/// What was asked, in the service's own words: `capture`.
	pub kind: String,
	pub state: State,
	pub caller: Caller,
	pub asked_at: Timestamp,
	#[serde(default, skip_serializing_if = "Option::is_none")]
	pub started_at: Option<Timestamp>,
	#[serde(default, skip_serializing_if = "Option::is_none")]
	pub finished_at: Option<Timestamp>,
	/// A small object the service chooses: for `shot`, the page's URL.
	#[serde(default)]
	pub summary: serde_json::Value,
	/// Why it failed, when it did.
	#[serde(default, skip_serializing_if = "Option::is_none")]
	pub detail: Option<String>,
}

/// A record as the ledger answers with it: what was sent, and when the ledger last took it.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Stored {
	#[serde(flatten)]
	pub record: Record,
	pub updated_at: Timestamp,
}

/// How many records wait while the ledger cannot be reached; past it the oldest is dropped.
pub const WAITING: usize = 1000;

/// The first wait after a failed send, doubled each time up to the last.
const BACKOFF: (Duration, Duration) = (Duration::from_secs(1), Duration::from_secs(60));

/// The handle a service keeps: cheap to clone, and never waits.
#[derive(Clone)]
pub struct Ledger {
	sender: mpsc::UnboundedSender<Record>,
}

impl Ledger {
	/// Start sending to the ledger at `base`: `LEDGER_URL` when it is set, the platform's ledger
	/// otherwise. Needs a Tokio runtime.
	pub fn start() -> Self {
		let base = std::env::var("LEDGER_URL").unwrap_or_else(|_| urls::INTERNAL_LEDGER.to_owned());
		Self::to(base)
	}

	pub fn to(base: String) -> Self {
		let (sender, receiver) = mpsc::unbounded_channel();
		tokio::spawn(deliver(base.trim_end_matches('/').to_owned(), receiver));
		Self { sender }
	}

	/// Hand a record over. It is sent in the background, and a record that cannot be is lost
	/// rather than waited for.
	pub fn record(&self, record: Record) {
		let _ = self.sender.send(record);
	}
}

/// Keep at most `WAITING`, the oldest going first.
fn keep(waiting: &mut VecDeque<Record>, record: Record) {
	waiting.push_back(record);
	while waiting.len() > WAITING {
		waiting.pop_front();
	}
}

async fn deliver(base: String, mut receiver: mpsc::UnboundedReceiver<Record>) {
	// Roots compiled in rather than read from the system: an image built from scratch has none.
	let https = hyper_rustls::HttpsConnectorBuilder::new()
		.with_webpki_roots()
		.https_or_http()
		.enable_http1()
		.build();
	let client: Client<hyper_rustls::HttpsConnector<HttpConnector>, Full<Bytes>> =
		Client::builder(TokioExecutor::new()).build(https);
	let mut waiting = VecDeque::new();
	let mut backoff = BACKOFF.0;
	loop {
		if waiting.is_empty() {
			match receiver.recv().await {
				Some(record) => keep(&mut waiting, record),
				None => return,
			}
		}
		while let Ok(record) = receiver.try_recv() {
			keep(&mut waiting, record);
		}
		let Some(record) = waiting.front() else { continue };
		if send(&client, &base, record).await {
			waiting.pop_front();
			backoff = BACKOFF.0;
			continue;
		}
		// Waiting out the backoff, while what arrives meanwhile still queues.
		let until = tokio::time::Instant::now() + backoff;
		loop {
			tokio::select! {
				() = tokio::time::sleep_until(until) => break,
				arrived = receiver.recv() => match arrived {
					Some(record) => keep(&mut waiting, record),
					None => break,
				},
			}
		}
		backoff = (backoff * 2).min(BACKOFF.1);
	}
}

async fn send(
	client: &Client<hyper_rustls::HttpsConnector<HttpConnector>, Full<Bytes>>,
	base: &str,
	record: &Record,
) -> bool {
	let Ok(body) = serde_json::to_vec(record) else { return true };
	let uri = format!("{base}/tasks/{}/{}", record.service, record.id);
	let Ok(request) = Request::builder()
		.method(Method::PUT)
		.uri(uri)
		.header("content-type", "application/json")
		.body(Full::new(Bytes::from(body)))
	else {
		return true;
	};
	match tokio::time::timeout(Duration::from_secs(10), client.request(request)).await {
		// A refusal is the ledger's answer about this record, and sending it again would not change
		// it; only a failure to reach the ledger is tried again.
		Ok(Ok(answer)) => !answer.status().is_server_error(),
		_ => false,
	}
}

#[cfg(test)]
mod tests {
	use super::*;

	fn record(id: &str) -> Record {
		Record {
			service: "shot".into(),
			id: id.into(),
			kind: "capture".into(),
			state: State::Queued,
			caller: Caller::Public,
			asked_at: "2026-09-28T12:00:00Z".parse().unwrap(),
			started_at: None,
			finished_at: None,
			summary: serde_json::json!({ "url": "https://example.com/" }),
			detail: None,
		}
	}

	#[test]
	fn a_record_reads_as_the_ledger_documents_it() {
		let text = serde_json::to_string(&record("a")).unwrap();
		assert_eq!(
			text,
			r#"{"service":"shot","id":"a","kind":"capture","state":"queued","caller":"public","asked_at":"2026-09-28T12:00:00Z","summary":{"url":"https://example.com/"}}"#
		);
		assert_eq!(serde_json::from_str::<Record>(&text).unwrap(), record("a"));
	}

	#[test]
	fn keeps_the_newest_when_too_many_wait() {
		let mut waiting = VecDeque::new();
		for n in 0..WAITING + 3 {
			keep(&mut waiting, record(&n.to_string()));
		}
		assert_eq!(waiting.len(), WAITING);
		assert_eq!(waiting.front().unwrap().id, "3");
	}
}
