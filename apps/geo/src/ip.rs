//! `/ip`: an address, as GeoLite2 sees it. See spec/architecture/geo.md, "`/geo/ip`: an address,
//! looked up".

use crate::store::Readers;
use maxminddb::geoip2;
use serde::Serialize;
use std::net::IpAddr;
use std::sync::LazyLock;

/// What the GeoLite2 EULA asks an answer built from it to say.
static CREDIT: LazyLock<&'static str> = LazyLock::new(|| {
	Box::leak(
		format!(
			"This product includes GeoLite2 data created by MaxMind, available from {}",
			urls::EXTERNAL_GEOLITE_MAXMIND
		)
		.into_boxed_str(),
	)
});

/// An address's country, region, city, approximate position, time zone and network -- nulls for
/// what the data does not know, rather than fields left out.
#[derive(Debug, Clone, Default, PartialEq, Serialize)]
pub struct Answer {
	pub country_code: Option<String>,
	pub country: Option<String>,
	pub region: Option<String>,
	pub city: Option<String>,
	pub latitude: Option<f64>,
	pub longitude: Option<f64>,
	pub timezone: Option<String>,
	pub asn: Option<u32>,
	pub organization: Option<String>,
	pub credit: &'static str,
}

impl Answer {
	fn of(city: &geoip2::City, asn: &geoip2::Asn) -> Self {
		Self {
			country_code: city.country.iso_code.map(str::to_owned),
			country: city.country.names.english.map(str::to_owned),
			region: city.subdivisions.first().and_then(|s| s.names.english).map(str::to_owned),
			city: city.city.names.english.map(str::to_owned),
			latitude: city.location.latitude,
			longitude: city.location.longitude,
			timezone: city.location.time_zone.map(str::to_owned),
			asn: asn.autonomous_system_number,
			organization: asn.autonomous_system_organization.map(str::to_owned),
			credit: *CREDIT,
		}
	}
}

/// `geoip2::Asn` derives no `Default` -- unlike every other `geoip2` record -- so an address the
/// ASN database has nothing for is built by hand instead.
fn empty_asn() -> geoip2::Asn<'static> {
	geoip2::Asn { autonomous_system_number: None, autonomous_system_organization: None }
}

/// `address`, looked up against both readers. Either database missing the address, or holding
/// nothing useful for it, answers with `Default::default()` for that half -- an address the data
/// does not know at all is every field null but `credit`.
pub fn lookup(readers: &Readers, address: IpAddr) -> Answer {
	let city: geoip2::City = readers
		.city
		.lookup(address)
		.ok()
		.and_then(|result| result.decode::<geoip2::City>().ok())
		.flatten()
		.unwrap_or_default();
	let asn: geoip2::Asn = readers
		.asn
		.lookup(address)
		.ok()
		.and_then(|result| result.decode::<geoip2::Asn>().ok())
		.flatten()
		.unwrap_or(empty_asn());
	Answer::of(&city, &asn)
}

#[cfg(test)]
mod tests {
	use super::*;
	use maxminddb::geoip2::{Asn, City, Names, city};

	/// A decoded record built by hand, standing in for one the crate would have borrowed from a
	/// real `.mmdb` file -- the shape `lookup`'s mapping is held to.
	fn city_record() -> City<'static> {
		City {
			city: city::City {
				geoname_id: None,
				names: Names { english: Some("Reykjavik"), ..Default::default() },
			},
			country: city::Country {
				iso_code: Some("IS"),
				names: Names { english: Some("Iceland"), ..Default::default() },
				..Default::default()
			},
			subdivisions: vec![city::Subdivision {
				names: Names { english: Some("Capital Region"), ..Default::default() },
				..Default::default()
			}],
			location: city::Location {
				latitude: Some(64.15),
				longitude: Some(-21.95),
				time_zone: Some("Atlantic/Reykjavik"),
				..Default::default()
			},
			..Default::default()
		}
	}

	fn asn_record() -> Asn<'static> {
		Asn {
			autonomous_system_number: Some(13335),
			autonomous_system_organization: Some("Cloudflare, Inc."),
		}
	}

	#[test]
	fn maps_a_full_record_into_the_answer_shape() {
		let answer = Answer::of(&city_record(), &asn_record());
		assert_eq!(
			answer,
			Answer {
				country_code: Some("IS".into()),
				country: Some("Iceland".into()),
				region: Some("Capital Region".into()),
				city: Some("Reykjavik".into()),
				latitude: Some(64.15),
				longitude: Some(-21.95),
				timezone: Some("Atlantic/Reykjavik".into()),
				asn: Some(13335),
				organization: Some("Cloudflare, Inc.".into()),
				credit: *CREDIT,
			}
		);
	}

	#[test]
	fn an_empty_record_is_nulls_and_still_the_credit() {
		let answer = Answer::of(&City::default(), &empty_asn());
		assert_eq!(answer, Answer { credit: *CREDIT, ..Default::default() });
	}

	#[test]
	fn nulls_rather_than_omitted_fields() {
		let value = serde_json::to_value(Answer::default()).unwrap();
		assert_eq!(value["country_code"], serde_json::Value::Null);
		assert!(value.get("country_code").is_some());
	}
}
