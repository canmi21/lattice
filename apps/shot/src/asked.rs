//! What a capture is asked for, read from a GET's query or a POST's JSON and held to what the
//! service will do. Two requests asking the same are one capture. See spec/architecture/shot.md,
//! "Asking for one".

use url::Url;

/// The viewport's bounds, in CSS pixels: a phone's width at the least, a 4K screen's at the most.
pub const WIDTHS: std::ops::RangeInclusive<u32> = 320..=3840;
pub const HEIGHTS: std::ops::RangeInclusive<u32> = 240..=2160;
/// What a capture is when the query does not say.
pub const DEFAULT_WIDTH: u32 = 1280;
pub const DEFAULT_HEIGHT: u32 = 800;

/// How long the page may take to load, in milliseconds: what may be asked, and what is assumed.
pub const TIMEOUTS: std::ops::RangeInclusive<u32> = 1_000..=30_000;
pub const DEFAULT_TIMEOUT: u32 = 15_000;
/// How long to wait once it has loaded before the picture is taken, in milliseconds. Unasked, a
/// moment for what the load event set going to draw.
pub const DELAYS: std::ops::RangeInclusive<u32> = 100..=10_000;
pub const DEFAULT_DELAY: u32 = 210;

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct Asked {
	pub url: Url,
	pub width: u32,
	pub height: u32,
	/// The whole page rather than what the viewport shows.
	pub full: bool,
	/// Whether private addresses may be reached; only our own callers may ask it.
	pub internal: bool,
	/// Whether a certificate the browser would refuse is accepted: an https page's alone.
	pub insecure: bool,
	/// Whether the page runs scripts before it is captured; `false` takes it as it is without them.
	pub javascript: bool,
	/// Milliseconds the page may take to load.
	pub timeout: u32,
	/// Milliseconds between its loading and the picture.
	pub delay: u32,
}

/// An ask as it arrives, every field a string, so a malformed one is ours to name. The page is its
/// parts, each one part of its address, and its own query as the pairs it is made of, so a caller
/// never writes an address, or a query, inside another.
#[derive(Debug, Default)]
pub struct Query {
	pub scheme: Option<String>,
	pub host: Option<String>,
	pub port: Option<String>,
	pub path: Option<String>,
	/// The page's own query, name and value, in order; a name may come more than once.
	pub query: Vec<(String, String)>,
	pub hash: Option<String>,
	pub width: Option<String>,
	pub height: Option<String>,
	pub full: Option<String>,
	pub internal: Option<String>,
	pub timeout: Option<String>,
	pub delay: Option<String>,
	pub insecure: Option<String>,
	pub javascript: Option<String>,
}

/// Where a GET names the page's own query: `query.tab=readme` is the page's `tab=readme`.
pub const QUERY_PREFIX: &str = "query.";

impl Query {
	/// A GET's query, pair by pair as it was sent. A name this service does not read is left alone,
	/// and `query` itself, which once held the page's query whole, is refused rather than ignored.
	pub fn from_pairs(pairs: impl IntoIterator<Item = (String, String)>) -> Result<Self, Refused> {
		let mut query = Query::default();
		for (name, value) in pairs {
			if let Some(own) = name.strip_prefix(QUERY_PREFIX) {
				if own.is_empty() {
					return Err(Refused::Url);
				}
				query.query.push((own.to_owned(), value));
				continue;
			}
			let field = match name.as_str() {
				"scheme" => &mut query.scheme,
				"host" => &mut query.host,
				"port" => &mut query.port,
				"path" => &mut query.path,
				"hash" => &mut query.hash,
				"width" => &mut query.width,
				"height" => &mut query.height,
				"full" => &mut query.full,
				"internal" => &mut query.internal,
				"timeout" => &mut query.timeout,
				"delay" => &mut query.delay,
				"insecure" => &mut query.insecure,
				"javascript" => &mut query.javascript,
				"query" => return Err(Refused::Url),
				_ => continue,
			};
			*field = Some(value);
		}
		Ok(query)
	}

