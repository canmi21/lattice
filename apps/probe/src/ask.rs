//! One round of a check: the request or requests it makes, and what it makes of the answers.
//! Everything that crosses the network goes through `Http`, so the tests hand in a fake. See
//! spec/architecture/probe.md, "What is checked, and how often".

use crate::checks::{Check, Kind};
use crate::round::Outcome;
use bytes::Bytes;
use http_body_util::{BodyExt, Full, Limited};
use hyper::Request;
use hyper_rustls::HttpsConnector;
use hyper_util::client::legacy::Client;
use hyper_util::client::legacy::connect::HttpConnector;
use hyper_util::rt::TokioExecutor;
use serde_json::Value;
use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;
use std::time::Duration;
use url::Url;

/// The header the gateway and Cloudflare's rate rules leave uncounted. See
/// spec/architecture/probe.md, "The probe passes the limits it is checking through".
pub const PROBE_HEADER: &str = "x-probe";

/// The most of an answer's body read; every answer asked for here is a small JSON document.
const BODY_LIMIT: usize = 1 << 20;

/// How long to wait between two asks of a `202`, whatever the answer suggests.
const POLL: (u64, u64) = (1, 5);

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Answer {
	pub status: u16,
	pub location: Option<String>,
	pub retry_after: Option<u64>,
	pub body: Bytes,
}

pub type Asked = Pin<Box<dyn Future<Output = Result<Answer, String>> + Send>>;

/// How a request is sent: a GET, or a POST of a JSON body, which is how a task is started.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Method {
	Get,
	Post(Bytes),
}

