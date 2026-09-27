//! All of Caddy, rendered from host's state: written to the file Caddy starts from, then loaded
//! through its admin socket. Never a patch, never Caddy's own autosave. See
//! spec/architecture/host.md, "host renders all of Caddy, and Caddy remembers nothing".
//!
//! The shape follows what Caddy's own adapter made of the Caddyfile this replaces: one wildcard
//! route per suffix, a guard on the source address first, and a subroute of names inside it.

use crate::config::{CaddyConfig, PORT};
use crate::store::{Deployed, Route};
use serde_json::{Value, json};
use std::path::Path;

#[derive(Debug, thiserror::Error)]
pub enum Error {
	#[error("writing {path}: {source}")]
	Write { path: String, source: std::io::Error },
	#[error("Caddy's admin socket: {0}")]
	Admin(#[from] deploy::http::Error),
	#[error("Caddy refused the configuration ({status}): {body}")]
	Refused { status: u16, body: String },
}

/// Upstream, as Caddy dials it.
struct Target {
	name: String,
	dial: String,
}

fn proxy(dial: &str) -> Value {
	json!({ "handler": "reverse_proxy", "upstreams": [{ "dial": dial }] })
}

fn named(host: String, handle: Vec<Value>) -> Value {
	json!({ "match": [{ "host": [host] }], "handle": [{ "handler": "subroute", "routes": [{ "handle": handle }] }] })
}

fn abort() -> Value {
	json!({ "handle": [{ "handler": "static_response", "abort": true }] })
}

fn refuse_unless(sources: &[String]) -> Value {
	json!({
		"match": [{ "not": [{ "remote_ip": { "ranges": sources } }] }],
		"handle": [{ "handler": "static_response", "abort": true }]
	})
}

/// Each API scope, its prefix stripped before the service sees the request. See
/// spec/architecture/services.md, "One API host, scoped by path".
fn scopes(apps: &[Deployed]) -> Vec<Value> {
	let mut routes: Vec<Value> = apps
		.iter()
		.filter(|app| app.manifest.api.is_some())
		.map(|app| {
			let name = &app.manifest.name;
			json!({
				"match": [{ "path": [format!("/{name}"), format!("/{name}/*")] }],
				"handle": [
					{ "handler": "rewrite", "strip_path_prefix": format!("/{name}") },
					proxy(&format!("{name}:{}", app.manifest.container.port)),
				]
			})
		})
		.collect();
	routes.push(json!({ "handle": [{ "handler": "static_response", "status_code": 404 }] }));
	routes
}

/// Everything reached by a subdomain of its own on one side: host's panel, each app with an
/// interface, each route.
fn interfaces(apps: &[Deployed], routes: &[Route], own: &str, public: bool) -> Vec<Target> {
	let mut targets = vec![Target { name: "host".into(), dial: format!("{own}:{PORT}") }];
	targets.extend(
		apps
			.iter()
			.filter(|app| {
				app.manifest.interface.as_ref().is_some_and(|interface| !public || interface.public)
			})
			.map(|app| Target {
				name: app.manifest.name.clone(),
				dial: format!("{}:{}", app.manifest.name, app.manifest.container.port),
			}),
	);
	targets.extend(
		routes
			.iter()
			.filter(|route| if public { route.public } else { route.private })
			.map(|route| Target { name: route.name.clone(), dial: route.upstream.clone() }),
	);
	targets
}

pub fn render(config: &CaddyConfig, own: &str, apps: &[Deployed], routes: &[Route]) -> Value {
	let private = &config.private_suffix;
	let public = &config.public_suffix;

	let mut inside = vec![refuse_unless(&config.private_sources)];
	inside.push(json!({
		"match": [{ "host": [format!("api.{private}")] }],
		"handle": [{ "handler": "subroute", "routes": scopes(apps) }]
	}));
	for target in interfaces(apps, routes, own, false) {
		inside.push(named(format!("{}.{private}", target.name), vec![proxy(&target.dial)]));
	}
	inside.push(abort());

	let mut outside = vec![refuse_unless(std::slice::from_ref(&config.tunnel_source))];
	for target in interfaces(apps, routes, own, true) {
		outside.push(named(format!("{}.{public}", target.name), vec![proxy(&target.dial)]));
	}
	outside.push(json!({ "handle": [{ "handler": "static_response", "status_code": 404 }] }));

	// The visitor's address comes from Cloudflare's header, and only when cloudflared sent it.
	let trusted = json!({ "source": "static", "ranges": [config.tunnel_source] });
	json!({
		"admin": { "listen": config.admin_listen, "config": { "persist": false } },
		"apps": {
			"http": { "servers": {
				"private": {
					"listen": [":443"],
					"routes": [{
						"match": [{ "host": [format!("*.{private}")] }],
						"handle": [{ "handler": "subroute", "routes": inside }],
						"terminal": true
					}],
					"trusted_proxies": trusted,
					"client_ip_headers": ["Cf-Connecting-Ip"]
				},
				"tunnel": {
					"listen": [":80"],
					"routes": [{
						"match": [{ "host": [format!("*.{public}")] }],
						"handle": [{ "handler": "subroute", "routes": outside }],
						"terminal": true
					}],
					"trusted_proxies": trusted,
					"client_ip_headers": ["Cf-Connecting-Ip"]
				}
			}},
			"tls": { "automation": { "policies": [{
				"subjects": [format!("*.{private}")],
				"issuers": [{
					"module": "acme",
					"email": config.acme_email,
					"challenges": { "dns": {
						"provider": { "name": "cloudflare", "api_token": "{env.CLOUDFLARE_API_TOKEN}" },
						"resolvers": [config.dns_resolver]
					}}
				}]
			}]}}
		}
	})
}

/// Write the file first, then load it: a Caddy that restarts before host is back starts from what
/// was last applied rather than from nothing.
pub async fn apply(config: &CaddyConfig, rendered: &Value) -> Result<(), Error> {
	let bytes = serde_json::to_vec_pretty(rendered).unwrap_or_default();
	write(&config.config_file, &bytes).await?;
	let (status, body) = deploy::http::post_unix(&config.admin_socket, "/load", bytes).await?;
	if status >= 300 {
		return Err(Error::Refused { status, body });
	}
	Ok(())
}

/// Through a temporary file and a rename, so Caddy never starts from half of one.
async fn write(path: &Path, bytes: &[u8]) -> Result<(), Error> {
	let failed = |source| Error::Write { path: path.display().to_string(), source };
	if let Some(parent) = path.parent() {
		tokio::fs::create_dir_all(parent).await.map_err(failed)?;
	}
	let temporary = path.with_extension("json.next");
	tokio::fs::write(&temporary, bytes).await.map_err(failed)?;
	tokio::fs::rename(&temporary, path).await.map_err(failed)
}

#[cfg(test)]
mod tests {
	use super::*;
	use deploy::Manifest;

