use serde::Deserialize;
use std::collections::BTreeMap;

#[derive(Debug, Clone, Deserialize)]
pub struct Media {
	pub created: String,
	pub updated: String,
	pub blake3: String,
	#[serde(flatten)]
	pub body: Body,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum Body {
	Image(Image),
	Video(Video),
}

#[derive(Debug, Clone, Deserialize)]
pub struct Image {
	pub thumbhash: String,
	pub source: Source,
	#[serde(default)]
	pub metadata: Option<crate::image::exif::Metadata>,
	pub variants: BTreeMap<String, Variant>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Video {
	pub source: VideoSource,
	pub poster: String,
	pub variants: BTreeMap<String, VideoVariant>,
	#[serde(default)]
	pub captions: BTreeMap<String, Caption>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Source {
	pub mime: String,
	pub width: u32,
	pub height: u32,
	pub ratio: String,
	pub bytes: u64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Variant {
	pub mime: String,
	pub width: u32,
	pub height: u32,
	pub quality: f32,
	pub bytes: u64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct VideoSource {
	pub mime: String,
	pub width: u32,
	pub height: u32,
	pub ratio: String,
	pub bytes: u64,
	pub duration: f64,
	pub frame_rate: f64,
	pub frames: u64,
	pub audio: bool,
	#[serde(default)]
	pub loudness: Option<f64>,
	#[serde(default)]
	pub peak: Option<f64>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct VideoVariant {
	pub mime: String,
	pub width: u32,
	pub height: u32,
	pub bytes: u64,
	pub codec: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Caption {
	pub mime: String,
	pub language: String,
	pub kind: String,
	pub bytes: u64,
}
