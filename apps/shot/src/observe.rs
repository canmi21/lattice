//! What a page did while it was captured, heard from the browser as it happened: where the address
//! led, what the document was and how it was carried, how much the page asked for, and what went
//! wrong in it. Listened for before the page is asked for, and told once it is taken. See
//! spec/architecture/shot.md, "What an answer tells".

use chromiumoxide::Page;
use chromiumoxide::cdp::browser_protocol::network::{
	EventLoadingFailed, EventLoadingFinished, EventRequestWillBeSent, EventResponseReceived,
	RequestId, ResourceType, Response,
};
use chromiumoxide::cdp::js_protocol::runtime::EventExceptionThrown;
use futures_util::StreamExt;
use serde_json::{Value, json};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tokio::task::JoinHandle;

/// How `resources` groups a response, as the browser names its type. `Fetch` stands for both of
/// CDP's `XHR` and `Fetch`, and `Other` for everything this service does not otherwise name. See
/// spec/architecture/shot.md, "What an answer tells".
#[derive(Clone, Copy, PartialEq, Eq, Hash)]
enum Kind {
	Document,
	Script,
	Stylesheet,
	Font,
	Image,
	Media,
	Fetch,
	Other,
}

/// Every kind `resources` reports, so one built from it always has all eight, even at zero.
const KINDS: [Kind; 8] = [
	Kind::Document,
	Kind::Script,
	Kind::Stylesheet,
	Kind::Font,
	Kind::Image,
	Kind::Media,
	Kind::Fetch,
	Kind::Other,
];

impl Kind {
	fn of(resource: Option<ResourceType>) -> Self {
		match resource {
			Some(ResourceType::Document) => Kind::Document,
			Some(ResourceType::Script) => Kind::Script,
			Some(ResourceType::Stylesheet) => Kind::Stylesheet,
			Some(ResourceType::Font) => Kind::Font,
			Some(ResourceType::Image) => Kind::Image,
			Some(ResourceType::Media) => Kind::Media,
			Some(ResourceType::Xhr | ResourceType::Fetch) => Kind::Fetch,
			_ => Kind::Other,
		}
	}

	fn name(self) -> &'static str {
		match self {
			Kind::Document => "document",
			Kind::Script => "script",
			Kind::Stylesheet => "stylesheet",
			Kind::Font => "font",
			Kind::Image => "image",
			Kind::Media => "media",
			Kind::Fetch => "fetch",
			Kind::Other => "other",
		}
	}
}

#[derive(Default)]
struct Heard {
	/// The page's own request, the first document asked for.
	main: Option<RequestId>,
	/// Each address the page was sent on from, with the status that sent it.
	redirects: Vec<Value>,
	document: Option<Response>,
	requests: u64,
	bytes: f64,
	failed: u64,
	errors: u64,
	/// Each request's kind, known as it is sent, so `loadingFinished` can add its bytes to it.
	kinds: HashMap<RequestId, Kind>,
	/// Counts and bytes by kind, `resources` in `load`. A kind with nothing in it is left out here
	/// and read as zero when `resources` is built, rather than kept for every kind unused.
	resources: HashMap<Kind, (u64, f64)>,
}

pub struct Observer {
	heard: Arc<Mutex<Heard>>,
	listening: Vec<JoinHandle<()>>,
}

fn hear(heard: &Arc<Mutex<Heard>>) -> std::sync::MutexGuard<'_, Heard> {
	heard.lock().unwrap_or_else(std::sync::PoisonError::into_inner)
}

