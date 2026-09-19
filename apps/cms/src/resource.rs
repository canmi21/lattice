//! A resource: a thing this site holds, named by an id granted to it rather than by its bytes.
//!
//! A cid answers "are these the same bytes" and a rid answers "is this the same thing"; nothing
//! converts one into the other. The envelope is what every kind of resource shares -- five
//! fields and a container of layers -- so one reader parses a picture, a clip and an article,
//! differing only in which layers it knows about. See spec/architecture/resource.md.

use rand::RngExt as _;
use serde::de::DeserializeOwned;
use serde::{Deserialize, Deserializer, Serialize, Serializer};
use std::collections::{BTreeMap, BTreeSet};
use std::fmt;
use std::str::FromStr;

/// Five characters of lowercase base36, which is 60,466,176 ids.
///
/// Allocation checks the register before handing one out, so a collision is not a probability
/// to be argued about and the length is chosen for somebody reading article source.
const LENGTH: usize = 5;
const ALPHABET: &[u8] = b"0123456789abcdefghijklmnopqrstuvwxyz";

/// Stems an allocation refuses anywhere in a candidate.
///
/// A rid is written into article source, and changing one afterwards breaks every reference to
/// it -- which is the reason to spend one comparison now. Stems rather than whole ids, so a
/// single entry turns away `shite`, `0shit` and `shits`.
const DENIED: &[&str] = &[
	"anus", "arse", "clit", "cock", "crap", "cunt", "dick", "fuck", "nazi", "piss", "porn", "rape",
	"shit", "slut", "suck", "turd", "twat", "wank",
];

/// A resource id: `k7m2x`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct ResourceId([u8; LENGTH]);

#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum MalformedId {
	#[error("a resource id is {LENGTH} characters, and this one is {0}")]
	Length(usize),
	#[error("a resource id is lowercase base36, and `{0}` is not")]
	Alphabet(char),
}

impl ResourceId {
	pub fn parse(text: &str) -> Result<Self, MalformedId> {
		let length = text.chars().count();
		if length != LENGTH {
			return Err(MalformedId::Length(length));
		}
		let mut id = [0; LENGTH];
		for (slot, character) in id.iter_mut().zip(text.chars()) {
			if !character.is_ascii_digit() && !character.is_ascii_lowercase() {
				return Err(MalformedId::Alphabet(character));
			}
			*slot = character as u8;
		}
		Ok(Self(id))
	}

	/// Validated on construction, so the bytes are ASCII and this cannot fail unless this
	/// module is already wrong.
	pub fn as_str(&self) -> &str {
		std::str::from_utf8(&self.0).expect("a rid is ascii by construction")
	}
}

/// Grant an id the register does not already hold.
///
/// Random rather than sequential: a counter would write the order things were imported into
/// every article that names one, and a gap in it would read as something deleted. The register
/// is the resource table itself, so this takes the lock that table already has.
pub fn allocate(existing: &BTreeSet<ResourceId>) -> ResourceId {
	let mut rng = rand::rng();
	loop {
		let mut id = [0; LENGTH];
		for slot in &mut id {
			*slot = ALPHABET[rng.random_range(0..ALPHABET.len())];
		}
		let candidate = ResourceId(id);
		if !existing.contains(&candidate) && !reads_as_a_word(candidate.as_str()) {
			return candidate;
		}
	}
}

fn reads_as_a_word(id: &str) -> bool {
	DENIED.iter().any(|stem| id.contains(stem))
}

impl fmt::Display for ResourceId {
	fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
		f.write_str(self.as_str())
	}
}

impl FromStr for ResourceId {
	type Err = MalformedId;

	fn from_str(text: &str) -> Result<Self, Self::Err> {
		Self::parse(text)
	}
}

impl Serialize for ResourceId {
	fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
		serializer.serialize_str(self.as_str())
	}
}

impl<'de> Deserialize<'de> for ResourceId {
	fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
		let text = String::deserialize(deserializer)?;
		Self::parse(&text).map_err(serde::de::Error::custom)
	}
}

/// `media.image.photo`, read left to right.
///
/// Every segment does three jobs: it selects a parser, it names a key in `layers`, and it
/// promises that key exists and parses under it. A consumer binds to the shallowest segment
/// that answers its question, so a fourth kind of image costs a thumbnail nothing.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct Namespace(Vec<String>);

