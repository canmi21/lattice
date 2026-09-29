//! The declared checks, read from `checks.toml`, with each target resolved against `libs/urls`.
//! See spec/architecture/probe.md, "What is checked, and how often".

use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::time::Duration;
use url::Url;

/// The checks this build carries: the file is part of the repository and of the binary, so a
/// change to it is a deploy like any other.
pub const DECLARED: &str = include_str!("../checks.toml");

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Kind {
	Dns,
	Api,
	Page,
	Health,
}

impl Kind {
	pub fn name(self) -> &'static str {
		match self {
			Self::Dns => "dns",
			Self::Api => "api",
			Self::Page => "page",
			Self::Health => "health",
		}
	}
}

/// What a check expects. Every field is optional; what a kind does not read it refuses, so a
/// check never quietly expects something nobody looks at.
#[derive(Debug, Clone, Default, PartialEq, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Expect {
	/// The HTTP status: the answer's for `api` and `health`, the document's for `page`.
	pub status: Option<u16>,
	/// Whether the envelope's `status` is `success`: `api` and `health`.
	pub success: Option<bool>,
	/// Dotted paths under the envelope's `data` that must be present and not null: `api`.
	#[serde(default)]
	pub fields: Vec<String>,
	/// Follow `202` and its `Location` until the answer is something else: `api`.
	#[serde(default)]
	pub follow: bool,
	/// The record type a `dns` check asks for, `A` or `AAAA`.
	pub record: Option<String>,
	/// Values a `dns` answer must include, beyond having one at all.
	#[serde(default)]
	pub answers: Vec<String>,
	/// At most this many errors thrown in the page: `page`.
	pub errors: Option<u64>,
	/// At most this many requests the page did not call off itself failed: `page`.
	pub failed_requests: Option<u64>,
	/// How long the whole round may take, in seconds.
	pub within: Option<f64>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct File {
	#[serde(default, rename = "check")]
	checks: Vec<Declared>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct Declared {
	id: String,
	kind: Kind,
	target: String,
	/// Seconds between rounds.
	interval: f64,
	#[serde(default)]
	expect: Expect,
}

/// One check, ready to run.
#[derive(Debug, Clone, PartialEq)]
pub struct Check {
	pub id: String,
	pub kind: Kind,
	/// The target as declared, symbolically: what `checks` and `GET /checks` show, so no address
	/// is written anywhere but `libs/urls`.
	pub target: String,
	/// The target resolved.
	pub url: Url,
	pub interval: Duration,
	pub expect: Expect,
}

impl Check {
	/// How long a round may take before it is called failed.
	pub fn within(&self) -> Duration {
		let default = match self.kind {
			Kind::Dns | Kind::Health => 5.0,
			Kind::Api => 15.0,
			Kind::Page => 60.0,
		};
		Duration::from_secs_f64(self.expect.within.unwrap_or(default))
	}
}

/// The longest a round may be allowed, so a closed bucket has had every round that falls in it.
/// See `crate::rollup::SETTLE`.
pub const LONGEST: f64 = 60.0;

/// The fewest seconds between two rounds of one check: "as often as every second".
pub const SHORTEST: f64 = 1.0;

/// The names a target may start with: `libs/urls`' own, the API host's two sides shortened.
/// A name not here is an error when the file is read, never a request to somewhere unmeant.
fn named(name: &str) -> Option<&'static str> {
	Some(match name {
		"API_PRIVATE" => urls::INTERNAL_API_PRIVATE,
		"API_PUBLIC" => urls::INTERNAL_API_PUBLIC,
		"APPS_PRODUCTION_SITE" => urls::APPS_PRODUCTION_SITE,
		"APPS_PRODUCTION_API" => urls::APPS_PRODUCTION_API,
		"APPS_PRODUCTION_ALIAS" => urls::APPS_PRODUCTION_ALIAS,
		"APPS_PRODUCTION_CDN" => urls::APPS_PRODUCTION_CDN,
		"APPS_PRODUCTION_PANEL" => urls::APPS_PRODUCTION_PANEL,
		"INTERNAL_APP" => urls::INTERNAL_APP,
		"INTERNAL_INFRA" => urls::INTERNAL_INFRA,
		"INTERNAL_LEDGER" => urls::INTERNAL_LEDGER,
		"INTERNAL_CRON" => urls::INTERNAL_CRON,
		"INTERNAL_SHOT" => urls::INTERNAL_SHOT,
		_ => return None,
	})
}

/// `NAME` or `NAME<rest>`: the leading capitals, digits and underscores are a name `named` knows,
/// and what follows -- a path, a query -- is appended to its value as written.
pub fn resolve(target: &str) -> Result<Url, String> {
	let end = target
		.find(|c: char| !(c.is_ascii_uppercase() || c.is_ascii_digit() || c == '_'))
		.unwrap_or(target.len());
	let (name, rest) = target.split_at(end);
	let Some(base) = named(name) else {
		return Err(format!("`{target}` does not start with a name libs/urls holds"));
	};
	if !(rest.is_empty() || rest.starts_with('/') || rest.starts_with('?')) {
		return Err(format!("`{target}`: what follows the name must be a path or a query"));
	}
	Url::parse(&format!("{base}{rest}")).map_err(|error| format!("`{target}`: {error}"))
}

