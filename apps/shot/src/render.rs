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

/// Where a capture reports each step it takes, in the order it takes it: `TaskEvents` outside
/// tests, and a small recorder in a test that checks the sequence. See
/// spec/architecture/ledger.md, "A task, and the events that make it up".
pub trait Events: Send + Sync {
	fn event(&self, stage: &str, level: ledger::Level, message: String, data: serde_json::Value);
}

/// Nothing to tell: a test's renderer that does not care, or a capture with no ledger to tell.
impl Events for () {
	fn event(&self, _stage: &str, _level: ledger::Level, _message: String, _data: serde_json::Value) {
	}
}

impl Events for ledger::TaskEvents {
	fn event(&self, stage: &str, level: ledger::Level, message: String, data: serde_json::Value) {
		ledger::TaskEvents::event(self, stage, level, message, data);
	}
}

pub trait Render: Send + Sync + 'static {
	/// The capture, or why there is none, in words a caller may read; its steps are told to `events`
	/// as it takes them.
	fn capture(
		&self,
		asked: &Asked,
		events: &dyn Events,
	) -> impl Future<Output = Result<Capture, String>> + Send;
}

#[cfg(test)]
mod tests {
	use super::*;
	use std::sync::Mutex;
	use url::Url;

	/// Records each stage's name, in the order it arrives.
	#[derive(Default)]
	struct Recorder(Mutex<Vec<String>>);

	impl Events for Recorder {
		fn event(
			&self,
			stage: &str,
			_level: ledger::Level,
			_message: String,
			_data: serde_json::Value,
		) {
			self.0.lock().unwrap().push(stage.to_owned());
		}
	}

	/// A renderer that reports the stages a real one would, without a browser.
	struct Fake;

	impl Render for Fake {
		async fn capture(&self, asked: &Asked, events: &dyn Events) -> Result<Capture, String> {
			events.event("resolving", ledger::Level::Info, "resolved".into(), serde_json::json!({}));
			events.event("loading", ledger::Level::Info, "loaded".into(), serde_json::json!({}));
			events.event("waiting", ledger::Level::Info, "waited".into(), serde_json::json!({}));
			events.event("capturing", ledger::Level::Info, "captured".into(), serde_json::json!({}));
			events.event("encoded", ledger::Level::Info, "encoded".into(), serde_json::json!({}));
			Ok(Capture {
				png: b"png".to_vec(),
				webp: Some(b"webp".to_vec()),
				width: asked.width,
				height: asked.height,
				observed: serde_json::Value::Null,
			})
		}
	}

	#[tokio::test]
	async fn a_capture_reports_its_stages_in_order() {
		let asked = Asked {
			url: Url::parse("https://example.test/").unwrap(),
			width: 1280,
			height: 800,
			full: false,
			internal: false,
			insecure: false,
			timeout: 15_000,
			delay: 210,
		};
		let recorder = Recorder::default();
		Fake.capture(&asked, &recorder).await.unwrap();
		assert_eq!(
			recorder.0.into_inner().unwrap(),
			["resolving", "loading", "waiting", "capturing", "encoded"]
		);
	}
}