#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum MalformedType {
	#[error("a type is dot-separated segments, and `{0}` has an empty one")]
	Empty(String),
	#[error("a type segment is lowercase letters, and `{0}` is not")]
	Character(char),
}

impl Namespace {
	/// The door for text read off disk. Segments built in this crate come through `of`.
	pub fn parse(text: &str) -> Result<Self, MalformedType> {
		let mut segments = Vec::new();
		for segment in text.split('.') {
			if segment.is_empty() {
				return Err(MalformedType::Empty(text.to_owned()));
			}
			let stray = segment.chars().find(|c| !c.is_ascii_lowercase());
			if let Some(character) = stray {
				return Err(MalformedType::Character(character));
			}
			segments.push(segment.to_owned());
		}
		Ok(Self(segments))
	}

	pub fn of(segments: &[&str]) -> Self {
		Self(segments.iter().map(|segment| (*segment).to_owned()).collect())
	}

	pub fn segments(&self) -> &[String] {
		&self.0
	}

	/// The last segment: what this is, rather than what it is a kind of.
	pub fn leaf(&self) -> &str {
		self.0.last().map_or("", String::as_str)
	}

	pub fn declares(&self, segment: &str) -> bool {
		self.0.iter().any(|name| name == segment)
	}
}

impl fmt::Display for Namespace {
	fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
		f.write_str(&self.0.join("."))
	}
}

impl Serialize for Namespace {
	fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
		serializer.serialize_str(&self.to_string())
	}
}

impl<'de> Deserialize<'de> for Namespace {
	fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
		let text = String::deserialize(deserializer)?;
		Self::parse(&text).map_err(serde::de::Error::custom)
	}
}

/// One layer as it sits on disk: its own version, and whatever else it carries.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Layer {
	pub version: u32,
	#[serde(flatten)]
	pub fields: serde_json::Map<String, serde_json::Value>,
}

/// Whatever holds a record's layers, seen as names and versions.
///
/// Both the unparsed map and a typed set of layers answer this, which is what lets the promise
/// `type` makes be checked without parsing a single layer body.
pub trait Layered {
	fn layers(&self) -> Vec<(&str, u32)>;
}

impl Layered for BTreeMap<String, Layer> {
	fn layers(&self) -> Vec<(&str, u32)> {
		self.iter().map(|(name, layer)| (name.as_str(), layer.version)).collect()
	}
}

/// The envelope: five fields and a container.
///
/// `version` is the envelope's own and moves only when one of these five names moves. A layer
/// that changes shape raises its own number and the envelope never notices, which is the whole
/// reason the numbers are per layer.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Record<L> {
	pub version: u32,
	/// The id this thing is known by.
	///
	/// Granted once and written back, never derived on read: an id minted while loading differs
	/// between two runs, and an identity that changes every time the file is read is not one. So
	/// nothing on a load path calls `allocate`. Not optional, because the schema in
	/// `libs/artifacts` is not: a record without one is a record from before `cms migrate`, and
	/// that command reads the shape without it so nothing else has to.
	pub resource: ResourceId,
	/// `type` on disk; a keyword here.
	#[serde(rename = "type")]
	pub namespace: Namespace,
	/// ISO 8601 in UTC. Not local time: a record that means a different instant depending on
	/// where it is read is not a record.
	pub created: String,
	pub updated: String,
	/// What a bare resource id means, as a scheme rather than an address.
	///
	/// `cid:{cid}.{ext}` or `slug:{slug}`, expanded by whoever answers from the one place a
	/// hostname is declared. An absolute URL here would put a domain in every record, so moving
	/// one would mean rewriting all of them. Absent is a refusal rather than a guess.
	#[serde(default, skip_serializing_if = "Option::is_none")]
	pub canonical: Option<Canonical>,
	pub layers: L,
}

/// A canonical, which is one of two schemes and never an address.
///
/// Parsed rather than held as a string so that writing an absolute URL into one is a compile
/// error here and not a surprise at the layer that expands it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Canonical {
	/// The object a bare id should hand back: its content id and the extension it is stored under.
	Object { cid: String, extension: String },
	/// An article, by the identity the site resolves a bare name to without being told a path.
	Slug(String),
}

