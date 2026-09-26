use super::*;

/// A picture made from `cid`, published as one AVIF variant per `(content, width, height)`.
///
/// The rid is the caller's to choose rather than allocated here: a test that has two records
/// usually cares that one names the other, and an id it did not pick is one it cannot name.
pub fn picture(
	resource: &str,
	cid: &str,
	dimension: (u32, u32),
	variants: &[(&str, u32, u32)],
) -> Media {
	let (width, height) = dimension;
	let mut layers = Layers::of(layer::Media {
		version: layer::Media::VERSION,
		origin: vec![Origin { blake3: cid.to_owned(), mime: "image/png".into(), bytes: 1 }],
	});
	layers.image = Some(layer::Image {
		version: layer::Image::VERSION,
		thumbhash: None,
		placeholder: None,
		dimension: Dimension { width, height, aspect: ratio_of(width, height) },
		resolution: Some(Resolution { width, height }),
		variants: variants
			.iter()
			.map(|(content, width, height)| ImageVariant {
				content: (*content).to_owned(),
				mime: "image/avif".into(),
				bytes: 1,
				resolution: Some(Resolution { width: *width, height: *height }),
				quality: Some(0.68),
			})
			.collect(),
	});
	record(resource, Namespace::of(&["media", "image"]), layers)
}

/// A site's mark, one file per tone. A tone given no content id is one it does not publish.
pub fn icon(resource: &str, domain: &str, light: Option<&str>, dark: Option<&str>) -> Media {
	let file = |content: &str| ImageVariant {
		content: content.to_owned(),
		mime: "image/png".into(),
		bytes: 1,
		resolution: Some(Resolution { width: 32, height: 32 }),
		quality: None,
	};
	let origin =
		|content: &str| Origin { blake3: content.to_owned(), mime: "image/png".into(), bytes: 1 };
	let mut layers = Layers::of(layer::Media {
		version: layer::Media::VERSION,
		origin: light.iter().chain(dark.iter()).map(|content| origin(content)).collect(),
	});
	layers.image = Some(layer::Image {
		version: layer::Image::VERSION,
		thumbhash: None,
		placeholder: None,
		dimension: Dimension { width: 32, height: 32, aspect: "1:1".into() },
		resolution: Some(Resolution { width: 32, height: 32 }),
		variants: Vec::new(),
	});
	layers.icon = Some(layer::Icon {
		version: layer::Icon::VERSION,
		domain: domain.to_owned(),
		tones: Tones { light: light.map(file), dark: dark.map(file) },
	});
	record(resource, Namespace::of(&["media", "image", "icon"]), layers)
}

/// A clip made from `cid`: 1080p, silent, one second, covered by the frame `cover` names.
///
/// The numbers a test cares about are set on the record it gets back, through `video_mut`.
/// Every clip here would otherwise take eleven source fields to say one thing about one.
pub fn clip(resource: &str, cid: &str, cover: &str, rungs: &[&str], tracks: &[&str]) -> Media {
	let mut layers = Layers::of(layer::Media {
		version: layer::Media::VERSION,
		origin: vec![Origin { blake3: cid.to_owned(), mime: "video/mp4".into(), bytes: 1 }],
	});
	layers.video = Some(layer::Video {
		version: layer::Video::VERSION,
		source: VideoSource {
			mime: "video/mp4".into(),
			width: 1920,
			height: 1080,
			aspect: "16:9".into(),
			bytes: 1,
			duration: 1.0,
			frame_rate: 30.0,
			frames: 30,
			audio: false,
			loudness: None,
			peak: None,
		},
		cover: ResourceId::parse(cover).expect("a rid"),
		variants: rungs
			.iter()
			.map(|content| VideoVariant {
				content: (*content).to_owned(),
				mime: "video/mp4".into(),
				bytes: 1,
				resolution: Resolution { width: 1920, height: 1080 },
				codec: "av01.0.05M.08".into(),
			})
			.collect(),
		tracks: tracks
			.iter()
			.map(|content| Track {
				content: (*content).to_owned(),
				mime: "text/vtt".into(),
				language: "en".into(),
				kind: "captions".into(),
				bytes: 1,
			})
			.collect(),
	});
	layers.clip = Some(layer::Clip { version: layer::Clip::VERSION, excerpt: None });
	record(resource, Namespace::of(&["media", "video", "clip"]), layers)
}

/// The envelope around either.
fn record(resource: &str, namespace: Namespace, layers: Layers) -> Media {
	Media {
		canonical: canonical_of(&layers),
		version: VERSION,
		resource: ResourceId::parse(resource).expect("a rid"),
		namespace,
		created: "2026-09-14T00:00:00Z".into(),
		updated: "2026-09-14T00:00:00Z".into(),
		layers,
	}
}
