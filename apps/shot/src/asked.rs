//! What a capture is asked for, read from the query and held to what the service will do. Two
//! requests asking the same are one capture. See spec/architecture/shot.md, "Asking for one".

use url::Url;

/// The viewport's bounds, in CSS pixels: a phone's width at the least, a 4K screen's at the most.
pub const WIDTHS: std::ops::RangeInclusive<u32> = 320..=3840;
pub const HEIGHTS: std::ops::RangeInclusive<u32> = 240..=2160;
/// What a capture is when the query does not say.
pub const DEFAULT_WIDTH: u32 = 1280;
pub const DEFAULT_HEIGHT: u32 = 800;

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct Asked {
	pub url: Url,
	pub width: u32,
	pub height: u32,
	/// The whole page rather than what the viewport shows.
	pub full: bool,
	/// Whether private addresses may be reached; only our own callers may ask it.
	pub internal: bool,
}

/// The query as it arrives, every field a string, so a malformed one is ours to name.
#[derive(Debug, Default, serde::Deserialize)]
pub struct Query {
	pub url: Option<String>,
	pub width: Option<String>,
	pub height: Option<String>,
	pub full: Option<String>,
	pub internal: Option<String>,
}

#[derive(Debug, PartialEq, Eq)]
pub enum Refused {
	/// No url, or one that is not http or https.
	Url,
	/// A width or height that is not a number, or outside the bounds.
	Viewport,
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

impl Asked {
	/// `public` is a request the gateway marked: it may not reach inside, whatever it says.
	pub fn read(query: &Query, public: bool) -> Result<Self, Refused> {
		let url = query.url.as_deref().and_then(|url| Url::parse(url).ok()).ok_or(Refused::Url)?;
		if !matches!(url.scheme(), "http" | "https") || url.host().is_none() {
			return Err(Refused::Url);
		}
		Ok(Self {
			url,
			width: dimension(query.width.as_deref(), DEFAULT_WIDTH, &WIDTHS)?,
			height: dimension(query.height.as_deref(), DEFAULT_HEIGHT, &HEIGHTS)?,
			full: yes(query.full.as_deref()),
			internal: !public && yes(query.internal.as_deref()),
		})
	}
}

#[cfg(test)]
mod tests {
	use super::*;

	fn query(pairs: &[(&str, &str)]) -> Query {
		let get = |name: &str| pairs.iter().find(|(key, _)| *key == name).map(|(_, v)| v.to_string());
		Query {
			url: get("url"),
			width: get("width"),
			height: get("height"),
			full: get("full"),
			internal: get("internal"),
		}
	}

	#[test]
	fn reads_a_capture_with_its_defaults() {
		let asked = Asked::read(&query(&[("url", "https://example.com/a?b=1")]), false).unwrap();
		assert_eq!((asked.width, asked.height, asked.full, asked.internal), (1280, 800, false, false));
		let full = Asked::read(
			&query(&[("url", "http://x.test"), ("width", "390"), ("full", "true"), ("internal", "1")]),
			false,
		)
		.unwrap();
		assert_eq!((full.width, full.full, full.internal), (390, true, true));
	}

	#[test]
	fn the_public_never_reaches_inside() {
		let asked =
			Asked::read(&query(&[("url", "http://x.test"), ("internal", "true")]), true).unwrap();
		assert!(!asked.internal);
	}

	#[test]
	fn refuses_what_it_will_not_capture() {
		for url in [
			"",
			"example.com",
			"file:///etc/passwd",
			"chrome://settings",
			"javascript:1",
			"data:text/html,x",
		] {
			assert_eq!(Asked::read(&query(&[("url", url)]), false), Err(Refused::Url), "{url}");
		}
		assert_eq!(Asked::read(&query(&[]), false), Err(Refused::Url));
		for (name, value) in [("width", "100"), ("width", "wide"), ("height", "9999"), ("height", "-1")]
		{
			let asked = Asked::read(&query(&[("url", "https://a.test"), (name, value)]), false);
			assert_eq!(asked, Err(Refused::Viewport), "{name}={value}");
		}
	}
}