	/// A POST's body, the same ask in JSON's own types and grouped by what each part is about.
	pub fn from_body(body: Body) -> Self {
		let text = |value: Option<f64>| value.map(|value| value.to_string());
		let flag = |value: Option<bool>| value.map(|value| value.to_string());
		let number = |value: Option<u32>| value.map(|value| value.to_string());
		let Body { target, viewport, timing, access, browser } = body;
		let (target, viewport) = (target.unwrap_or_default(), viewport.unwrap_or_default());
		let (timing, access) = (timing.unwrap_or_default(), access.unwrap_or_default());
		let browser = browser.unwrap_or_default();
		Query {
			scheme: target.scheme,
			host: target.host,
			port: target.port.map(|port| port.to_string()),
			path: target.path,
			query: target.query.map(|pairs| pairs.0).unwrap_or_default(),
			hash: target.hash,
			width: number(viewport.width),
			height: number(viewport.height),
			full: flag(viewport.full),
			internal: flag(access.internal),
			timeout: text(timing.timeout),
			delay: text(timing.delay),
			insecure: flag(access.insecure),
			javascript: flag(browser.javascript),
		}
	}
}

/// A POST's JSON: the GET's fields in JSON's types, grouped -- the page, the viewport, the waiting,
/// what the capture may reach -- and the page's query an object whose values are a string or
/// several. A field this service does not know is refused, at every level, since it would
/// otherwise be silently not what the caller meant.
#[derive(Debug, serde::Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Body {
	pub target: Option<Target>,
	pub viewport: Option<Viewport>,
	pub timing: Option<Timing>,
	pub access: Option<Access>,
	pub browser: Option<Browser>,
}

#[derive(Debug, Default, serde::Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Target {
	pub scheme: Option<String>,
	pub host: Option<String>,
	pub port: Option<u16>,
	pub path: Option<String>,
	pub query: Option<Pairs>,
	pub hash: Option<String>,
}

#[derive(Debug, Default, serde::Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Viewport {
	pub width: Option<u32>,
	pub height: Option<u32>,
	pub full: Option<bool>,
}

/// Seconds, to one decimal place.
#[derive(Debug, Default, serde::Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Timing {
	pub timeout: Option<f64>,
	pub delay: Option<f64>,
}

#[derive(Debug, Default, serde::Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Access {
	pub insecure: Option<bool>,
	pub internal: Option<bool>,
}

#[derive(Debug, Default, serde::Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Browser {
	pub javascript: Option<bool>,
}

/// An object's pairs in the order they were written, a list of values as that name repeated;
/// serde_json's own map would sort them.
#[derive(Debug, Default)]
pub struct Pairs(pub Vec<(String, String)>);

impl<'de> serde::Deserialize<'de> for Pairs {
	fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
		#[derive(serde::Deserialize)]
		#[serde(untagged)]
		enum Values {
			One(String),
			Several(Vec<String>),
		}
		struct Visitor;
		impl<'de> serde::de::Visitor<'de> for Visitor {
			type Value = Pairs;
			fn expecting(&self, formatter: &mut std::fmt::Formatter) -> std::fmt::Result {
				formatter.write_str("an object of strings or lists of strings")
			}
			fn visit_map<M: serde::de::MapAccess<'de>>(self, mut map: M) -> Result<Pairs, M::Error> {
				let mut pairs = Vec::new();
				while let Some((name, values)) = map.next_entry::<String, Values>()? {
					match values {
						Values::One(value) => pairs.push((name, value)),
						Values::Several(values) => {
							pairs.extend(values.into_iter().map(|value| (name.clone(), value)));
						}
					}
				}
				Ok(Pairs(pairs))
			}
		}
		deserializer.deserialize_map(Visitor)
	}
}

#[derive(Debug, PartialEq, Eq)]
pub enum Refused {
	/// A scheme other than http or https, or a part of the address that holds more than itself.
	Url,
	/// A width or height that is not a number, or outside the bounds.
	Viewport,
	/// A timeout or a delay that is not seconds to one decimal place, or outside its bounds.
	Timing,
}

/// `true`, `1` or the bare name mean yes; anything else, or nothing, means no.
fn yes(value: Option<&str>) -> bool {
	matches!(value, Some("" | "true" | "1"))
}

/// The same reading, but yes when nothing was asked: `javascript`'s alone, which runs unless told
/// not to.
fn yes_unless_asked(value: Option<&str>) -> bool {
	value.is_none() || yes(value)
}