impl Observer {
	/// Start listening; before the page is asked for, or its first request is missed.
	pub async fn listen(page: &Page) -> Result<Self, String> {
		let heard = Arc::new(Mutex::new(Heard::default()));
		let fault = |error: chromiumoxide::error::CdpError| error.to_string();
		let mut listening = Vec::new();

		let mut sent = page.event_listener::<EventRequestWillBeSent>().await.map_err(fault)?;
		let into = heard.clone();
		listening.push(tokio::spawn(async move {
			while let Some(event) = sent.next().await {
				let mut heard = hear(&into);
				heard.requests += 1;
				if heard.main.is_none() && event.r#type == Some(ResourceType::Document) {
					heard.main = Some(event.request_id.clone());
				}
				if heard.main.as_ref() == Some(&event.request_id)
					&& let Some(from) = &event.redirect_response
				{
					heard.redirects.push(json!({ "url": from.url, "status": from.status }));
				}
				// Known now, so `loadingFinished` can add this request's bytes to its kind.
				let kind = Kind::of(event.r#type.clone());
				heard.kinds.insert(event.request_id.clone(), kind);
				heard.resources.entry(kind).or_default().0 += 1;
			}
		}));

		let mut answered = page.event_listener::<EventResponseReceived>().await.map_err(fault)?;
		let into = heard.clone();
		listening.push(tokio::spawn(async move {
			while let Some(event) = answered.next().await {
				let mut heard = hear(&into);
				if heard.main.as_ref() == Some(&event.request_id) {
					heard.document = Some(event.response.clone());
				}
			}
		}));

		let mut finished = page.event_listener::<EventLoadingFinished>().await.map_err(fault)?;
		let into = heard.clone();
		listening.push(tokio::spawn(async move {
			while let Some(event) = finished.next().await {
				let mut heard = hear(&into);
				heard.bytes += event.encoded_data_length;
				let kind = heard.kinds.get(&event.request_id).copied().unwrap_or(Kind::Other);
				heard.resources.entry(kind).or_default().1 += event.encoded_data_length;
			}
		}));

		let mut failed = page.event_listener::<EventLoadingFailed>().await.map_err(fault)?;
		let into = heard.clone();
		listening.push(tokio::spawn(async move {
			while let Some(event) = failed.next().await {
				// A request the page itself called off did not fail.
				if event.canceled != Some(true) {
					hear(&into).failed += 1;
				}
			}
		}));

		let mut thrown = page.event_listener::<EventExceptionThrown>().await.map_err(fault)?;
		let into = heard.clone();
		listening.push(tokio::spawn(async move {
			while thrown.next().await.is_some() {
				hear(&into).errors += 1;
			}
		}));

		Ok(Self { heard, listening })
	}

	/// The document's status, once a response for the page's own request has come back; `None`
	/// before then. See spec/architecture/shot.md, "What an answer tells".
	pub fn status(&self) -> Option<i64> {
		hear(&self.heard).document.as_ref().map(|document| document.status)
	}

	/// Stop listening, and tell what was heard beside what the page says of itself.
	pub fn tell(self, facts: &Value, resolving_ms: u64) -> Value {
		for listener in &self.listening {
			listener.abort();
		}
		let heard = hear(&self.heard);
		let document = heard.document.as_ref();
		let timing = &facts["timing"];
		let security = document.and_then(|document| document.security_details.as_ref());
		json!({
			"page": {
				"url": document.map(|document| document.url.clone()),
				"redirects": heard.redirects,
				"status": document.map(|document| document.status),
				"type": document.map(|document| document.mime_type.clone()),
				"title": facts["title"],
				"description": facts["description"],
				"language": facts["language"],
				"width": facts["width"],
				"height": facts["height"],
			},
			"load": {
				"dns_ms": resolving_ms,
				"connect_ms": timing["connect_ms"],
				"tls_ms": timing["tls_ms"],
				"first_byte_ms": timing["first_byte_ms"],
				"dom_content_loaded_ms": timing["dom_content_loaded_ms"],
				"load_ms": timing["load_ms"],
				"requests": heard.requests,
				"bytes": heard.bytes.round() as u64,
				"resources": resources(&heard),
			},
			"connection": {
				"protocol": document.and_then(|document| document.protocol.clone()),
				"tls": security.map(|security| json!({
					"protocol": security.protocol,
					"cipher": security.cipher,
					"issuer": security.issuer,
					"subject": security.subject_name,
					"valid_from": moment(*security.valid_from.inner()),
					"valid_to": moment(*security.valid_to.inner()),
				})),
			},
			"health": { "errors": heard.errors, "failed_requests": heard.failed },
		})
	}
}

