use super::*;

/// The legacy records below, converted the way `local migrate` converts them.
///
/// `Merged` refuses this shape now -- a record with no id does not load -- so a fixture in it
/// goes through the one conversion that grants one. The ids are handed out in key order rather
/// than allocated, so a test may name the rid a record will answer to.
fn merged_of(records: &str) -> Merged {
	let text = format!(
		r#"{{ "version": 3, "created": "2026-07-30T13:14:52Z",
		   "updated": "2026-07-30T13:14:52Z", "media": {{ {records} }} }}"#
	);
	let unnamed: Unnamed = serde_json::from_str(&text).expect("a manifest");
	let granted: BTreeMap<String, ResourceId> =
		unnamed.media.keys().enumerate().map(|(index, key)| (key.clone(), rid(index))).collect();
	let named = |cid: &str| granted.get(cid).copied();
	let media = unnamed
		.media
		.into_iter()
		.map(|(key, record)| {
			let adopted = adopt(record, granted[&key], &named).expect("a record");
			(key, adopted)
		})
		.collect();
	Merged {
		version: VERSION,
		created: "2026-07-30T13:14:52Z".into(),
		updated: "2026-07-30T13:14:52Z".into(),
		media,
	}
}

fn rid(index: usize) -> ResourceId {
	ResourceId::parse(&format!("k{index:04}")).expect("a rid")
}

fn derived_of(cid: &str) -> Derived {
	Derived {
		cid: cid.to_owned(),
		width: 1960,
		height: 1274,
		thumb: vec![1, 2, 3],
		variants: Vec::new(),
	}
}

#[test]
fn reduces_a_ratio_exactly() {
	assert_eq!(ratio_of(1920, 1080), "16:9");
	assert_eq!(ratio_of(800, 600), "4:3");
	assert_eq!(ratio_of(500, 500), "1:1");
}

#[test]
fn does_not_pretend_an_awkward_ratio_is_a_familiar_one() {
	// A screenshot is whatever the window was. Snapping this to 16:9 would be a lie that
	// an aspect-ratio box would then render wrong.
	assert_eq!(ratio_of(2356, 1204), "589:301");
}

#[test]
fn survives_a_zero_dimension() {
	assert_eq!(ratio_of(0, 0), "0:0");
}

#[test]
fn timestamps_are_iso_8601_in_utc() {
	let value = now();
	assert!(value.ends_with('Z'), "not UTC: {value}");
	assert!(value.contains('T'), "not ISO 8601: {value}");
}

const LEGACY_CID: &str = "0e0624f079e617e53ed474ccd98a947b";

/// One record copied verbatim out of `data/record/metadata.json`, which is still written in
/// the shape versions 3 and 4 share. The conversion's whole claim is about real records, so
/// the evidence is one of them rather than one written to fit.
const LEGACY_IMAGE: &str = r#""0e0624f079e617e53ed474ccd98a947b": {
	"type": "image",
	"created": "2026-09-14T02:55:32.15685Z",
	"updated": "2026-09-14T02:55:32.15685Z",
	"blake3": "0e0624f079e617e53ed474ccd98a947b",
	"thumbhash": "+vcJBYCIh5iIh3ePhkeHcoiIj4f4",
	"source": { "mime": "image/png", "width": 1960, "height": 1274, "ratio": "20:13",
		"bytes": 477086 },
	"metadata": { "color_space": "sRGB" },
	"variants": { "20805a43fdc2119f1aa8fae25c0ff8e1": { "mime": "image/avif", "width": 640,
		"height": 416, "quality": 0.68, "bytes": 2253 } }
}"#;