/// What each kind may be asked to expect.
fn allowed(kind: Kind, expect: &Expect) -> Result<(), &'static str> {
	let http = expect.status.is_some() || expect.success.is_some();
	let api = !expect.fields.is_empty() || expect.follow;
	let dns = expect.record.is_some() || !expect.answers.is_empty();
	let page = expect.errors.is_some() || expect.failed_requests.is_some();
	let refused = match kind {
		Kind::Dns => http || api || page,
		Kind::Api => dns || page,
		Kind::Health => api || dns || page,
		Kind::Page => expect.success.is_some() || api || dns,
	};
	if refused {
		return Err("expects something this kind does not check");
	}
	if let Some(record) = &expect.record
		&& record != "A"
		&& record != "AAAA"
	{
		return Err("a record is A or AAAA");
	}
	Ok(())
}

/// Read and resolve a whole file. Every problem is an error: a check file is ours, and a check
/// that cannot be run as declared should stop the deploy rather than be skipped.
pub fn parse(source: &str) -> Result<Vec<Check>, String> {
	let file: File = toml::from_str(source).map_err(|error| error.to_string())?;
	let mut seen = HashSet::new();
	let mut checks = Vec::with_capacity(file.checks.len());
	for declared in file.checks {
		let id = declared.id;
		let valid_id = !id.is_empty()
			&& id.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-' || b == b'.');
		if !valid_id {
			return Err(format!("`{id}`: an id is lowercase letters, digits, hyphens and dots"));
		}
		if !seen.insert(id.clone()) {
			return Err(format!("`{id}` is declared twice"));
		}
		if !(declared.interval.is_finite() && declared.interval >= SHORTEST) {
			return Err(format!("`{id}`: an interval is at least {SHORTEST} second"));
		}
		if let Some(within) = declared.expect.within
			&& !(within.is_finite() && within > 0.0 && within <= LONGEST)
		{
			return Err(format!("`{id}`: `within` is more than 0 and at most {LONGEST} seconds"));
		}
		allowed(declared.kind, &declared.expect).map_err(|error| format!("`{id}`: {error}"))?;
		let url = resolve(&declared.target)?;
		if declared.kind == Kind::Dns && url.host_str().is_none() {
			return Err(format!("`{id}`: a dns target needs a host"));
		}
		checks.push(Check {
			id,
			kind: declared.kind,
			target: declared.target,
			url,
			interval: Duration::from_secs_f64(declared.interval),
			expect: declared.expect,
		});
	}
	Ok(checks)
}

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn the_declared_file_reads_and_every_target_resolves() {
		let checks = parse(DECLARED).unwrap();
		assert!(checks.iter().any(|check| check.kind == Kind::Health));
		for kind in [Kind::Dns, Kind::Api, Kind::Page, Kind::Health] {
			assert!(checks.iter().any(|check| check.kind == kind), "{kind:?} has a check");
		}
	}

	#[test]
	fn a_name_resolves_against_urls_and_keeps_what_follows() {
		let site = Url::parse(urls::APPS_PRODUCTION_SITE).unwrap();
		assert_eq!(resolve("APPS_PRODUCTION_SITE").unwrap(), site);
		assert_eq!(
			resolve("API_PRIVATE/geo/health").unwrap().as_str(),
			format!("{}/geo/health", urls::INTERNAL_API_PRIVATE)
		);
		assert_eq!(
			resolve("API_PUBLIC/shot/capture?host=canmi.net").unwrap().as_str(),
			format!("{}/shot/capture?host=canmi.net", urls::INTERNAL_API_PUBLIC)
		);
	}

	#[test]
	fn a_target_that_is_not_a_known_name_is_refused() {
		assert!(resolve(urls::APPS_PRODUCTION_SITE).is_err());
		assert!(resolve("NO_SUCH_NAME/x").is_err());
		assert!(resolve("APPS_PRODUCTION_SITEx").is_err());
	}

	#[test]
	fn a_check_file_is_read_whole_or_refused() {
		let one = r#"
			[[check]]
			id = "geo-ip"
			kind = "api"
			target = "API_PUBLIC/geo/ip"
			interval = 30
			expect = { status = 200, success = true, fields = ["credit"], within = 2 }
		"#;
		let checks = parse(one).unwrap();
		let [check] = checks.as_slice() else { panic!("one check") };
		assert_eq!(check.interval, Duration::from_secs(30));
		assert_eq!(check.within(), Duration::from_secs(2));
		assert_eq!(check.expect.fields, ["credit"]);

		let twice = format!("{one}\n{one}");
		assert!(parse(&twice).unwrap_err().contains("twice"));
		let unknown = one.replace("within = 2", "within = 2, colour = 1");
		assert!(parse(&unknown).is_err());
		let too_often = one.replace("interval = 30", "interval = 0.5");
		assert!(parse(&too_often).is_err());
		let wrong_kind = one.replace("kind = \"api\"", "kind = \"dns\"");
		assert!(parse(&wrong_kind).unwrap_err().contains("does not check"));
		let bad_record = r#"
			[[check]]
			id = "dns"
			kind = "dns"
			target = "APPS_PRODUCTION_SITE"
			interval = 60
			expect = { record = "MX" }
		"#;
		assert!(parse(bad_record).is_err());
	}
}