fn dimension(
	value: Option<&str>,
	default: u32,
	bounds: &std::ops::RangeInclusive<u32>,
) -> Result<u32, Refused> {
	let Some(value) = value else { return Ok(default) };
	let parsed = value.parse::<u32>().map_err(|_| Refused::Viewport)?;
	if bounds.contains(&parsed) { Ok(parsed) } else { Err(Refused::Viewport) }
}

/// Seconds to one decimal place -- `3`, `2.5` -- as milliseconds, within `bounds`.
fn seconds(
	value: Option<&str>,
	default: u32,
	bounds: &std::ops::RangeInclusive<u32>,
) -> Result<u32, Refused> {
	let Some(value) = value else { return Ok(default) };
	let (whole, tenth) = value.split_once('.').unwrap_or((value, "0"));
	let digits = |part: &str| !part.is_empty() && part.bytes().all(|b| b.is_ascii_digit());
	if !digits(whole) || !digits(tenth) || tenth.len() != 1 {
		return Err(Refused::Timing);
	}
	let whole = whole.parse::<u32>().map_err(|_| Refused::Timing)?;
	let milliseconds =
		whole.checked_mul(1000).ok_or(Refused::Timing)? + u32::from(tenth.as_bytes()[0] - b'0') * 100;
	if bounds.contains(&milliseconds) { Ok(milliseconds) } else { Err(Refused::Timing) }
}

/// The page, put together from its parts: `https` when the scheme is not given, the scheme's own
/// port when that is not, and each part only itself -- a host with no path, a path with no query.
fn page(query: &Query) -> Result<Url, Refused> {
	let scheme = query.scheme.as_deref().unwrap_or("https");
	if !matches!(scheme, "http" | "https") {
		return Err(Refused::Url);
	}
	let host =
		query.host.as_deref().unwrap_or_default().trim_start_matches('[').trim_end_matches(']');
	let host = match host.parse::<std::net::IpAddr>() {
		Ok(std::net::IpAddr::V6(v6)) => format!("[{v6}]"),
		Ok(v4) => v4.to_string(),
		Err(_) => {
			let stray = |c: char| c.is_whitespace() || "/:?#@\\".contains(c);
			if host.is_empty() || host.contains(stray) {
				return Err(Refused::Url);
			}
			host.to_owned()
		}
	};
	let mut url = Url::parse(&format!("{scheme}://{host}/")).map_err(|_| Refused::Url)?;
	if let Some(port) = query.port.as_deref() {
		let port = port.parse::<u16>().ok().filter(|port| *port > 0).ok_or(Refused::Url)?;
		url.set_port(Some(port)).map_err(|()| Refused::Url)?;
	}
	if let Some(path) = query.path.as_deref().filter(|path| !path.is_empty()) {
		if path.contains(['?', '#']) {
			return Err(Refused::Url);
		}
		url.set_path(&format!("/{}", path.trim_start_matches('/')));
	}
	let given = |part: &Option<String>, mark: char| {
		part
			.as_deref()
			.map(|part| part.trim_start_matches(mark).to_owned())
			.filter(|part| !part.is_empty())
	};
	if !query.query.is_empty() {
		url.query_pairs_mut().extend_pairs(&query.query);
	}
	url.set_fragment(given(&query.hash, '#').as_deref());
	Ok(url)
}

impl Asked {
	/// `public` is a request the gateway marked: it may not reach inside, whatever it says.
	pub fn read(query: &Query, public: bool) -> Result<Self, Refused> {
		let url = page(query)?;
		let insecure = url.scheme() == "https" && yes(query.insecure.as_deref());
		Ok(Self {
			url,
			width: dimension(query.width.as_deref(), DEFAULT_WIDTH, &WIDTHS)?,
			height: dimension(query.height.as_deref(), DEFAULT_HEIGHT, &HEIGHTS)?,
			full: yes(query.full.as_deref()),
			internal: !public && yes(query.internal.as_deref()),
			insecure,
			javascript: yes_unless_asked(query.javascript.as_deref()),
			timeout: seconds(query.timeout.as_deref(), DEFAULT_TIMEOUT, &TIMEOUTS)?,
			delay: seconds(query.delay.as_deref(), DEFAULT_DELAY, &DELAYS)?,
		})
	}
}

#[cfg(test)]
mod tests {
	use super::*;