/// A request and its answer; a fake one in the tests.
pub trait Http: Send + Sync + 'static {
	fn send(&self, method: &Method, url: &Url, headers: &[(&'static str, String)]) -> Asked;
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

impl Http for Network {
	fn send(&self, method: &Method, url: &Url, headers: &[(&'static str, String)]) -> Asked {
		let (verb, body) = match method {
			Method::Get => (hyper::Method::GET, Bytes::new()),
			Method::Post(body) => (hyper::Method::POST, body.clone()),
		};
		let mut builder = Request::builder().method(verb).uri(url.as_str());
		if matches!(method, Method::Post(_)) {
			builder = builder.header(hyper::header::CONTENT_TYPE, "application/json");
		}
		for (name, value) in headers {
			builder = builder.header(*name, value);
		}
		let request = builder.body(Full::new(body));
		let client = self.client.clone();
		Box::pin(async move {
			let answer = client.request(request.map_err(|error| error.to_string())?).await;
			let answer = answer.map_err(|error| error.to_string())?;
			let header = |name| answer.headers().get(name).and_then(|value| value.to_str().ok());
			let location = header(hyper::header::LOCATION).map(str::to_owned);
			let retry_after = header(hyper::header::RETRY_AFTER).and_then(|value| value.parse().ok());
			let status = answer.status().as_u16();
			let body = Limited::new(answer.into_body(), BODY_LIMIT).collect().await;
			let body = body.map_err(|error| error.to_string())?.to_bytes();
			Ok(Answer { status, location, retry_after, body })
		})
	}
}

/// What every round needs besides its check.
#[derive(Clone)]
pub struct Context {
	pub http: Arc<dyn Http>,
	/// `PROBE_TOKEN`, sent as `x-probe` on what goes to our public names, when it is set.
	pub token: Option<String>,
	/// shot's private scope, ending in `/`, which `page` asks.
	pub shot: Url,
	/// The resolvers a `dns` check asks, by name.
	pub resolvers: [(&'static str, Url); 2],
}

impl Context {
	pub fn new(http: Arc<dyn Http>, token: Option<String>) -> Self {
		let shot = Url::parse(&format!("{}/shot/", urls::INTERNAL_API_PRIVATE))
			.expect("the private API host is a URL");
		let resolver = |url| Url::parse(url).expect("a resolver is a URL");
		let resolvers = [
			("cloudflare", resolver(urls::EXTERNAL_DOH_CLOUDFLARE)),
			("google", resolver(urls::EXTERNAL_DOH_GOOGLE)),
		];
		Self { http, token, shot, resolvers }
	}

	/// `x-probe` for a request to one of our public names. Never sent to a resolver or to anything
	/// on the private side: the token is a secret, and only the gateway and Cloudflare read it.
	fn outside(&self) -> Vec<(&'static str, String)> {
		self.token.iter().map(|token| (PROBE_HEADER, token.clone())).collect()
	}
}

/// One round, bounded by the check's `within`.
pub async fn run(check: &Check, context: &Context) -> Outcome {
	let within = check.within();
	let round = async {
		match check.kind {
			Kind::Health => health(check, context).await,
			Kind::Api => api(check, context).await,
			Kind::Dns => dns(check, context).await,
			Kind::Page => page(check, context).await,
		}
	};
	match tokio::time::timeout(within, round).await {
		Ok(outcome) => outcome,
		Err(_) => Outcome::fail(format!("no answer within {} s", within.as_secs_f64())),
	}
}

/// Ask once; a request that does not reach anything is logged in full and said shortly.
async fn ask(
	context: &Context,
	check: &Check,
	method: &Method,
	url: &Url,
	headers: &[(&'static str, String)],
) -> Result<Answer, Outcome> {
	context.http.send(method, url, headers).await.map_err(|error| {
		eprintln!("probe: {}: {error}", check.id);
		Outcome::fail("unreachable")
	})
}

/// Ask as `first` says, and while the answer is `202` with a `Location`, wait and GET there.
async fn follow(
	context: &Context,
	check: &Check,
	first: &Method,
	mut url: Url,
	headers: &[(&'static str, String)],
) -> Result<Answer, Outcome> {
	let mut answer = ask(context, check, first, &url, headers).await?;
	// Only the first 202 names where to look; a later one, still queued, is asked again as it is.
	while answer.status == 202 {
		if let Some(location) = answer.location.as_deref() {
			url = url.join(location).map_err(|_| Outcome::fail("202 with a location that is no URL"))?;
		}
		let wait = answer.retry_after.unwrap_or(POLL.0).clamp(POLL.0, POLL.1);
		tokio::time::sleep(Duration::from_secs(wait)).await;
		answer = ask(context, check, &Method::Get, &url, headers).await?;
	}
	Ok(answer)
}

async fn health(check: &Check, context: &Context) -> Outcome {
	match ask(context, check, &Method::Get, &check.url, &[]).await {
		Ok(answer) => judge_http(check, &answer),
		Err(outcome) => outcome,
	}
}

async fn api(check: &Check, context: &Context) -> Outcome {
	let headers = context.outside();
	let answer = if check.expect.follow {
		follow(context, check, &check.method, check.url.clone(), &headers).await
	} else {
		ask(context, check, &check.method, &check.url, &headers).await
	};
	match answer {
		Ok(answer) => judge_http(check, &answer),
		Err(outcome) => outcome,
	}
}

/// The status, the envelope's `success`, and each field named, in that order.
pub fn judge_http(check: &Check, answer: &Answer) -> Outcome {
	let status = check.expect.status.unwrap_or(200);
	if answer.status != status {
		return Outcome::fail(format!("status {}", answer.status));
	}
	let wants_success = check.expect.success.unwrap_or(true);
	if !wants_success && check.expect.fields.is_empty() {
		return Outcome::pass();
	}
	let Ok(body) = serde_json::from_slice::<Value>(&answer.body) else {
		return Outcome::fail("not the envelope");
	};
	let succeeded = body["status"] == "success";
	if succeeded != wants_success {
		return match body["code"].as_str() {
			Some(code) if !succeeded => Outcome::fail(format!("error {code}")),
			_ => Outcome::fail(format!("success is {succeeded}")),
		};
	}
	for field in &check.expect.fields {
		if field_of(&body["data"], field).is_none_or(Value::is_null) {
			return Outcome::fail(format!("no {field}"));
		}
	}
	Outcome::pass()
}

/// A dotted path into a JSON value.
fn field_of<'a>(value: &'a Value, path: &str) -> Option<&'a Value> {
	path.split('.').try_fold(value, |value, key| value.get(key))
}

async fn dns(check: &Check, context: &Context) -> Outcome {
	let host = check.url.host_str().unwrap_or_default().to_owned();
	let record = check.expect.record.as_deref().unwrap_or("A");
	let headers = [("accept", "application/dns-json".to_owned())];
	let ask_one = |(name, resolver): &(&'static str, Url)| {
		let name = *name;
		let mut url = resolver.clone();
		url.query_pairs_mut().append_pair("name", &host).append_pair("type", record);
		let headers = &headers;
		async move {
			let found = match ask(context, check, &Method::Get, &url, headers).await {
				Ok(answer) if answer.status == 200 => {
					judge_dns(&answer.body, record, &check.expect.answers)
				}
				Ok(answer) => Err(format!("status {}", answer.status)),
				Err(_) => Err("unreachable".to_owned()),
			};
			found.map_err(|why| format!("{name}: {why}"))
		}
	};
	let [first, second] = &context.resolvers;
	let (first, second) = tokio::join!(ask_one(first), ask_one(second));
	let failed: Vec<String> = [first, second].into_iter().filter_map(Result::err).collect();
	if failed.is_empty() { Outcome::pass() } else { Outcome::fail(failed.join("; ")) }
}

/// A DoH JSON answer, Cloudflare's and Google's alike: `Status` 0, at least one answer of the type
/// asked, and every value the check names among them.
pub fn judge_dns(body: &[u8], record: &str, expected: &[String]) -> Result<(), String> {
	let body: Value = serde_json::from_slice(body).map_err(|_| "not a DoH answer".to_owned())?;
	let status = body["Status"].as_u64().unwrap_or(u64::MAX);
	if status != 0 {
		return Err(format!("rcode {status}"));
	}
	let number = if record == "AAAA" { 28 } else { 1 };
	let values: Vec<&str> = body["Answer"]
		.as_array()
		.into_iter()
		.flatten()
		.filter(|answer| answer["type"].as_u64() == Some(number))
		.filter_map(|answer| answer["data"].as_str())
		.collect();
	if values.is_empty() {
		return Err(format!("no {record} answer"));
	}
	match expected.iter().find(|value| !values.contains(&value.as_str())) {
		Some(missing) => Err(format!("{missing} not among the answers")),
		None => Ok(()),
	}
}

/// What shot is asked to start for a page: the page as its parts, each alone, and fresh, as
/// `POST /v1/tasks` takes them. See spec/architecture/shot.md, "Asking for one".
pub fn capture_body(page: &Url) -> Bytes {
	let mut target = serde_json::Map::new();
	target.insert("scheme".into(), page.scheme().into());
	target.insert("host".into(), page.host_str().unwrap_or_default().into());
	if let Some(port) = page.port() {
		target.insert("port".into(), port.into());
	}
	let path = page.path().trim_start_matches('/');
	if !path.is_empty() {
		target.insert("path".into(), path.into());
	}
	let mut query = serde_json::Map::new();
	for (name, value) in page.query_pairs() {
		let values = query.entry(name.into_owned()).or_insert_with(|| Value::Array(Vec::new()));
		if let Value::Array(values) = values {
			values.push(value.into_owned().into());
		}
	}
	if !query.is_empty() {
		target.insert("query".into(), query.into());
	}
	if let Some(hash) = page.fragment() {
		target.insert("hash".into(), hash.into());
	}
	serde_json::json!({ "target": target, "access": { "fresh": true } }).to_string().into()
}

async fn page(check: &Check, context: &Context) -> Outcome {
	let tasks = context.shot.join("v1/tasks").expect("a relative path joins");
	let started = Method::Post(capture_body(&check.url));
	match follow(context, check, &started, tasks, &[]).await {
		Ok(answer) => judge_page(check, &answer),
		Err(outcome) => outcome,
	}
}

/// A done capture: the document's status, and the page's errors and failed requests.
pub fn judge_page(check: &Check, answer: &Answer) -> Outcome {
	let Ok(body) = serde_json::from_slice::<Value>(&answer.body) else {
		return Outcome::fail(format!("shot answered status {}", answer.status));
	};
	if answer.status != 200 || body["status"] != "success" {
		return match body["code"].as_str() {
			Some(code) => Outcome::fail(format!("shot: {code}")),
			None => Outcome::fail(format!("shot answered status {}", answer.status)),
		};
	}
	let data = &body["data"];
	let expected = check.expect.status.unwrap_or(200);
	match data["page"]["status"].as_u64() {
		Some(status) if status == u64::from(expected) => {}
		Some(status) => return Outcome::fail(format!("status {status}")),
		None => return Outcome::fail("no document status"),
	}
	let counted = [
		("errors", &data["health"]["errors"], check.expect.errors),
		("failed requests", &data["health"]["failed_requests"], check.expect.failed_requests),
	];
	for (name, found, most) in counted {
		if let Some(most) = most
			&& let Some(found) = found.as_u64()
			&& found > most
		{
			return Outcome::fail(format!("{found} {name}"));
		}
	}
	Outcome::pass()
}

#[cfg(test)]
mod tests {
	use super::*;
	use crate::checks::parse;
	use std::collections::HashMap;
	use std::sync::Mutex;

	type Headers = Vec<(&'static str, String)>;

	/// Answers by the whole URL, and remembers every ask with its headers.
	#[derive(Default)]
	struct Fake {
		answers: HashMap<String, Answer>,
		/// Answered first, one each time the URL is asked, before `answers` takes over.
		queued: Mutex<HashMap<String, Vec<Answer>>>,
		asked: Mutex<Vec<(String, Headers)>>,
		/// Each ask's method, in order.
		methods: Mutex<Vec<Method>>,
	}

	impl Http for Fake {
		fn send(&self, method: &Method, url: &Url, headers: &[(&'static str, String)]) -> Asked {
			self.asked.lock().unwrap().push((url.to_string(), headers.to_vec()));
			self.methods.lock().unwrap().push(method.clone());
			let queued = self
				.queued
				.lock()
				.unwrap()
				.get_mut(url.as_str())
				.and_then(|queue| (!queue.is_empty()).then(|| queue.remove(0)));
			let answer = queued.or_else(|| self.answers.get(url.as_str()).cloned());
			Box::pin(async move { answer.ok_or_else(|| "connection refused".to_owned()) })
		}
	}

	fn answer(status: u16, body: Value) -> Answer {
		Answer { status, location: None, retry_after: None, body: body.to_string().into() }
	}

	fn one(source: &str) -> Check {
		parse(source).unwrap().remove(0)
	}

	#[tokio::test]
	async fn health_wants_200_and_success_and_sends_no_token() {
		let check = one(
			r#"[[check]]
			id = "h"
			name = "Test h"
			kind = "health"
			target = "API_PRIVATE/geo/health"
			interval = 5"#,
		);
		let mut fake = Fake::default();
		fake.answers.insert(
			check.url.to_string(),
			answer(200, serde_json::json!({"status": "success", "data": null})),
		);
		let fake = Arc::new(fake);
		let context = Context::new(fake.clone(), Some("secret".into()));
		assert_eq!(run(&check, &context).await, Outcome::pass());
		assert!(fake.asked.lock().unwrap()[0].1.is_empty());
	}

	#[tokio::test]
	async fn api_carries_the_token_follows_and_judges_fields() {
		let check = one(
			r#"[[check]]
			id = "a"
			name = "Test a"
			kind = "api"
			target = "API_PUBLIC/shot/capture?host=canmi.net"
			interval = 3600
			expect = { follow = true, fields = ["page.status"] }"#,
		);
		let mut fake = Fake::default();
		let mut first = answer(202, serde_json::json!({"status": "success", "data": {}}));
		first.location = Some("status?task=1".into());
		first.retry_after = Some(0);
		fake.answers.insert(check.url.to_string(), first);
		let done = serde_json::json!({"status": "success", "data": {"page": {"status": 200}}});
		fake
			.answers
			.insert(format!("{}/shot/status?task=1", urls::INTERNAL_API_PUBLIC), answer(200, done));
		let fake = Arc::new(fake);
		let context = Context::new(fake.clone(), Some("secret".into()));
		assert_eq!(run(&check, &context).await, Outcome::pass());
		let asked = fake.asked.lock().unwrap().clone();
		assert_eq!(asked.len(), 2);
		assert!(asked.iter().all(|(_, headers)| headers == &[(PROBE_HEADER, "secret".to_owned())]));

		let context = Context::new(Arc::new(Fake::default()), None);
		assert_eq!(run(&check, &context).await, Outcome::fail("unreachable"));
	}

	#[tokio::test]
	async fn api_starts_a_task_by_post_and_follows_it_by_get() {
		let check = one(
			r#"[[check]]
			id = "a"
			name = "Test a"
			kind = "api"
			target = "API_PUBLIC/shot/v1/tasks"
			method = "POST"
			body = '{"target":{"host":"canmi.net"}}'
			interval = 3600
			expect = { follow = true, fields = ["page.status"] }"#,
		);
		let mut fake = Fake::default();
		let mut first = answer(202, serde_json::json!({"status": "success", "data": {}}));
		first.location = Some("tasks/1".into());
		first.retry_after = Some(0);
		fake.answers.insert(check.url.to_string(), first);
		let done = serde_json::json!({"status": "success", "data": {"page": {"status": 200}}});
		fake.answers.insert(format!("{}/shot/v1/tasks/1", urls::INTERNAL_API_PUBLIC), answer(200, done));
		let fake = Arc::new(fake);
		let context = Context::new(fake.clone(), None);
		assert_eq!(run(&check, &context).await, Outcome::pass());
		let methods = fake.methods.lock().unwrap().clone();
		assert_eq!(methods, [Method::Post(r#"{"target":{"host":"canmi.net"}}"#.into()), Method::Get]);
	}

	#[tokio::test]
	async fn a_later_202_without_a_location_is_asked_again_where_it_is() {
		let check = one(
			r#"[[check]]
			id = "a"
			name = "Test a"
			kind = "api"
			target = "API_PUBLIC/shot/capture?host=canmi.net"
			interval = 3600
			expect = { follow = true, fields = ["page.status"] }"#,
		);
		let mut fake = Fake::default();
		let mut first = answer(202, serde_json::json!({"status": "success", "data": {}}));
		first.location = Some("status?task=1".into());
		first.retry_after = Some(0);
		fake.answers.insert(check.url.to_string(), first);
		let status = format!("{}/shot/status?task=1", urls::INTERNAL_API_PUBLIC);
		let rendering = answer(202, serde_json::json!({"status": "success", "data": {}}));
		fake.queued.lock().unwrap().insert(status.clone(), vec![rendering]);
		let done = serde_json::json!({"status": "success", "data": {"page": {"status": 200}}});
		fake.answers.insert(status.clone(), answer(200, done));
		let fake = Arc::new(fake);
		let context = Context::new(fake.clone(), Some("secret".into()));
		assert_eq!(run(&check, &context).await, Outcome::pass());
		let asked: Vec<String> =
			fake.asked.lock().unwrap().iter().map(|(url, _)| url.clone()).collect();
		assert_eq!(asked, [check.url.to_string(), status.clone(), status]);
	}

	#[test]
	fn an_answer_is_judged_by_status_envelope_and_fields() {
		let check = one(
			r#"[[check]]
			id = "a"
			name = "Test a"
			kind = "api"
			target = "API_PUBLIC/geo/ip"
			interval = 30
			expect = { fields = ["credit", "place.city"] }"#,
		);
		let good =
			serde_json::json!({"status": "success", "data": {"credit": "x", "place": {"city": "y"}}});
		assert_eq!(judge_http(&check, &answer(200, good)), Outcome::pass());
		assert_eq!(judge_http(&check, &answer(502, Value::Null)), Outcome::fail("status 502"));
		let refused = serde_json::json!({"status": "error", "code": "rate_limited", "message": "m"});
		assert_eq!(judge_http(&check, &answer(200, refused)), Outcome::fail("error rate_limited"));
		let short =
			serde_json::json!({"status": "success", "data": {"credit": "x", "place": {"city": null}}});
		assert_eq!(judge_http(&check, &answer(200, short)), Outcome::fail("no place.city"));
	}

	#[tokio::test]
	async fn dns_asks_both_resolvers_and_names_the_one_that_failed() {
		let check = one(
			r#"[[check]]
			id = "d"
			name = "Test d"
			kind = "dns"
			target = "APPS_PRODUCTION_SITE"
			interval = 60"#,
		);
		let context = Context::new(Arc::new(Fake::default()), Some("secret".into()));
		let mut fake = Fake::default();
		for (name, resolver) in &context.resolvers {
			let mut url = resolver.clone();
			url.query_pairs_mut().append_pair("name", "canmi.net").append_pair("type", "A");
			let body = if *name == "cloudflare" {
				serde_json::json!({"Status": 0, "Answer": [{"type": 1, "data": "104.21.0.1"}]})
			} else {
				serde_json::json!({"Status": 2})
			};
			fake.answers.insert(url.to_string(), answer(200, body));
		}
		let fake = Arc::new(fake);
		let context = Context::new(fake.clone(), Some("secret".into()));
		assert_eq!(run(&check, &context).await, Outcome::fail("google: rcode 2"));
		// A resolver is not ours: the token never goes to one.
		assert!(
			fake
				.asked
				.lock()
				.unwrap()
				.iter()
				.all(|(_, headers)| headers.iter().all(|(name, _)| *name != PROBE_HEADER))
		);
	}

	#[test]
	fn a_doh_answer_needs_the_type_and_every_value_named() {
		let body = serde_json::json!({"Status": 0, "Answer": [
			{"type": 5, "data": "alias."}, {"type": 1, "data": "192.0.2.1"}
		]})
		.to_string();
		assert_eq!(judge_dns(body.as_bytes(), "A", &[]), Ok(()));
		assert_eq!(judge_dns(body.as_bytes(), "AAAA", &[]), Err("no AAAA answer".into()));
		assert_eq!(judge_dns(body.as_bytes(), "A", &["192.0.2.1".into()]), Ok(()));
		assert!(judge_dns(body.as_bytes(), "A", &["192.0.2.2".into()]).is_err());
	}

	#[test]
	fn a_page_is_asked_of_shot_as_its_parts_and_fresh() {
		let site = Url::parse(urls::APPS_PRODUCTION_SITE).unwrap();
		let host = site.host_str().unwrap();
		let mut page = site.join("a/b?x=1&x=2#top").unwrap();
		page.set_port(Some(8443)).unwrap();
		let body: Value = serde_json::from_slice(&capture_body(&page)).unwrap();
		assert_eq!(
			body,
			serde_json::json!({
				"target": {
					"scheme": "https", "host": host, "port": 8443, "path": "a/b",
					"query": { "x": ["1", "2"] }, "hash": "top"
				},
				"access": { "fresh": true }
			})
		);
		let bare: Value = serde_json::from_slice(&capture_body(&site)).unwrap();
		assert_eq!(bare["target"], serde_json::json!({ "scheme": "https", "host": host }));
	}

	#[test]
	fn a_done_capture_is_judged_by_status_errors_and_failures() {
		let check = one(
			r#"[[check]]
			id = "p"
			name = "Test p"
			kind = "page"
			target = "APPS_PRODUCTION_SITE"
			interval = 60
			expect = { errors = 0, failed_requests = 1 }"#,
		);
		let done = |status: u64, errors: u64, failed: u64| {
			answer(
				200,
				serde_json::json!({"status": "success", "data": {
					"page": {"status": status}, "health": {"errors": errors, "failed_requests": failed}
				}}),
			)
		};
		assert_eq!(judge_page(&check, &done(200, 0, 1)), Outcome::pass());
		assert_eq!(judge_page(&check, &done(404, 0, 0)), Outcome::fail("status 404"));
		assert_eq!(judge_page(&check, &done(200, 2, 0)), Outcome::fail("2 errors"));
		assert_eq!(judge_page(&check, &done(200, 0, 3)), Outcome::fail("3 failed requests"));
		let failed = serde_json::json!({"status": "error", "code": "page_unavailable", "message": "m"});
		assert_eq!(judge_page(&check, &answer(502, failed)), Outcome::fail("shot: page_unavailable"));
	}
}
