//! host's panel, served from the files its image carries: `index.html` at `/`, never cached, and
//! everything under `_app/immutable/` named by its hash and cached for a year. See
//! spec/architecture/host.md, "The panel is host's own".

use crate::Host;
use axum::extract::{Path, State};
use axum::http::{StatusCode, header};
use axum::response::{IntoResponse, Response};
use std::sync::Arc;

/// Where the build's files sit under the panel's root, and the prefix they are served at.
pub const IMMUTABLE: &str = "_app/immutable";

fn content_type(file: &str) -> &'static str {
	match file.rsplit_once('.').map(|(_, extension)| extension) {
		Some("js") => "text/javascript; charset=utf-8",
		Some("css") => "text/css; charset=utf-8",
		Some("svg") => "image/svg+xml",
		Some("png") => "image/png",
		Some("woff2") => "font/woff2",
		Some("json") => "application/json",
		_ => "application/octet-stream",
	}
}

/// A path the build could have written: segments of its own, none climbing out or hidden.
fn inside(path: &str) -> bool {
	!path.is_empty()
		&& path.split('/').all(|segment| !segment.is_empty() && !segment.starts_with('.'))
}

pub async fn index(State(host): State<Arc<Host>>) -> Response {
	match tokio::fs::read(host.config.panel_root.join("index.html")).await {
		Ok(bytes) => (
			[(header::CONTENT_TYPE, "text/html; charset=utf-8"), (header::CACHE_CONTROL, "no-cache")],
			bytes,
		)
			.into_response(),
		Err(_) => response::failure(StatusCode::NOT_FOUND, "no_such_route"),
	}
}

pub async fn immutable(State(host): State<Arc<Host>>, Path(path): Path<String>) -> Response {
	if !inside(&path) {
		return response::failure(StatusCode::NOT_FOUND, "no_such_route");
	}
	match tokio::fs::read(host.config.panel_root.join(IMMUTABLE).join(&path)).await {
		Ok(bytes) => (
			[
				(header::CONTENT_TYPE, content_type(&path)),
				(header::CACHE_CONTROL, "public, max-age=31536000, immutable"),
			],
			bytes,
		)
			.into_response(),
		Err(_) => response::failure(StatusCode::NOT_FOUND, "no_such_route"),
	}
}

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn serves_only_what_the_build_could_have_written() {
		assert!(inside("entry/c0409223f1e28ea5.js"));
		for outside in ["", "../index.html", "entry/../../x", "entry//x", ".env", "entry/.x"] {
			assert!(!inside(outside), "{outside}");
		}
		assert_eq!(content_type("assets/6d14c14b0b38186f.css"), "text/css; charset=utf-8");
	}
}