	fn query(pairs: &[(&str, &str)]) -> Query {
		let owned = pairs.iter().map(|(name, value)| ((*name).to_owned(), (*value).to_owned()));
		Query::from_pairs(owned).unwrap()
	}

	fn page(pairs: &[(&str, &str)]) -> String {
		Asked::read(&query(pairs), false).unwrap().url.to_string()
	}

	#[test]
	fn puts_the_page_together_from_its_parts() {
		assert_eq!(page(&[("host", "example.com")]), "https://example.com/");
		assert_eq!(
			page(&[
				("scheme", "http"),
				("host", "x.test"),
				("port", "8080"),
				("path", "docs/a b"),
				("query.page", "2"),
				("query.sort", "new"),
				("hash", "#top"),
			]),
			"http://x.test:8080/docs/a%20b?page=2&sort=new#top"
		);
		// The scheme's own port is no port at all; a leading slash or mark is the caller's to omit.
		assert_eq!(
			page(&[("host", "x.test"), ("port", "443"), ("path", "/a"), ("query.b", "1")]),
			"https://x.test/a?b=1"
		);
		// An address is a host too, IPv6 with or without its brackets.
		let parts = |pairs: &[(&str, &str)]| {
			let url = Asked::read(&query(pairs), false).unwrap().url;
			(url.scheme().to_owned(), url.host_str().unwrap().to_owned(), url.port())
		};
		assert_eq!(
			parts(&[("host", "10.10.10.11"), ("port", "23440")]),
			("https".into(), "10.10.10.11".into(), Some(23440))
		);
		assert_eq!(
			parts(&[("host", "::1"), ("scheme", "http")]),
			("http".into(), "[::1]".into(), None)
		);
		assert_eq!(parts(&[("host", "[2001:db8::1]")]), ("https".into(), "[2001:db8::1]".into(), None));
		assert_eq!(page(&[("host", "x.test"), ("path", ""), ("hash", "")]), "https://x.test/");

		let asked = Asked::read(&query(&[("host", "x.test")]), false).unwrap();
		assert_eq!((asked.width, asked.height, asked.full, asked.internal), (1280, 800, false, false));
		let full = Asked::read(
			&query(&[("host", "x.test"), ("width", "390"), ("full", "true"), ("internal", "1")]),
			false,
		)
		.unwrap();
		assert_eq!((full.width, full.full, full.internal), (390, true, true));
	}

	#[test]
	fn times_are_seconds_to_one_place_within_their_bounds() {
		let asked = Asked::read(&query(&[("host", "x.test")]), false).unwrap();
		assert_eq!((asked.timeout, asked.delay), (15_000, 210));
		let asked =
			Asked::read(&query(&[("host", "x.test"), ("timeout", "2.5"), ("delay", "10")]), false)
				.unwrap();
		assert_eq!((asked.timeout, asked.delay), (2_500, 10_000));
		let asked =
			Asked::read(&query(&[("host", "x.test"), ("timeout", "30.0"), ("delay", "0.1")]), false)
				.unwrap();
		assert_eq!((asked.timeout, asked.delay), (30_000, 100));
		for (name, value) in [
			("timeout", "0.9"),
			("timeout", "30.1"),
			("timeout", "2.55"),
			("timeout", "fast"),
			("timeout", ".5"),
			("timeout", "5."),
			("delay", "0"),
			("delay", "0.0"),
			("delay", "10.1"),
			("delay", "-1"),
			("delay", "1e1"),
		] {
			let asked = Asked::read(&query(&[("host", "x.test"), (name, value)]), false);
			assert_eq!(asked, Err(Refused::Timing), "{name}={value}");
		}
	}

	#[test]
	fn a_certificate_is_overlooked_only_for_https() {
		let read = |pairs: &[(&str, &str)]| Asked::read(&query(pairs), true).unwrap().insecure;
		assert!(read(&[("host", "x.test"), ("insecure", "true")]));
		assert!(!read(&[("host", "x.test"), ("insecure", "true"), ("scheme", "http")]));
		assert!(!read(&[("host", "x.test")]));
	}

	#[test]
	fn scripts_run_unless_told_not_to() {
		let javascript = |pairs: &[(&str, &str)]| Asked::read(&query(pairs), false).unwrap().javascript;
		assert!(javascript(&[("host", "x.test")]));
		assert!(javascript(&[("host", "x.test"), ("javascript", "true")]));
		assert!(!javascript(&[("host", "x.test"), ("javascript", "false")]));
		assert!(!javascript(&[("host", "x.test"), ("javascript", "0")]));
	}