impl fmt::Display for Canonical {
	fn fmt(&self, out: &mut fmt::Formatter<'_>) -> fmt::Result {
		match self {
			Self::Object { cid, extension } => write!(out, "cid:{cid}.{extension}"),
			Self::Slug(slug) => write!(out, "slug:{slug}"),
		}
	}
}

impl std::str::FromStr for Canonical {
	type Err = String;

	fn from_str(text: &str) -> Result<Self, Self::Err> {
		if let Some(rest) = text.strip_prefix("cid:") {
			let (cid, extension) = rest.rsplit_once('.').ok_or("a cid canonical needs an extension")?;
			if cid.len() != 32 || !cid.bytes().all(|b| b.is_ascii_hexdigit()) {
				return Err(format!("`{cid}` is not a content id"));
			}
			let (cid, extension) = (cid.to_owned(), extension.to_owned());
			return Ok(Self::Object { cid, extension });
		}
		match text.strip_prefix("slug:") {
			Some(slug) if !slug.is_empty() => Ok(Self::Slug(slug.to_owned())),
			_ => Err(format!("`{text}` is neither a cid nor a slug scheme")),
		}
	}
}

impl Serialize for Canonical {
	fn serialize<S: serde::Serializer>(&self, out: S) -> Result<S::Ok, S::Error> {
		out.serialize_str(&self.to_string())
	}
}

impl<'de> Deserialize<'de> for Canonical {
	fn deserialize<D: serde::Deserializer<'de>>(input: D) -> Result<Self, D::Error> {
		let text = String::deserialize(input)?;
		text.parse().map_err(serde::de::Error::custom)
	}
}

/// A record whose layers have not been parsed.
///
/// What a reader needing only the envelope gets, and what the rules below are written against:
/// nothing here knows what a picture is.
pub type Opaque = Record<BTreeMap<String, Layer>>;

/// What stops a record from being read as the thing it claims to be.
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum Broken {
	#[error("`{0}` is in layers and not declared in type, so nothing can reach it")]
	Unreachable(String),
	#[error("this resource has no `{0}` layer")]
	Missing(String),
	#[error("the `{0}` layer does not parse: {1}")]
	Unparsed(String, String),
}

impl<L: Layered> Record<L> {
	/// Check the one thing that is the record's fault rather than a reader's age.
	///
	/// A layer nobody declared is data nothing can reach, which is an error before any caller
	/// asks for anything. The other direction -- a segment declared with no layer under it --
	/// ends the chain instead, exactly as an unknown segment does. See `chain`.
	pub fn validate(&self) -> Result<(), Broken> {
		for (name, _) in self.layers.layers() {
			if !self.namespace.declares(name) {
				return Err(Broken::Unreachable(name.to_owned()));
			}
		}
		Ok(())
	}

	/// How far a reader gets: the leading segments it both knows and can parse.
	///
	/// Stopping is the whole of forward compatibility here. A segment nobody on this side has
	/// heard of, or a layer written at a version above what `understands` answers to, ends the
	/// chain, and everything shallower than it is still good.
	pub fn chain(&self, understands: impl Fn(&str, u32) -> bool) -> &[String] {
		let present = self.layers.layers();
		let known = |segment: &str| {
			present.iter().any(|(name, version)| *name == segment && understands(name, *version))
		};
		let reached =
			self.namespace.segments().iter().take_while(|segment| known(segment.as_str())).count();
		&self.namespace.segments()[..reached]
	}
}

impl Opaque {
	/// Parse one layer's body, for a reader that needs it.
	///
	/// Missing is an error rather than an empty answer: asking for a picture and receiving a
	/// resource with no `image` layer is a caller error or a corrupt record, and a blank is how
	/// a missing image becomes a missing image nobody reports.
	pub fn layer<T: DeserializeOwned>(&self, segment: &str) -> Result<T, Broken> {
		let layer = self.layers.get(segment).ok_or_else(|| Broken::Missing(segment.to_owned()))?;
		serde_json::from_value(serde_json::Value::Object(layer.fields.clone()))
			.map_err(|error| Broken::Unparsed(segment.to_owned(), error.to_string()))
	}
}