	fn config() -> CaddyConfig {
		CaddyConfig {
			container: "caddy".into(),
			admin_socket: "/nowhere/admin.sock".into(),
			config_file: "/nowhere/caddy.json".into(),
			admin_listen: "unix//run/caddy/admin.sock".into(),
			private_suffix: "inside.test".into(),
			public_suffix: "outside.test".into(),
			private_sources: vec!["10.0.0.0/24".into()],
			tunnel_source: "172.30.0.20".into(),
			acme_email: "someone@example.com".into(),
			dns_resolver: "1.1.1.1".into(),
		}
	}

	fn geo() -> Deployed {
		Deployed {
			manifest: Manifest::parse(include_str!("../../geo/service.toml")).unwrap(),
			image: "sha256:a".into(),
			previous: None,
			deployed_at: String::new(),
		}
	}

	fn text(value: &Value) -> String {
		serde_json::to_string(value).unwrap()
	}

	#[test]
	fn an_api_is_a_scope_with_its_prefix_stripped_and_nothing_public() {
		let rendered = text(&render(&config(), "host", &[geo()], &[]));
		assert!(rendered.contains(r#""host":["api.inside.test"]"#));
		assert!(rendered.contains(r#""path":["/geo","/geo/*"]"#));
		assert!(rendered.contains(r#""strip_path_prefix":"/geo""#));
		assert!(rendered.contains(r#""dial":"geo:23440""#));
		// geo declares no interface and a private API, so nothing of it reaches the public suffix.
		assert!(!rendered.contains("geo.outside.test"));
		assert!(!rendered.contains("geo.inside.test"));
	}

	#[test]
	fn the_source_guard_comes_first_on_both_sides() {
		let rendered = render(&config(), "host", &[], &[]);
		let servers = &rendered["apps"]["http"]["servers"];
		for (server, source) in [("private", "10.0.0.0/24"), ("tunnel", "172.30.0.20")] {
			let first = &servers[server]["routes"][0]["handle"][0]["routes"][0];
			assert_eq!(first["match"][0]["not"][0]["remote_ip"]["ranges"][0], source);
		}
	}

	#[test]
	fn a_route_appears_on_the_sides_it_asks_for() {
		let nas =
			Route { name: "nas".into(), upstream: "10.0.0.21:80".into(), private: false, public: true };
		let rendered = text(&render(&config(), "host", &[], &[nas]));
		assert!(rendered.contains("nas.outside.test"));
		assert!(!rendered.contains("nas.inside.test"));
		// host's own panel is on both.
		assert!(rendered.contains("host.inside.test") && rendered.contains("host.outside.test"));
	}

	#[test]
	fn the_render_is_the_same_for_the_same_state() {
		// Stable output is what makes a diff of two renders mean something changed.
		assert_eq!(
			text(&render(&config(), "host", &[geo()], &[])),
			text(&render(&config(), "host", &[geo()], &[]))
		);
	}
}
