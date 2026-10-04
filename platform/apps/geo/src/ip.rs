//! `/ip`: an address, as GeoLite2 sees it. See spec/architecture/geo.md, "`/geo/ip`: an address,
//! looked up". The lookup is `whereabouts`'; what is this service's is the credit it answers with.

use serde::Serialize;
use std::net::IpAddr;
use std::sync::LazyLock;
use whereabouts::ip::{Databases, Location};

/// What the GeoLite2 EULA asks an answer built from it to say.
static CREDIT: LazyLock<&'static str> = LazyLock::new(|| {
	Box::leak(
		format!(
			"This product includes GeoLite2 data created by MaxMind, available from {}",
			monoflake::EXTERNAL_GEOLITE_MAXMIND
		)
		.into_boxed_str(),
	)
});

/// An address's country, region, city, approximate position, time zone and network -- nulls for
/// what the data does not know, rather than fields left out -- and the credit, last.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Answer {
	#[serde(flatten)]
	pub location: Location,
	pub credit: &'static str,
}

/// `address`, looked up against both databases. An address the data does not know at all is
/// every field null but `credit`.
pub fn lookup(databases: &Databases, address: IpAddr) -> Answer {
	Answer { location: databases.lookup(address), credit: *CREDIT }
}

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn nulls_rather_than_omitted_fields_and_the_credit_last() {
		let answer = Answer { location: Location::default(), credit: *CREDIT };
		let value = serde_json::to_value(&answer).unwrap();
		assert_eq!(value["country_code"], serde_json::Value::Null);
		assert!(value.get("country_code").is_some());
		assert_eq!(value["credit"], *CREDIT);
		let text = serde_json::to_string(&answer).unwrap();
		assert!(text.ends_with(&format!(r#""credit":"{}"}}"#, *CREDIT)));
	}
}
