//! What turns an ask into pictures. A trait, so the service is tested without a browser; the one
//! that drives Chromium is `browser`.

use crate::asked::Asked;
use std::future::Future;

/// One capture, in both formats; WebP is absent when the page is taller than WebP can hold.
pub struct Capture {
	pub png: Vec<u8>,
	pub webp: Option<Vec<u8>>,
	/// The pictures' size in pixels: the viewport's width, and its height or the page's.
	pub width: u32,
	pub height: u32,
	/// What the page did while it was captured: its `page`, `load`, `connection` and `health`.
	pub observed: serde_json::Value,
}

pub trait Render: Send + Sync + 'static {
	/// The capture, or why there is none, in words a caller may read.
	fn capture(&self, asked: &Asked) -> impl Future<Output = Result<Capture, String>> + Send;
}
