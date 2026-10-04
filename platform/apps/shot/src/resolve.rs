//! Names to addresses, asked of Cloudflare's and Google's DNS over HTTPS rather than the system's
//! resolver, and held to what a capture may reach. See spec/architecture/shot.md, "Only public
//! addresses".

use crate::address;
use bytes::Bytes;
use http_body_util::{BodyExt, Empty};
use hyper_util::client::legacy::Client;
use hyper_util::client::legacy::connect::HttpConnector;
use hyper_util::rt::TokioExecutor;
use std::collections::HashMap;
use std::future::Future;
use std::net::IpAddr;
use std::sync::Mutex;
use std::time::{Duration, Instant};

/// Whether a capture may reach private addresses: ours may, when they ask; the public never.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Reach {
	Public,
	Internal,
}

pub trait Resolve: Send + Sync + 'static {
	/// Every address the name has; none when it has none. `Err` when nothing could be asked.
	fn resolve(&self, host: &str) -> impl Future<Output = Result<Vec<IpAddr>, String>> + Send;
}

/// How long an answer is trusted, at most, whatever its TTL says.
const LONGEST: Duration = Duration::from_secs(60);
/// How long one DoH server has to answer.
const ATTEMPT: Duration = Duration::from_secs(3);

/// A record's types, as DNS numbers them.
const A: u16 = 1;
const AAAA: u16 = 28;

#[derive(serde::Deserialize)]
struct Answered {
	#[serde(rename = "Status")]
	status: u32,
	#[serde(rename = "Answer", default)]
	answer: Vec<Record>,
}

#[derive(serde::Deserialize)]
struct Record {
	#[serde(rename = "type")]
	kind: u16,
	#[serde(rename = "TTL", default)]
	ttl: u64,
	data: String,
}

/// The addresses in one DoH answer in the JSON both servers speak, and the shortest TTL among them.
/// A name that does not exist is no addresses; a CNAME on the way is skipped for what it leads to.
pub fn addresses(json: &[u8]) -> Result<(Vec<IpAddr>, Duration), String> {
	let answered: Answered =
		serde_json::from_slice(json).map_err(|error| format!("An unreadable DNS answer: {error}"))?;
	// 0 is an answer and 3 is a name that does not exist; anything else is the server failing.
	if !matches!(answered.status, 0 | 3) {
		return Err(format!("DNS answered with status {}", answered.status));
	}
	let records: Vec<&Record> =
		answered.answer.iter().filter(|r| matches!(r.kind, A | AAAA)).collect();
	let ttl = records.iter().map(|record| record.ttl).min().unwrap_or(0);
	let found = records.iter().filter_map(|record| record.data.parse().ok()).collect();
	Ok((found, Duration::from_secs(ttl).min(LONGEST)))
}

pub struct Doh {
	client: Client<hyper_rustls::HttpsConnector<HttpConnector>, Empty<Bytes>>,
	servers: [&'static str; 2],
	remembered: Mutex<HashMap<String, (Instant, Vec<IpAddr>)>>,
}

impl Default for Doh {
	fn default() -> Self {
		Self::new()
	}
}

impl Doh {
	/// Roots compiled in rather than read from the system: an image built from scratch has none.
	pub fn new() -> Self {
		let https = hyper_rustls::HttpsConnectorBuilder::new()
			.with_webpki_roots()
			.https_only()
			.enable_http1()
			.build();
		Self {
			client: Client::builder(TokioExecutor::new()).build(https),
			servers: [monoflake::EXTERNAL_DOH_CLOUDFLARE, monoflake::EXTERNAL_DOH_GOOGLE],
			remembered: Mutex::default(),
		}
	}

	async fn ask(
		&self,
		server: &str,
		host: &str,
		kind: u16,
	) -> Result<(Vec<IpAddr>, Duration), String> {
		let uri = format!("{server}?name={host}&type={kind}");
		let request = hyper::Request::get(&uri)
			.header("accept", "application/dns-json")
			.body(Empty::new())
			.map_err(|error| error.to_string())?;
		let answer = tokio::time::timeout(ATTEMPT, self.client.request(request))
			.await
			.map_err(|_| format!("{server} did not answer in time"))?
			.map_err(|error| format!("{server}: {error}"))?;
		let body = answer.into_body().collect().await.map_err(|error| error.to_string())?.to_bytes();
		addresses(&body)
	}

