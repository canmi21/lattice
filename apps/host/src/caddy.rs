//! All of Caddy, rendered from host's state: written to the file Caddy starts from, then loaded
//! through its admin socket. Never a patch, never Caddy's own autosave. See
//! spec/architecture/host.md, "host renders all of Caddy, and Caddy remembers nothing".
//!
//! The shape follows what Caddy's own adapter made of the Caddyfile this replaces: one wildcard
//! route per suffix, a guard on the source address first, and a subroute of names inside it.

use crate::config::CaddyConfig;
use crate::store::{Deployed, Route};
use deploy::manifest::Limit;
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
	home: Option<String>,
}

/// `host:port` is dialed as plain HTTP. `https://host[:port]` is a LAN device that speaks only TLS
/// under its own certificate, like the UniFi router: reached over TLS without verifying it, and
/// with an `Origin` that is exactly this name's own translated into the device's, since it accepts
/// a WebSocket from nowhere else. Any other origin reaches it untouched, for it to refuse. Why
/// neither is checked more strictly is spec/architecture/host.md.
fn proxy(upstream: &str, name: &str) -> Value {
	let Some(address) = upstream.strip_prefix("https://") else {
		return json!({ "handler": "reverse_proxy", "upstreams": [{ "dial": upstream }] });
	};
	let address = address.trim_end_matches('/');
	let dial = if address.contains(':') { address.to_owned() } else { format!("{address}:443") };
	let own = format!("^https://{}$", name.replace('.', "\\."));
	json!({
		"handler": "reverse_proxy",
		"upstreams": [{ "dial": dial }],
		"transport": { "protocol": "http", "tls": { "insecure_skip_verify": true } },
		"headers": { "request": { "replace": { "Origin": [
			{ "search_regexp": own, "replace": format!("https://{address}") }
		]}}}
	})
}

/// Compression for every answer Caddy passes on, so no app has to compress for itself; one that
/// arrives encoded already is passed through. See spec/architecture/host.md, "Every name is
/// compressed at Caddy, and no app compresses for itself".
fn encode() -> Value {
	json!({ "handler": "encode", "encodings": { "zstd": {}, "gzip": {} }, "prefer": ["zstd", "gzip"] })
}

