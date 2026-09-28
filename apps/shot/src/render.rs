//! What turns an ask into pictures. A trait, so the service is tested without a browser; the one
//! that drives Chromium is `browser`.

use crate::asked::Asked;
use std::future::Future;

/// One capture, in both formats; WebP is absent when the page is taller than WebP can hold.
pub struct Capture {
	pub png: Vec<u8>,
	pub webp: Option<Vec<u8>>,
}

pub trait Render: Send + Sync + 'static {
	/// The capture, or why there is none, in words a caller may read.
	fn capture(&self, asked: &Asked) -> impl Future<Output = Result<Capture, String>> + Send;
}