	fn recall(&self, host: &str) -> Option<Vec<IpAddr>> {
		let remembered = self.remembered.lock().unwrap_or_else(std::sync::PoisonError::into_inner);
		remembered
			.get(host)
			.filter(|(until, _)| Instant::now() < *until)
			.map(|(_, found)| found.clone())
	}
}

impl Resolve for Doh {
	/// Both servers, both record types, at once; the union of what answered. One server failing is
	/// not a failure, since the other's addresses are held to the same rule.
	async fn resolve(&self, host: &str) -> Result<Vec<IpAddr>, String> {
		if let Some(found) = self.recall(host) {
			return Ok(found);
		}
		let asked = self.servers.iter().flat_map(|server| [A, AAAA].map(move |kind| (*server, kind)));
		let answers =
			futures_util::future::join_all(asked.map(|(server, kind)| self.ask(server, host, kind)))
				.await;
		let mut found = Vec::new();
		let mut shortest = LONGEST;
		let mut failures = Vec::new();
		for answer in answers {
			match answer {
				Ok((addresses, ttl)) => {
					shortest = shortest.min(ttl);
					found.extend(addresses);
				}
				Err(error) => failures.push(error),
			}
		}
		if failures.len() == 4 {
			return Err(failures.join("; "));
		}
		found.sort();
		found.dedup();
		let mut remembered = self.remembered.lock().unwrap_or_else(std::sync::PoisonError::into_inner);
		remembered.retain(|_, (until, _)| Instant::now() < *until);
		remembered.insert(host.to_owned(), (Instant::now() + shortest, found.clone()));
		Ok(found)
	}
}

/// Where a capture may connect for `host`, or why it may not, in words a caller may read.
pub async fn destination<R: Resolve>(
	resolver: &R,
	host: &str,
	reach: Reach,
) -> Result<Vec<IpAddr>, String> {
	let host = host.trim_start_matches('[').trim_end_matches(']');
	let found = match host.parse::<IpAddr>() {
		Ok(literal) => vec![literal],
		Err(_) => match (resolver.resolve(host).await, reach) {
			(Ok(found), _) if !found.is_empty() => found,
			// A name public DNS does not know -- a container's, a `.lan` -- is ours to ask the system.
			(_, Reach::Internal) => tokio::net::lookup_host((host, 0))
				.await
				.map(|found| found.map(|socket| socket.ip()).collect())
				.map_err(|_| format!("{host} does not resolve"))?,
			(Ok(_), Reach::Public) => return Err(format!("{host} does not resolve")),
			(Err(error), Reach::Public) => return Err(format!("{host} could not be resolved: {error}")),
		},
	};
	if reach == Reach::Public && !found.iter().all(|&found| address::public(found)) {
		return Err(format!("{host} is not a public address"));
	}
	if found.is_empty() {
		return Err(format!("{host} does not resolve"));
	}
	Ok(found)
}

#[cfg(test)]
pub mod tests {
	use super::*;

	/// Names from a table, as a DoH server would give them.
	pub struct Table(pub Vec<(&'static str, Vec<IpAddr>)>);

	impl Resolve for Table {
		async fn resolve(&self, host: &str) -> Result<Vec<IpAddr>, String> {
			Ok(
				self
					.0
					.iter()
					.find(|(name, _)| *name == host)
					.map(|(_, found)| found.clone())
					.unwrap_or_default(),
			)
		}
	}

	fn ip(text: &str) -> IpAddr {
		text.parse().unwrap()
	}

	#[test]
	fn reads_both_servers_answers() {
		let json = br#"{"Status":0,"Answer":[
			{"name":"www.example.com.","type":5,"TTL":300,"data":"example.com."},
			{"name":"example.com.","type":1,"TTL":120,"data":"93.184.216.34"},
			{"name":"example.com.","type":28,"TTL":30,"data":"2606:2800:220:1::248"}]}"#;
		let (found, ttl) = addresses(json).unwrap();
		assert_eq!(found, [ip("93.184.216.34"), ip("2606:2800:220:1::248")]);
		assert_eq!(ttl, Duration::from_secs(30));
		let missing = br#"{"Status":3}"#;
		assert!(addresses(missing).unwrap().0.is_empty());
		assert!(addresses(br#"{"Status":2}"#).is_err());
		// However long an answer says to keep it, a minute is the most.
		let long = br#"{"Status":0,"Answer":[{"type":1,"TTL":86400,"data":"1.1.1.1"}]}"#;
		assert_eq!(addresses(long).unwrap().1, LONGEST);
	}

	#[tokio::test]
	async fn the_public_reaches_public_addresses_alone() {
		let table = Table(vec![
			("open.test", vec![ip("93.184.216.34")]),
			("home.test", vec![ip("10.10.10.11")]),
			// One private address among public ones is still a way in.
			("mixed.test", vec![ip("93.184.216.34"), ip("127.0.0.1")]),
		]);
		assert_eq!(
			destination(&table, "open.test", Reach::Public).await,
			Ok(vec![ip("93.184.216.34")])
		);
		for host in ["home.test", "mixed.test", "127.0.0.1", "[::1]", "169.254.169.254", "nowhere.test"]
		{
			assert!(destination(&table, host, Reach::Public).await.is_err(), "{host}");
		}
		assert_eq!(
			destination(&table, "home.test", Reach::Internal).await,
			Ok(vec![ip("10.10.10.11")])
		);
		assert_eq!(destination(&table, "[::1]", Reach::Internal).await, Ok(vec![ip("::1")]));
		// A name public DNS does not know falls to the system's resolver, for ours alone.
		assert_eq!(
			destination(&table, "localhost", Reach::Internal)
				.await
				.map(|f| f.iter().all(|a| a.is_loopback())),
			Ok(true)
		);
		assert!(destination(&table, "localhost", Reach::Public).await.is_err());
	}

	/// Asks the real servers; run with `cargo test -p shot -- --ignored` on a machine with a network.
	#[tokio::test]
	#[ignore]
	async fn asks_cloudflare_and_google() {
		let doh = Doh::new();
		let found = doh.resolve("one.one.one.one").await.unwrap();
		assert!(found.contains(&ip("1.1.1.1")), "{found:?}");
		assert!(doh.recall("one.one.one.one").is_some());
		assert_eq!(doh.resolve("does-not-exist.invalid").await, Ok(vec![]));
	}
}