	#[test]
	fn takes_the_pages_query_pair_by_pair_and_writes_it_escaped() {
		let pairs = [
			("host", "x.test"),
			("query.tab", "readme"),
			("query.tag", "a"),
			("unknown", "ignored"),
			("query.tag", "b&c"),
			("query.q", "rust lang"),
		];
		assert_eq!(page(&pairs), "https://x.test/?tab=readme&tag=a&tag=b%26c&q=rust+lang");
		let owned = |pairs: &[(&str, &str)]| {
			pairs
				.iter()
				.map(|(name, value)| ((*name).to_owned(), (*value).to_owned()))
				.collect::<Vec<_>>()
		};
		// The query whole, as it once was sent, and a pair with no name, are refused.
		assert!(Query::from_pairs(owned(&[("host", "x.test"), ("query", "a=1")])).is_err());
		assert!(Query::from_pairs(owned(&[("host", "x.test"), ("query.", "1")])).is_err());
	}

	#[test]
	fn reads_a_posts_body_as_its_query() {
		let body: Body = serde_json::from_str(
			r#"{
				"target": { "scheme": "http", "host": "x.test", "port": 8080, "path": "/docs",
					"query": { "z": "last", "tag": ["a", "b"] }, "hash": "top" },
				"viewport": { "width": 390, "full": true },
				"timing": { "timeout": 2.5, "delay": 0.1 },
				"access": { "insecure": true, "internal": true },
				"browser": { "javascript": false }
			}"#,
		)
		.unwrap();
		let asked = Asked::read(&Query::from_body(body), false).unwrap();
		// Written in the order it was given, not sorted.
		assert_eq!(asked.url.as_str(), "http://x.test:8080/docs?z=last&tag=a&tag=b#top");
		assert_eq!((asked.width, asked.full, asked.timeout, asked.delay), (390, true, 2_500, 100));
		assert!(asked.internal && !asked.insecure && !asked.javascript);
		let public =
			serde_json::from_str::<Body>(r#"{"target":{"host":"x.test"},"access":{"internal":true}}"#)
				.unwrap();
		let public = Asked::read(&Query::from_body(public), true).unwrap();
		assert!(!public.internal && public.javascript);
		for unknown in [
			r#"{"url":"https://x.test"}"#,
			r#"{"target":{"host":"x.test","url":"y"}}"#,
			r#"{"target":{"query":{"a":1}}}"#,
			r#"{"browser":{"scripts":false}}"#,
		] {
			assert!(serde_json::from_str::<Body>(unknown).is_err(), "{unknown}");
		}
	}

	#[test]
	fn the_public_never_reaches_inside() {
		let asked = Asked::read(&query(&[("host", "x.test"), ("internal", "true")]), true).unwrap();
		assert!(!asked.internal);
	}

	#[test]
	fn refuses_a_part_that_holds_more_than_itself() {
		let refused = [
			vec![],
			vec![("host", "")],
			vec![("scheme", "file"), ("host", "x.test")],
			vec![("scheme", "javascript"), ("host", "x.test")],
			vec![("host", "https://x.test")],
			vec![("host", "x.test/a")],
			vec![("host", "x.test:8080")],
			vec![("host", "user@x.test")],
			vec![("host", "x.test?a=1")],
			vec![("host", "x .test")],
			vec![("host", "x.test"), ("port", "0")],
			vec![("host", "x.test"), ("port", "65536")],
			vec![("host", "x.test"), ("port", "http")],
			vec![("host", "x.test"), ("path", "a?b=1")],
			vec![("host", "x.test"), ("path", "a#b")],
		];
		for pairs in refused {
			assert_eq!(Asked::read(&query(&pairs), false), Err(Refused::Url), "{pairs:?}");
		}
		for (name, value) in [("width", "100"), ("width", "wide"), ("height", "9999"), ("height", "-1")]
		{
			let asked = Asked::read(&query(&[("host", "a.test"), (name, value)]), false);
			assert_eq!(asked, Err(Refused::Viewport), "{name}={value}");
		}
	}
}
