//! What a capture is asked for, read from the query and held to what the service will do. Two
//! requests asking the same are one capture. See spec/architecture/shot.md, "Asking for one".

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
	/// Milliseconds the page may take to load.
	pub timeout: u32,
	/// Milliseconds between its loading and the picture.
	pub delay: u32,
}

/// The query as it arrives, every field a string, so a malformed one is ours to name. The page is
/// six of them, each one part of its address, so a caller never writes an address inside another.
#[derive(Debug, Default, serde::Deserialize)]
pub struct Query {
	pub scheme: Option<String>,
	pub host: Option<String>,
	pub port: Option<String>,
	pub path: Option<String>,
	pub query: Option<String>,
	pub hash: Option<String>,
	pub width: Option<String>,
	pub height: Option<String>,
	pub full: Option<String>,
	pub internal: Option<String>,
	pub timeout: Option<String>,
	pub delay: Option<String>,
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
	url.set_query(given(&query.query, '?').as_deref());
	url.set_fragment(given(&query.hash, '#').as_deref());
	Ok(url)
}

impl Asked {
	/// `public` is a request the gateway marked: it may not reach inside, whatever it says.
	pub fn read(query: &Query, public: bool) -> Result<Self, Refused> {
		let url = page(query)?;
		Ok(Self {
			url,
			width: dimension(query.width.as_deref(), DEFAULT_WIDTH, &WIDTHS)?,
			height: dimension(query.height.as_deref(), DEFAULT_HEIGHT, &HEIGHTS)?,
			full: yes(query.full.as_deref()),
			internal: !public && yes(query.internal.as_deref()),
			timeout: seconds(query.timeout.as_deref(), DEFAULT_TIMEOUT, &TIMEOUTS)?,
			delay: seconds(query.delay.as_deref(), DEFAULT_DELAY, &DELAYS)?,
		})
	}
}

#[cfg(test)]
mod tests {
	use super::*;

	fn query(pairs: &[(&str, &str)]) -> Query {
		let get = |name: &str| pairs.iter().find(|(key, _)| *key == name).map(|(_, v)| v.to_string());
		Query {
			scheme: get("scheme"),
			host: get("host"),
			port: get("port"),
			path: get("path"),
			query: get("query"),
			hash: get("hash"),
			width: get("width"),
			height: get("height"),
			full: get("full"),
			internal: get("internal"),
			timeout: get("timeout"),
			delay: get("delay"),
		}
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
				("query", "page=2&sort=new"),
				("hash", "#top"),
			]),
			"http://x.test:8080/docs/a%20b?page=2&sort=new#top"
		);
		// The scheme's own port is no port at all; a leading slash or mark is the caller's to omit.
		assert_eq!(
			page(&[("host", "x.test"), ("port", "443"), ("path", "/a"), ("query", "?b=1")]),
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
		assert_eq!(
			page(&[("host", "x.test"), ("path", ""), ("query", ""), ("hash", "")]),
			"https://x.test/"
		);

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