#[cfg(test)]
mod tests {
	use super::*;

	fn layer(version: u32) -> Layer {
		Layer { version, fields: serde_json::Map::new() }
	}

	fn envelope(namespace: &str, layers: &[(&str, u32)]) -> Opaque {
		Opaque {
			canonical: None,
			version: 5,
			resource: ResourceId::parse("k7m2x").expect("a rid"),
			namespace: Namespace::parse(namespace).expect("a type"),
			created: "2026-09-14T02:55:32.15685Z".into(),
			updated: "2026-09-14T02:55:32.15685Z".into(),
			layers: layers.iter().map(|(name, v)| ((*name).to_owned(), layer(*v))).collect(),
		}
	}

	#[test]
	fn a_rid_is_five_characters_of_lowercase_base36() {
		assert_eq!(ResourceId::parse("k7m2x").expect("a rid").as_str(), "k7m2x");
		assert_eq!(ResourceId::parse("00000").expect("a rid").to_string(), "00000");
		assert!(matches!(ResourceId::parse("k7m2"), Err(MalformedId::Length(4))));
		assert!(matches!(ResourceId::parse("k7m2xy"), Err(MalformedId::Length(6))));
		assert!(matches!(ResourceId::parse("K7M2X"), Err(MalformedId::Alphabet('K'))));
		assert!(matches!(ResourceId::parse("k7m-x"), Err(MalformedId::Alphabet('-'))));
	}

	#[test]
	fn a_rid_of_multibyte_text_is_a_length_error_and_not_a_panic() {
		// Counted in characters rather than bytes: slicing a five-byte prefix off this would
		// panic, and the input is a file on disk rather than anything this crate wrote.
		assert!(matches!(ResourceId::parse("日本語です"), Err(MalformedId::Alphabet(_))));
		assert!(matches!(ResourceId::parse("日本"), Err(MalformedId::Length(2))));
	}

	#[test]
	fn a_canonical_round_trips_and_refuses_an_address() {
		// The two spellings have to match `CANONICAL_PATTERN` in libs/artifacts, because the
		// record this writes is the record that schema reads. A URL is refused on both sides for
		// the same reason: a hostname in a record is a hostname in every record.
		let object: Canonical = "cid:44b6081deaf0242ca3bf83d62a3b6c95.avif".parse().expect("object");
		assert_eq!(object.to_string(), "cid:44b6081deaf0242ca3bf83d62a3b6c95.avif");
		let slug: Canonical = "slug:less-is-more".parse().expect("slug");
		assert_eq!(slug.to_string(), "slug:less-is-more");

		// An absolute address, which is the thing a scheme exists to keep out of a record.
		assert!("https:%2F%2Fexample.invalid/x".replace("%2F", "/").parse::<Canonical>().is_err());
		assert!("cid:notahash.avif".parse::<Canonical>().is_err());
		assert!("cid:44b6081deaf0242ca3bf83d62a3b6c95".parse::<Canonical>().is_err());
		assert!("slug:".parse::<Canonical>().is_err());
	}

	#[test]
	fn allocation_hands_out_nothing_taken_and_nothing_that_reads_as_a_word() {
		let mut register = BTreeSet::new();
		for _ in 0..500 {
			let id = allocate(&register);
			assert!(!register.contains(&id), "handed out {id} twice");
			assert!(!reads_as_a_word(id.as_str()), "{id} reads as a word");
			register.insert(id);
		}
	}

	#[test]
	fn the_deny_list_matches_a_stem_anywhere_in_an_id() {
		// Whole ids would need an entry per spelling. One stem covers every id that contains it,
		// which is what makes a list this short worth having at all.
		assert!(reads_as_a_word("0shit"));
		assert!(reads_as_a_word("shite"));
		assert!(!reads_as_a_word("k7m2x"));
	}

	#[test]
	fn a_type_is_segments_and_keeps_their_order() {
		let namespace = Namespace::parse("media.image.photo").expect("a type");
		assert_eq!(namespace.segments(), &["media", "image", "photo"][..]);
		assert_eq!(namespace.leaf(), "photo");
		assert_eq!(namespace.to_string(), "media.image.photo");
		assert!(namespace.declares("image"));
		assert!(!namespace.declares("video"));
	}