#[test]
fn a_record_written_before_resources_keeps_every_field_it_had() {
	// The one failure that matters here is a loader that drops something. Each field of the
	// old shape is asserted where it landed, rather than the record merely parsing.
	let merged = merged_of(LEGACY_IMAGE);
	let media = merged.media.get(LEGACY_CID).expect("keyed by the original's cid");
	let image = media.image().expect("a picture");
	assert_eq!(media.version, VERSION);
	assert_eq!(media.created, "2026-09-14T02:55:32.15685Z");
	assert_eq!(media.origin().map(|origin| origin.blake3.as_str()), Some(LEGACY_CID));
	assert_eq!(media.origin().map(|origin| origin.bytes), Some(477_086));
	assert_eq!(image.thumbhash.as_deref(), Some("+vcJBYCIh5iIh3ePhkeHcoiIj4f4"));
	assert_eq!(image.dimension.width, 1960);
	assert_eq!(image.dimension.aspect, "20:13");
	assert_eq!(image.resolution, Some(Resolution { width: 1960, height: 1274 }));
	let variant = image.variants.first().expect("a variant");
	assert_eq!(variant.content, "20805a43fdc2119f1aa8fae25c0ff8e1");
	assert_eq!(variant.resolution, Some(Resolution { width: 640, height: 416 }));
	assert_eq!(variant.quality, Some(0.68));
	assert_eq!(variant.bytes, 2253);
}

