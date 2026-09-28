//! host's panel, served from the static export its image carries: a page of fixed address as the
//! file SvelteKit prerendered for it, any other path as the fallback shell, and the build's own
//! files, cached for a year under `_app/immutable/`. See spec/architecture/host.md, "The panel is
//! host's own".

use crate::Host;
use axum::extract::{Path, State};
use axum::http::{Method, StatusCode, Uri, header};
use axum::response::{IntoResponse, Response};
use std::sync::Arc;

/// The shell every path without a prerendered page of its own is answered with.
const FALLBACK: &str = "200.html";

fn content_type(file: &str) -> &'static str {
	match file.rsplit_once('.').map(|(_, extension)| extension) {
		Some("html") => "text/html; charset=utf-8",
		Some("js") => "text/javascript; charset=utf-8",
		Some("css") => "text/css; charset=utf-8",
		Some("json") => "application/json",
		Some("svg") => "image/svg+xml",
		Some("png") => "image/png",
		Some("woff2") => "font/woff2",
		_ => "application/octet-stream",
	}
}

/// A path the build could have written: segments of its own, none climbing out or hidden.
fn inside(path: &str) -> bool {
	!path.is_empty()
		&& path.split('/').all(|segment| !segment.is_empty() && !segment.starts_with('.'))
}

async fn file(host: &Host, relative: &str, cache: &'static str) -> Option<Response> {
	let bytes = tokio::fs::read(host.config.panel_root.join(relative)).await.ok()?;
	let headers = [(header::CONTENT_TYPE, content_type(relative)), (header::CACHE_CONTROL, cache)];
	Some((headers, bytes).into_response())
}

fn missing() -> Response {
	response::failure(StatusCode::NOT_FOUND, "no_such_route")
}

/// The build's own files: named by their hash under `immutable/`, and so kept a year; anything
/// else of the build's, such as its version, asked again every time.
pub async fn build(State(host): State<Arc<Host>>, Path(path): Path<String>) -> Response {
	if !inside(&path) {
		return missing();
	}
	let cache =
		if path.starts_with("immutable/") { "public, max-age=31536000, immutable" } else { "no-cache" };
	file(&host, &format!("_app/{path}"), cache).await.unwrap_or_else(missing)
}

/// A page: the one prerendered for this address, or the fallback shell the browser fills in.
pub async fn page(State(host): State<Arc<Host>>, method: Method, uri: Uri) -> Response {
	if method != Method::GET && method != Method::HEAD {
		return missing();
	}
	let path = uri.path().trim_matches('/');
	let own = if path.is_empty() {
		Some("index.html".to_owned())
	} else {
		inside(path).then(|| format!("{path}.html"))
	};
	if let Some(own) = own
		&& let Some(found) = file(&host, &own, "no-cache").await
	{
		return found;
	}
	file(&host, FALLBACK, "no-cache").await.unwrap_or_else(missing)
}

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn serves_only_what_the_build_could_have_written() {
		assert!(inside("immutable/entry/app.DfC2bSYP.js"));
		for outside in
			["", "../index.html", "immutable/../../x", "immutable//x", ".env", "immutable/.x"]
		{
			assert!(!inside(outside), "{outside}");
		}
		assert_eq!(content_type("routes.html"), "text/html; charset=utf-8");
		assert_eq!(content_type("version.json"), "application/json");
	}
}