	#[test]
	fn a_type_with_an_empty_or_shouted_segment_is_refused() {
		assert!(matches!(Namespace::parse("media..photo"), Err(MalformedType::Empty(_))));
		assert!(matches!(Namespace::parse("media."), Err(MalformedType::Empty(_))));
		assert!(matches!(Namespace::parse("Media"), Err(MalformedType::Character('M'))));
		// Letters only, which is what `libs/artifacts` accepts. A segment names a schema and
		// nothing here numbers one.
		assert!(matches!(Namespace::parse("image2"), Err(MalformedType::Character('2'))));
	}

	#[test]
	fn an_unknown_segment_stops_the_chain_and_keeps_what_came_before() {
		let record = envelope("media.image.photo", &[("media", 1), ("image", 1), ("photo", 1)]);
		let known = |name: &str, _: u32| name != "photo";
		assert_eq!(record.chain(known), &["media", "image"][..]);
		assert_eq!(record.chain(|_, _| true), &["media", "image", "photo"][..]);
	}

	#[test]
	fn a_layer_written_above_what_a_reader_knows_is_treated_as_unknown() {
		// The same stop as an unheard-of segment, and deliberately so: a reader that guessed at
		// a shape it has never seen would report whatever the guess produced.
		let record = envelope("media.image.photo", &[("media", 1), ("image", 2), ("photo", 1)]);
		assert_eq!(record.chain(|_, version| version <= 1), &["media"][..]);
	}

	#[test]
	fn a_layer_nothing_declares_is_an_error_rather_than_ignored() {
		let record = envelope("media.image", &[("media", 1), ("image", 1), ("photo", 1)]);
		assert_eq!(record.validate(), Err(Broken::Unreachable("photo".into())));
	}

	#[test]
	fn a_declared_segment_with_no_layer_stops_the_chain_rather_than_failing_the_record() {
		// The promise is broken and it is still not this reader's to repair: the same stop an
		// unknown segment gets, so everything shallower is still good.
		let record = envelope("media.image.photo", &[("media", 1), ("image", 1)]);
		assert_eq!(record.chain(|_, _| true), &["media", "image"][..]);
		assert_eq!(record.validate(), Ok(()));
	}

	#[test]
	fn asking_for_a_layer_that_is_not_there_errors_rather_than_answering_blank() {
		let record = envelope("media.image", &[("media", 1), ("image", 1)]);
		let missing = record.layer::<serde_json::Value>("photo");
		assert_eq!(missing, Err(Broken::Missing("photo".into())));
	}

	#[test]
	fn a_canonical_survives_a_round_trip_and_absent_stays_absent() {
		// Absent is a refusal rather than a guess, so it has to come back absent: a `null` on
		// disk would be a third state for a reader to work out what to do with.
		let mut record = envelope("media.image", &[("media", 1), ("image", 1)]);
		let cid = "44b6081deaf0242ca3bf83d62a3b6c95".to_owned();
		record.canonical = Some(Canonical::Object { cid, extension: "avif".into() });
		let text = serde_json::to_string(&record).expect("serialise");
		assert!(text.contains(r#""canonical":"cid:44b6081deaf0242ca3bf83d62a3b6c95.avif""#), "{text}");
		assert_eq!(serde_json::from_str::<Opaque>(&text).expect("deserialise"), record);

		record.canonical = None;
		let bare = serde_json::to_string(&record).expect("serialise");
		assert!(!bare.contains("canonical"), "{bare}");
		assert_eq!(serde_json::from_str::<Opaque>(&bare).expect("deserialise"), record);
	}

	#[test]
	fn an_envelope_round_trips_through_json() {
		let record = envelope("media.image", &[("media", 1), ("image", 1)]);
		let text = serde_json::to_string(&record).expect("serialise");
		assert_eq!(serde_json::from_str::<Opaque>(&text).expect("deserialise"), record);
		// `type` is a keyword in Rust and the field this whole shape turns on.
		assert!(text.contains("\"type\":\"media.image\""), "{text}");
		assert!(text.contains("\"resource\":\"k7m2x\""), "{text}");
	}
}