/// `resources`: counts and bytes by kind, every kind present even where nothing of it was heard.
fn resources(heard: &Heard) -> Value {
	KINDS
		.iter()
		.map(|&kind| {
			let (count, bytes) = heard.resources.get(&kind).copied().unwrap_or_default();
			(kind.name().to_owned(), json!({ "count": count, "bytes": bytes.round() as u64 }))
		})
		.collect::<serde_json::Map<String, Value>>()
		.into()
}

/// Seconds since the epoch, as the instant a person reads.
fn moment(seconds: f64) -> Option<jiff::Timestamp> {
	jiff::Timestamp::from_second(seconds as i64).ok()
}

/// What the page says of itself once loaded, asked in one evaluation. Timings are milliseconds from
/// the navigation's start, rounded, or null where the browser has none.
pub const FACTS: &str = r#"(() => {
	const d = document;
	const nav = performance.getEntriesByType('navigation')[0];
	const meta = d.querySelector('meta[name="description"]');
	const ms = (value) => (value > 0 ? Math.round(value) : null);
	return {
		title: d.title || null,
		description: meta ? meta.getAttribute('content') : null,
		language: d.documentElement.lang || null,
		width: Math.max(d.documentElement.scrollWidth, d.body ? d.body.scrollWidth : 0),
		height: Math.max(d.documentElement.scrollHeight, d.body ? d.body.scrollHeight : 0),
		timing: nav ? {
			connect_ms: ms(nav.connectEnd - nav.connectStart),
			tls_ms: nav.secureConnectionStart > 0 ? ms(nav.connectEnd - nav.secureConnectionStart) : null,
			first_byte_ms: ms(nav.responseStart - nav.startTime),
			dom_content_loaded_ms: ms(nav.domContentLoadedEventEnd - nav.startTime),
			load_ms: ms(nav.loadEventEnd - nav.startTime),
		} : null,
	};
})()"#;

#[cfg(test)]
mod tests {
	use super::*;

	/// `resources` groups by what CDP names the response, `XHR` and `Fetch` as one and everything
	/// else this service does not otherwise name as `other`.
	#[test]
	fn a_kind_is_named_as_resources_groups_it() {
		assert_eq!(Kind::of(Some(ResourceType::Document)).name(), "document");
		assert_eq!(Kind::of(Some(ResourceType::Xhr)).name(), "fetch");
		assert_eq!(Kind::of(Some(ResourceType::Fetch)).name(), "fetch");
		assert_eq!(Kind::of(Some(ResourceType::WebSocket)).name(), "other");
		assert_eq!(Kind::of(None).name(), "other");
	}

	/// Every kind is present at zero, and a request's bytes reach the kind it was sent as, matched
	/// by its request id from `requestWillBeSent` to `loadingFinished`.
	#[test]
	fn resources_sums_bytes_by_the_kind_each_request_was_sent_as() {
		let mut heard = Heard::default();
		// `requestWillBeSent`: the kind is known and counted as soon as the request is sent.
		for (id, resource) in [
			("doc", Some(ResourceType::Document)),
			("js", Some(ResourceType::Script)),
			("xhr", Some(ResourceType::Xhr)),
		] {
			let kind = Kind::of(resource);
			heard.kinds.insert(RequestId::new(id), kind);
			heard.resources.entry(kind).or_default().0 += 1;
		}
		// `loadingFinished`: its bytes reach the kind its request was sent as.
		for (id, bytes) in [("doc", 100.), ("js", 250.), ("xhr", 50.)] {
			let kind = heard.kinds[&RequestId::new(id)];
			heard.resources.entry(kind).or_default().1 += bytes;
		}
		let resources = resources(&heard);
		assert_eq!(resources["document"], json!({ "count": 1, "bytes": 100 }));
		assert_eq!(resources["script"], json!({ "count": 1, "bytes": 250 }));
		assert_eq!(resources["fetch"], json!({ "count": 1, "bytes": 50 }));
		// Every kind is there, at zero, even one nothing was heard of.
		assert_eq!(resources["media"], json!({ "count": 0, "bytes": 0 }));
		assert_eq!(resources.as_object().unwrap().len(), 8);
	}
}