#[test]
fn a_record_with_no_id_does_not_load_and_the_error_says_what_to_run() {
	// An id minted on the way in is different on every read, and the first thing to write one
	// into an article would write a number the next process cannot resolve. So the shape
	// without one stops here and `local migrate` is the only reader of it.
	let text =
		format!(r#"{{ "version": 3, "created": "", "updated": "", "media": {{ {LEGACY_IMAGE} }} }}"#);
	let error = serde_json::from_str::<Merged>(&text).expect_err("a refusal").to_string();
	assert!(error.contains("local migrate"), "{error}");
}

#[test]
fn converting_a_record_twice_gives_the_same_record() {
	// Deterministic, which is the property that granting the id outside this file buys: the
	// conversion allocates nothing, so two reads of one file cannot disagree about identity.
	assert_eq!(merged_of(LEGACY_IMAGE), merged_of(LEGACY_IMAGE));
}

#[test]
fn extraction_that_found_no_camera_becomes_a_screenshot() {
	// The three states the `metadata` container used to carry are now the chain: a leaf of
	// `screenshot` says extraction ran, and what it found is still in the layer.
	let merged = merged_of(LEGACY_IMAGE);
	let media = merged.media.values().next().expect("one record");
	assert_eq!(media.namespace.to_string(), "media.image.screenshot");
	let screenshot = media.layers.screenshot.as_ref().expect("a screenshot layer");
	assert_eq!(screenshot.metadata.color_space.as_deref(), Some("sRGB"));
	assert_eq!(media.validate(), Ok(()));
}

#[test]
fn a_picture_nobody_extracted_is_left_unclassified() {
	let without = LEGACY_IMAGE.replace(r#""metadata": { "color_space": "sRGB" },"#, "");
	let merged = merged_of(&without);
	let media = merged.media.values().next().expect("one record");
	assert_eq!(media.namespace.to_string(), "media.image");
	assert!(media.layers.screenshot.is_none());
	assert_eq!(media.validate(), Ok(()));
}

#[test]
fn camera_data_makes_it_a_photograph() {
	let with = LEGACY_IMAGE.replace(
		r#""metadata": { "color_space": "sRGB" },"#,
		r#""metadata": { "camera": { "model": "iPhone" } },"#,
	);
	let merged = merged_of(&with);
	let media = merged.media.values().next().expect("one record");
	assert_eq!(media.namespace.to_string(), "media.image.photo");
	let photo = media.layers.photo.as_ref().expect("a photo layer");
	let model = photo.metadata.camera.as_ref().and_then(|camera| camera.model.as_deref());
	assert_eq!(model, Some("iPhone"));
	// Flattened, so what a sensor recorded sits at the top of the layer rather than under a
	// second name for the layer itself.
	let written = serde_json::to_string(photo).expect("serialise");
	assert!(written.contains(r#""camera":{"model":"iPhone"}"#), "{written}");
}

const LEGACY_CLIP: &str = r#""aa11bb22cc33dd44ee55ff6677889900": {
	"type": "video",
	"created": "2026-09-14T00:00:00Z",
	"updated": "2026-09-14T00:00:00Z",
	"blake3": "aa11bb22cc33dd44ee55ff6677889900",
	"source": { "mime": "video/mp4", "width": 1920, "height": 1080, "ratio": "16:9",
		"bytes": 4112384, "duration": 25.5, "frame_rate": 30.0, "frames": 765, "audio": true },
	"poster": "0e0624f079e617e53ed474ccd98a947b",
	"variants": { "cc33dd44ee55ff667788990011223344": { "mime": "video/mp4", "width": 1920,
		"height": 1080, "bytes": 4000000, "codec": "av01.0.05M.08" } },
	"captions": { "dd44ee55": { "mime": "text/vtt", "language": "en", "kind": "captions",
		"bytes": 812 } }
}"#;

#[test]
fn a_clip_keeps_its_rungs_its_tracks_and_what_its_cover_is() {
	// A track was cut to this excerpt by hand or bought from a model, and nothing here can
	// rebuild one. The cover is the field the poster cid became: the conversion resolves it
	// against the rest of the manifest, because a resource is named by a rid and never a hash.
	let merged = merged_of(&format!("{LEGACY_CLIP}, {LEGACY_IMAGE}"));
	let media = merged.media.get("aa11bb22cc33dd44ee55ff6677889900").expect("a clip");
	let poster = merged.media.get(LEGACY_CID).expect("the poster");
	let video = media.video().expect("a video layer");
	assert_eq!(media.namespace.to_string(), "media.video.clip");
	assert_eq!(video.cover, poster.resource);
	assert_eq!(video.variants.len(), 1);
	assert_eq!(video.variants[0].resolution, Resolution { width: 1920, height: 1080 });
	assert_eq!(video.tracks.len(), 1);
	assert_eq!(video.tracks[0].content, "dd44ee55");
	assert_eq!(video.tracks[0].language, "en");
	assert_eq!(video.source.frames, 765);
	assert_eq!(video.source.aspect, "16:9");
	assert!(media.image().is_none());
	assert_eq!(media.validate(), Ok(()));
}

#[test]
fn a_poster_is_still_an_ordinary_picture_until_the_migration_classifies_it() {
	// Reading a record is not the place a thing is reclassified. `local migrate` makes one pass
	// over the whole manifest and says which pictures are frames; a loader that guessed would
	// answer differently depending on which records it had reached.
	let merged = merged_of(&format!("{LEGACY_CLIP}, {LEGACY_IMAGE}"));
	let poster = merged.media.get(LEGACY_CID).expect("the poster");
	assert_eq!(poster.namespace.to_string(), "media.image.screenshot");
	assert!(poster.layers.frame.is_none());
}

#[test]
fn a_layer_this_build_has_never_heard_of_survives_being_read_and_written() {
	// Both sides of a change are pushed together, so the window is minutes -- but a record
	// read and written back inside it must not come out shorter than it went in.
	let merged = merged_of(LEGACY_IMAGE);
	let mut media = merged.media.values().next().expect("one record").clone();
	media.namespace = Namespace::of(&["media", "image", "screenshot", "terminal"]);
	media.layers.unknown.insert(
		"terminal".to_owned(),
		resource::Layer {
			version: 1,
			fields: serde_json::from_str(r#"{ "shell": "fish" }"#).expect("fields"),
		},
	);
	let text = serde_json::to_string(&media).expect("serialise");
	let read: Media = serde_json::from_str(&text).expect("deserialise");
	assert_eq!(read, media);
	assert_eq!(read.validate(), Ok(()));
	assert!(text.contains(r#""terminal":{"version":1,"shell":"fish"}"#), "{text}");
}

#[test]
fn a_record_round_trips_through_json_with_type_spelled_as_a_namespace() {
	let merged = merged_of(LEGACY_IMAGE);
	let media = merged.media.values().next().expect("one record");
	let text = serde_json::to_string(media).expect("serialise");
	assert_eq!(&serde_json::from_str::<Media>(&text).expect("deserialise"), media);
	assert!(text.contains(r#""type":"media.image.screenshot""#), "{text}");
	assert!(text.contains(r#""version":5"#), "{text}");
	assert!(text.contains(r#""resource":"k0000""#), "{text}");
	// Nothing says what a record lacks: no video layers, and no key holding a null.
	assert!(!text.contains("clip"), "{text}");
	assert!(!text.contains("null"), "{text}");
}

#[test]
fn a_record_that_holds_a_rid_keeps_it_through_a_round_trip() {
	let merged = merged_of(LEGACY_IMAGE);
	let mut media = merged.media.values().next().expect("one record").clone();
	media.resource = ResourceId::parse("k7m2x").expect("a rid");
	let text = serde_json::to_string(&media).expect("serialise");
	assert!(text.contains(r#""resource":"k7m2x""#), "{text}");
	assert_eq!(serde_json::from_str::<Media>(&text).expect("deserialise"), media);
}

#[test]
fn a_manifest_written_in_the_new_shape_loads_as_it_was_written() {
	let merged = merged_of(LEGACY_IMAGE);
	let text = serde_json::to_string(&merged).expect("serialise");
	let read: Merged = serde_json::from_str(&text).expect("deserialise");
	assert_eq!(read, merged);
	assert_eq!(read.media.keys().collect::<Vec<_>>(), merged.media.keys().collect::<Vec<_>>());
}

#[test]
fn a_picture_re_derived_keeps_its_id_and_gains_an_origin() {
	// Better bytes for the same subject are another original, not another thing. This is the
	// whole reason identity is granted rather than derived from the bytes.
	let merged = merged_of(LEGACY_IMAGE);
	let mut previous = merged.media.values().next().expect("one record").clone();
	previous.resource = ResourceId::parse("k7m2x").expect("a rid");
	let derived = derived_of("ff00ff00ff00ff00ff00ff00ff00ff00");
	let media = media_for(&derived, "image/png", 5, Some(&previous), None, rid(9));
	assert_eq!(media.resource, previous.resource);
	assert_eq!(media.created, previous.created);
	let origins: Vec<&str> =
		media.layers.media.origin.iter().map(|origin| origin.blake3.as_str()).collect();
	assert_eq!(origins, [LEGACY_CID, "ff00ff00ff00ff00ff00ff00ff00ff00"]);
}

#[test]
fn a_vector_answers_nothing_when_asked_for_pixels() {
	// Absent is the answer: a caller that asks and receives nothing has learned the thing is
	// scalable, with no second field to consult.
	let derived = derived_of("ab");
	let vector = media_for(&derived, "image/svg+xml", 512, None, None, rid(9));
	let bitmap = media_for(&derived, "image/png", 512, None, None, rid(9));
	assert_eq!(vector.image().and_then(|image| image.resolution.clone()), None);
	assert_eq!(
		bitmap.image().and_then(|image| image.resolution.clone()),
		Some(Resolution { width: 1960, height: 1274 })
	);
}

#[test]
fn a_frame_stays_a_frame_when_its_pixels_are_derived_again() {
	let clip = ResourceId::parse("q4w8n").expect("a rid");
	let derived = derived_of("ab");
	let mut frame = media_for(&derived, "image/png", 512, None, None, rid(9));
	assert!(frame.cut_from(clip, Some(1.5)));
	let again = media_for(&derived, "image/png", 512, Some(&frame), None, rid(8));
	assert_eq!(again.namespace.to_string(), "media.image.frame");
	assert_eq!(again.layers.frame.map(|frame| frame.source), Some(clip));
}

/// Three cids in the order they sort, spelled the way `libs/artifacts` insists a canonical is.
const FIRST: &str = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const SECOND: &str = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const THIRD: &str = "cccccccccccccccccccccccccccccccc";

/// A picture's layers, publishing one variant per `(cid, width, height, bytes)`.
fn published_as(variants: &[(&str, u32, u32, u64)]) -> Layers {
	let mut layers = Layers::of(layer::Media { version: layer::Media::VERSION, origin: Vec::new() });
	layers.image = Some(layer::Image {
		version: layer::Image::VERSION,
		thumbhash: None,
		placeholder: None,
		dimension: Dimension { width: 1920, height: 1248, aspect: "40:26".into() },
		resolution: None,
		variants: variants
			.iter()
			.map(|(content, width, height, bytes)| ImageVariant {
				content: (*content).to_owned(),
				mime: "image/avif".into(),
				bytes: *bytes,
				resolution: Some(Resolution { width: *width, height: *height }),
				quality: None,
			})
			.collect(),
	});
	layers
}

/// What a bare id of these layers means, as it is spelled on disk.
fn means(layers: &Layers) -> String {
	canonical_of(layers).expect("a canonical").to_string()
}

#[test]
fn a_bare_id_means_the_largest_variant_there_is() {
	// Quality and not compatibility: `<picture>` answers compatibility on the site, and a
	// short link should hand over the best thing there is.
	let layers =
		published_as(&[(THIRD, 640, 416, 2253), (FIRST, 1920, 1248, 25733), (SECOND, 1280, 832, 9102)]);
	assert_eq!(means(&layers), format!("cid:{FIRST}.avif"));
}

#[test]
fn two_variants_of_one_size_break_on_bytes_and_then_on_the_cid() {
	// Stability is the whole point: two runs over one record have to answer the same, rather
	// than whichever variant a map happened to yield first.
	let bytes = published_as(&[(FIRST, 100, 100, 20), (SECOND, 100, 100, 10)]);
	assert_eq!(means(&bytes), format!("cid:{FIRST}.avif"));
	let cid = published_as(&[(FIRST, 100, 100, 10), (SECOND, 100, 100, 10)]);
	assert_eq!(means(&cid), format!("cid:{SECOND}.avif"));
	let reversed = published_as(&[(SECOND, 100, 100, 10), (FIRST, 100, 100, 10)]);
	assert_eq!(means(&reversed), means(&cid));
}

#[test]
fn a_variant_is_named_the_way_the_file_holding_it_was() {
	// The canonical is an address somebody fetches, so a second spelling of an extension is
	// not a hop -- it is a missing file.
	let mut layers = published_as(&[(FIRST, 100, 100, 10)]);
	layers.image.as_mut().expect("a picture").variants[0].mime = "image/jpeg".into();
	assert_eq!(means(&layers), format!("cid:{FIRST}.jpeg"));
}

#[test]
fn a_variant_reporting_no_pixels_is_not_an_address_to_hand_out() {
	// A vector, which this ladder does not publish and whose name this side would have to
	// guess. A short link that refuses is better than one that resolves to a missing file.
	let mut layers = published_as(&[(FIRST, 100, 100, 10)]);
	let vector = &mut layers.image.as_mut().expect("a picture").variants[0];
	vector.mime = "image/svg+xml".into();
	vector.resolution = None;
	assert_eq!(canonical_of(&layers), None);
}

#[test]
fn a_resource_that_publishes_nothing_declares_nothing() {
	// Inventing a canonical for a record with no object to point at would hand a reader an
	// address to nothing, so the bare id is refused instead.
	assert_eq!(canonical_of(&published_as(&[])), None);
	let bare = Layers::of(layer::Media { version: layer::Media::VERSION, origin: Vec::new() });
	assert_eq!(canonical_of(&bare), None);
	let media = media_for(&derived_of("ab"), "image/png", 512, None, None, rid(9));
	assert_eq!(media.canonical, None);
}

#[test]
fn a_clip_means_its_largest_rung_under_the_one_container_it_is_stored_in() {
	// One codec in one container, so the extension is fixed rather than read off a mime that
	// could only ever say the same thing.
	let mut clip = fixture::clip("q4w8n", "ab", "k7m2x", &[FIRST, SECOND], &[]);
	let rungs = &mut clip.layers.video.as_mut().expect("a clip").variants;
	rungs[1].resolution = Resolution { width: 640, height: 360 };
	assert_eq!(means(&clip.layers), format!("cid:{FIRST}.mp4"));
}

#[test]
fn a_published_record_that_does_not_say_what_it_means_is_stale() {
	// The version number could not report this one: the field joined 5 without moving it, so
	// what is on disk is compared on the field itself rather than on a number.
	let temporary = tempfile::tempdir().expect("temp");
	let metadata = temporary.path();
	let merged = merged_of(LEGACY_IMAGE);
	let media = merged.media.get(LEGACY_CID).expect("the record");
	let path = crate::image::store::meta_path(metadata, media.resource.as_str());

	let mut published = media.clone();
	published.canonical = None;
	let json = serde_json::to_string(&published).expect("json");
	crate::image::store::write(&path, json.as_bytes()).expect("sidecar");
	assert_eq!(migrate(&merged, metadata), vec![LEGACY_CID.to_owned()]);

	let json = serde_json::to_string(media).expect("json");
	crate::image::store::write(&path, json.as_bytes()).expect("sidecar");
	assert!(migrate(&merged, metadata).is_empty());
}

#[test]
fn a_published_record_missing_a_field_a_layer_gained_is_stale_too() {
	// The case the version numbers are designed not to report. A layer gaining a field raises
	// nothing above it -- by spec/architecture/resource.md, an additive change is the row a
	// reader ignores -- so the envelope still says 5 and the published copy sat there with a
	// placeholder no page could paint. Comparing the record is what notices.
	let temporary = tempfile::tempdir().expect("temp");
	let metadata = temporary.path();
	let merged = merged_of(LEGACY_IMAGE);
	let media = merged.media.get(LEGACY_CID).expect("the record");
	let path = crate::image::store::meta_path(metadata, media.resource.as_str());

	let mut published = media.clone();
	published.layers.image.as_mut().expect("a picture").placeholder = None;
	assert_eq!(published.version, media.version);
	let json = serde_json::to_string(&published).expect("json");
	crate::image::store::write(&path, json.as_bytes()).expect("sidecar");
	assert_eq!(migrate(&merged, metadata), vec![LEGACY_CID.to_owned()]);
}

#[test]
fn a_record_holding_only_the_hash_is_repainted_without_reading_an_original() {
	// What `local image` does to a corpus published before the decoded form was stored. The
	// hash is on the record already, so this touches no file under data/source.
	let mut merged = merged_of(LEGACY_IMAGE);
	let picture = merged.media.get_mut(LEGACY_CID).expect("the record");
	picture.layers.image.as_mut().expect("a picture").placeholder = None;

	assert_eq!(repaint(&mut merged), 1);
	let painted = merged
		.media
		.get(LEGACY_CID)
		.and_then(|media| media.image())
		.and_then(|image| image.placeholder.clone())
		.expect("a decoded placeholder");
	assert!(painted.starts_with("data:image/webp;base64,"), "{painted}");
	// Idempotent: a record that already carries one is left alone rather than re-encoded.
	assert_eq!(repaint(&mut merged), 0);
}

#[test]
fn a_record_read_off_disk_gains_what_its_bare_id_means() {
	// The real record, converted the way `local migrate` converts it: one variant, so the
	// largest is the only one, and the spelling is the one `libs/artifacts` validates.
	let merged = merged_of(LEGACY_IMAGE);
	let media = merged.media.get(LEGACY_CID).expect("the record");
	let canonical = media.canonical.clone().expect("a canonical");
	assert_eq!(canonical.to_string(), "cid:20805a43fdc2119f1aa8fae25c0ff8e1.avif");
}
