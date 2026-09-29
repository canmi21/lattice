//! One round of one check, as every destination keeps it. See spec/architecture/probe.md, "Where
//! the results go".

use serde::Serialize;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Round {
	/// Not answered per round: `GET /results` is asked for one check by name.
	#[serde(skip)]
	pub check: String,
	/// Milliseconds since the epoch at which the round started; answered as an RFC 3339 instant.
	#[serde(serialize_with = "instant")]
	pub at: i64,
	pub ok: bool,
	pub duration_ms: u32,
	/// A short public reason when it failed -- "status 502" -- never an address or an internal
	/// error; the full error goes to the log. The status schema says the same of `detail`.
	#[serde(skip_serializing_if = "Option::is_none")]
	pub detail: Option<String>,
}

/// What a check found, before it is stamped with its check and moment.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Outcome {
	pub ok: bool,
	pub detail: Option<String>,
}

impl Outcome {
	pub fn pass() -> Self {
		Self { ok: true, detail: None }
	}

	pub fn fail(detail: impl Into<String>) -> Self {
		Self { ok: false, detail: Some(detail.into()) }
	}
}

fn instant<S: serde::Serializer>(at: &i64, serializer: S) -> Result<S::Ok, S::Error> {
	let at = jiff::Timestamp::from_millisecond(*at).map_err(serde::ser::Error::custom)?;
	serializer.collect_str(&at)
}