/// One name, proxied to its upstream; a request for exactly `/` goes to the target's home first
/// when it has one.
fn named(host: String, target: &Target) -> Value {
	let mut routes = Vec::new();
	if let Some(home) = &target.home {
		routes.push(json!({
			"match": [{ "path": ["/"] }],
			"handle": [{ "handler": "static_response", "status_code": 307, "headers": { "Location": [home] } }]
		}));
	}
	routes.push(json!({ "handle": [encode(), proxy(&target.dial, &host)] }));
	json!({ "match": [{ "host": [host] }], "handle": [{ "handler": "subroute", "routes": routes }] })
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

/// The gateway's mark, on what it forwards from the public; the same pair as `MARK` in the gateway.
const MARK: (&str, &str) = ("X-Gateway", "public");

/// A scope's limits, counted by the visitor's address on what the gateway forwards, and on nothing
/// else: our own callers meet none. One zone a row, named as the gateway's counters are without
/// the address. See spec/architecture/services.md, "A limit is declared once and kept in three
/// places".
fn limited(scope: &str, limits: &[Limit]) -> Option<Value> {
	if limits.is_empty() {
		return None;
	}
	let zones: serde_json::Map<String, Value> = limits
		.iter()
		.map(|limit| {
			let methods: Vec<String> = limit.methods.iter().map(|method| method.to_lowercase()).collect();
			let path = limit.path.split('/').filter(|part| !part.is_empty()).collect::<Vec<_>>();
			let path = if path.is_empty() { "root".to_owned() } else { path.join("-") };
			let zone = json!({
				"match": [{
					"method": limit.methods,
					"path": [limit.path],
					"header": { MARK.0: [MARK.1] }
				}],
				// The address Caddy took from Cloudflare's header; `http.request.client_ip` is no
				// placeholder, and a key that does not resolve counts everyone as one.
				"key": "{http.vars.client_ip}",
				"window": format!("{}s", limit.seconds),
				"max_events": limit.count
			});
			(format!("{scope}_{}_{path}", methods.join("-")), zone)
		})
		.collect();
	Some(json!({ "handler": "rate_limit", "rate_limits": zones }))
}

/// What a refused call is answered with: the one envelope, never kept by the gateway's cache. The
/// limiter has already said when to try again.
fn refused() -> Value {
	let body = serde_json::to_string(&response::Envelope::error("rate_limited")).unwrap_or_default();
	json!({
		"match": [{ "expression": "{http.error.status_code} == 429" }],
		"handle": [{
			"handler": "static_response",
			"status_code": 429,
			"headers": {
				"Content-Type": ["application/json"],
				"Cache-Control": ["no-store"]
			},
			"body": body
		}]
	})
}

/// Each API scope, its prefix stripped before the service sees the request; on the tunnel's side
/// only the public ones, which the gateway reaches over Workers VPC, and their limits. See
/// spec/architecture/services.md, "A path with no scope is a 400, on both gateways".
fn scopes(apps: &[Deployed], public: bool) -> Vec<Value> {
	let mut routes = vec![json!({
		"match": [{ "path": ["/"] }],
		"handle": [{ "handler": "static_response", "status_code": 400 }]
	})];
	routes.extend(
		apps
			.iter()
			.filter(|app| app.manifest.api.as_ref().is_some_and(|api| !public || api.public))
			.filter_map(|app| {
				let name = &app.manifest.name;
				let port = app.manifest.container.as_ref()?.port?;
				let api = app.manifest.api.as_ref()?;
				let mut handle =
					vec![json!({ "handler": "rewrite", "strip_path_prefix": format!("/{name}") })];
				handle.extend(public.then(|| limited(name, &api.limits)).flatten());
				handle.extend([encode(), proxy(&format!("{name}:{port}"), name)]);
				Some(json!({
					"match": [{ "path": [format!("/{name}"), format!("/{name}/*")] }],
					"handle": handle
				}))
			}),
	);
	routes.push(json!({ "handle": [{ "handler": "static_response", "status_code": 404 }] }));
	routes
}

fn api_host(host: String, apps: &[Deployed], public: bool) -> Value {
	json!({
		"match": [{ "host": [host] }],
		"handle": [{ "handler": "subroute", "routes": scopes(apps, public) }]
	})
}

/// Everything reached by a subdomain of its own on one side: each app with an interface, the panel
/// among them, and each route. host has none: only the panel reaches it.
fn interfaces(apps: &[Deployed], routes: &[Route], public: bool) -> Vec<Target> {
	let mut targets = Vec::new();
	targets.extend(
		apps
			.iter()
			.filter(|app| {
				app.manifest.interface.as_ref().is_some_and(|interface| !public || interface.public)
			})
			.filter_map(|app| {
				Some(Target {
					name: app.manifest.name.clone(),
					dial: format!("{}:{}", app.manifest.name, app.manifest.container.as_ref()?.port?),
					home: app.manifest.interface.as_ref()?.home.clone(),
				})
			}),
	);
	targets.extend(
		routes.iter().filter(|route| if public { route.public } else { route.private }).map(|route| {
			Target { name: route.name.clone(), dial: route.upstream.clone(), home: route.home.clone() }
		}),
	);
	targets
}

pub fn render(config: &CaddyConfig, apps: &[Deployed], routes: &[Route]) -> Value {
	let private = &config.private_suffix;
	let public = &config.public_suffix;

	let mut inside = vec![refuse_unless(&config.private_sources)];
	inside.push(api_host(format!("api.{private}"), apps, false));
	for target in interfaces(apps, routes, false) {
		inside.push(named(format!("{}.{private}", target.name), &target));
	}
	inside.push(abort());

	let mut outside = vec![refuse_unless(std::slice::from_ref(&config.tunnel_source))];
	outside.push(api_host(format!("api.{public}"), apps, true));
	for target in interfaces(apps, routes, true) {
		outside.push(named(format!("{}.{public}", target.name), &target));
	}
	// keeper's one path on the tunnel's side: the Worker reaches it there with a notice, and its
	// interface stays private. See spec/architecture/host.md, "keeper has its own intake".
	let keeper = apps.iter().find(|app| app.manifest.name == "keeper");
	if let Some(port) = keeper.and_then(|keeper| keeper.manifest.container.as_ref()?.port) {
		let name = format!("keeper.{public}");
		let dial = format!("keeper:{port}");
		outside.push(json!({
			"match": [{ "host": [&name], "path": ["/notice"] }],
			"handle": [encode(), proxy(&dial, &name)]
		}));
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
					"errors": { "routes": [refused()] },
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
			admin_listen: "unix//data/admin.sock".into(),
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
			held: false,
		}
	}

	fn text(value: &Value) -> String {
		serde_json::to_string(value).unwrap()
	}

	#[test]
	fn an_api_is_a_scope_with_its_prefix_stripped_and_nothing_public() {
		let mut private = geo();
		private.manifest.api.as_mut().unwrap().public = false;
		let rendered = text(&render(&config(), &[private], &[]));
		assert!(rendered.contains(r#""host":["api.inside.test"]"#));
		assert!(rendered.contains(r#""path":["/geo","/geo/*"]"#));
		assert!(rendered.contains(r#""strip_path_prefix":"/geo""#));
		assert!(rendered.contains(r#""dial":"geo:23440""#));
		// geo declares no interface and a private API, so nothing of it reaches the public suffix.
		assert!(!rendered.contains("geo.outside.test"));
		assert!(!rendered.contains("geo.inside.test"));
		assert_eq!(rendered.matches(r#""dial":"geo:23440""#).count(), 1);
	}

	#[test]
	fn a_public_scope_is_on_the_tunnels_api_host_too() {
		let rendered = render(&config(), &[geo()], &[]);
		let tunnel = &rendered["apps"]["http"]["servers"]["tunnel"]["routes"][0]["handle"][0]["routes"];
		assert_eq!(tunnel[1]["match"][0]["host"][0], "api.outside.test");
		assert_eq!(text(&rendered).matches(r#""dial":"geo:23440""#).count(), 2);
	}

	#[test]
	fn a_limit_counts_what_the_gateway_forwards_on_the_tunnels_side_alone() {
		let rendered = render(&config(), &[geo()], &[]);
		let servers = &rendered["apps"]["http"]["servers"];
		let tunnel = &servers["tunnel"]["routes"][0]["handle"][0]["routes"][1]["handle"][0]["routes"];
		let handle = &tunnel[1]["handle"];
		assert_eq!(handle[0]["handler"], "rewrite");
		assert_eq!(handle[1]["handler"], "rate_limit");
		let zone = &handle[1]["rate_limits"]["geo_get-head_address"];
		assert_eq!(text(&zone["match"][0]["method"]), r#"["GET","HEAD"]"#);
		assert_eq!(zone["match"][0]["path"][0], "/address");
		assert_eq!(zone["match"][0]["header"]["X-Gateway"][0], "public");
		assert_eq!(zone["key"], "{http.vars.client_ip}");
		assert_eq!((zone["window"].as_str(), zone["max_events"].as_u64()), (Some("60s"), Some(60)));
		// The LAN and the tailnet meet no limit.
		assert!(!text(&servers["private"]).contains(r#""handler":"rate_limit""#));
		// A refusal is the envelope, and the gateway keeps none of it.
		let refused = &servers["tunnel"]["errors"]["routes"][0]["handle"][0];
		assert_eq!(refused["status_code"], 429);
		assert_eq!(refused["headers"]["Cache-Control"][0], "no-store");
		assert!(refused["body"].as_str().unwrap().contains(r#""code":"rate_limited""#));
	}

	#[test]
	fn a_scope_with_no_limits_has_no_limiter() {
		let mut free = geo();
		free.manifest.api.as_mut().unwrap().limits.clear();
		assert!(!text(&render(&config(), &[free], &[])).contains(r#""handler":"rate_limit""#));
	}

	#[test]
	fn a_path_with_no_scope_is_malformed() {
		let first = &scopes(&[geo()], false)[0];
		assert_eq!(first["match"][0]["path"][0], "/");
		assert_eq!(first["handle"][0]["status_code"], 400);
	}

	#[test]
	fn every_proxied_answer_is_compressed_first() {
		let nas = Route {
			name: "nas".into(),
			upstream: "10.0.0.21:80".into(),
			private: true,
			public: true,
			home: None,
		};
		// Every list of handlers that proxies has the encoder immediately before the proxy.
		fn check(value: &Value, proxies: &mut usize) {
			match value {
				Value::Array(items) => {
					for (index, item) in items.iter().enumerate() {
						if item["handler"] == "reverse_proxy" {
							*proxies += 1;
							assert!(index > 0 && items[index - 1]["handler"] == "encode", "{items:?}");
						}
						check(item, proxies);
					}
				}
				Value::Object(fields) => fields.values().for_each(|field| check(field, proxies)),
				_ => {}
			}
		}
		let mut proxies = 0;
		check(&render(&config(), &[geo()], &[nas]), &mut proxies);
		assert!(proxies >= 3);
	}

	#[test]
	fn the_source_guard_comes_first_on_both_sides() {
		let rendered = render(&config(), &[], &[]);
		let servers = &rendered["apps"]["http"]["servers"];
		for (server, source) in [("private", "10.0.0.0/24"), ("tunnel", "172.30.0.20")] {
			let first = &servers[server]["routes"][0]["handle"][0]["routes"][0];
			assert_eq!(first["match"][0]["not"][0]["remote_ip"]["ranges"][0], source);
		}
	}

	#[test]
	fn a_route_appears_on_the_sides_it_asks_for() {
		let nas = Route {
			name: "nas".into(),
			upstream: "10.0.0.21:80".into(),
			private: false,
			public: true,
			home: None,
		};
		let rendered = text(&render(&config(), &[], &[nas]));
		assert!(rendered.contains("nas.outside.test"));
		assert!(!rendered.contains("nas.inside.test"));
		// host is on neither: the panel is its only way in.
		assert!(!rendered.contains("host.inside.test") && !rendered.contains("host.outside.test"));
	}

	#[test]
	fn an_apps_declared_home_redirects_its_root() {
		let text = include_str!("../../gemini/service.toml");
		let gemini = Deployed {
			manifest: Manifest::parse(text).unwrap(),
			image: "sha256:g".into(),
			previous: None,
			deployed_at: String::new(),
			held: false,
		};
		let rendered = super::tests::text(&render(&config(), &[gemini], &[]));
		assert!(rendered.contains(r#""Location":["/admin"]"#));
		assert_eq!(rendered.matches(r#""dial":"gemini:20830""#).count(), 2);
	}

	#[test]
	fn a_home_redirects_the_root_and_nothing_else() {
		let gemini = Route {
			name: "gemini".into(),
			upstream: "gemini.test:8083".into(),
			private: true,
			public: true,
			home: Some("/admin".into()),
		};
		let rendered = text(&render(&config(), &[], &[gemini]));
		assert!(rendered.contains(r#""match":[{"path":["/"]}]"#));
		assert!(rendered.contains(r#""Location":["/admin"]"#));
		assert!(rendered.contains(r#""status_code":307"#));
		// Everything past the root still reaches the application, on both sides.
		assert_eq!(rendered.matches(r#""dial":"gemini.test:8083""#).count(), 2);
	}

	#[test]
	fn an_https_upstream_is_reached_over_tls_on_443_unless_it_names_a_port() {
		let unifi = Route {
			name: "unifi".into(),
			upstream: "https://device.test".into(),
			private: false,
			public: true,
			home: None,
		};
		let rendered = text(&render(&config(), &[], &[unifi]));
		assert!(rendered.contains(r#""dial":"device.test:443""#));
		assert!(rendered.contains(r#""tls":{"insecure_skip_verify":true}"#));
		assert_eq!(
			text(&proxy("https://device.test:8443/", "unifi.outside.test")["upstreams"]),
			r#"[{"dial":"device.test:8443"}]"#
		);
		// A plain upstream carries no transport and no rewriting at all.
		let plain = proxy("10.0.0.21:80", "nas.outside.test");
		assert!(plain.get("transport").is_none() && plain.get("headers").is_none());
	}

	#[test]
	fn only_the_names_own_origin_is_translated_for_a_device() {
		let rendered = proxy("https://device.test", "unifi.outside.test");
		let rule = &rendered["headers"]["request"]["replace"]["Origin"][0];
		let own = regex::Regex::new(rule["search_regexp"].as_str().unwrap()).unwrap();
		assert!(own.is_match("https://unifi.outside.test"));
		// Anchored at both ends and with its dots escaped, so neither a longer name nor a lookalike
		// with any character in place of a dot is taken for this one.
		assert!(!own.is_match("https://unifi.outside.test.evil.test"));
		assert!(!own.is_match("https://unifiXoutside.test"));
		assert!(!own.is_match("http://unifi.outside.test"));
		assert_eq!(rule["replace"], "https://device.test");
	}

	#[test]
	fn keeper_answers_only_its_notice_on_the_tunnel_side() {
		let keeper = Deployed {
			manifest: Manifest::parse(include_str!("../../keeper/service.toml")).unwrap(),
			image: "sha256:k".into(),
			previous: None,
			deployed_at: String::new(),
			held: false,
		};
		let rendered = render(&config(), &[keeper], &[]);
		let outside = text(&rendered["apps"]["http"]["servers"]["tunnel"]);
		assert!(outside.contains(r#""host":["keeper.outside.test"],"path":["/notice"]"#));
		// Nowhere on the tunnel's side is keeper matched by its name alone.
		assert!(!outside.contains(r#"{"host":["keeper.outside.test"]}"#));
		// Its interface is the private side's, whole.
		let inside = text(&rendered["apps"]["http"]["servers"]["private"]);
		assert!(inside.contains(r#"{"host":["keeper.inside.test"]}"#));
	}

	#[test]
	fn the_render_is_the_same_for_the_same_state() {
		// Stable output is what makes a diff of two renders mean something changed.
		assert_eq!(text(&render(&config(), &[geo()], &[])), text(&render(&config(), &[geo()], &[])));
	}
}
