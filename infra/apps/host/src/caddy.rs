//! All of Caddy, rendered from host's state: written to the file Caddy starts from, then loaded
//! through its admin socket. Never a patch, never Caddy's own autosave. See
//! spec/architecture/host.md, "host renders all of Caddy, and Caddy remembers nothing".
//!
//! The shape follows what Caddy's own adapter made of the Caddyfile this replaces: one wildcard
//! route per suffix, a guard on the source address first, and a subroute of names inside it.

use crate::config::CaddyConfig;
use crate::grants::Grants;
use crate::store::{Deployed, Route};
use deploy::manifest::Edge;
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

/// `path` as a regular expression matching itself and nothing else.
fn escaped(path: &str) -> String {
	path.chars().fold(String::new(), |mut out, character| {
		if "\\.+*?()|[]{}^$".contains(character) {
			out.push('\\');
		}
		out.push(character);
		out
	})
}

/// A scope's limits, counted by the visitor's address on what the gateway forwards, and on nothing
/// else: our own callers meet none. One zone a row, named as the gateway's counters are without
/// the address. See spec/architecture/services.md, "A limit is declared once and kept in three
/// places".
fn limited(scope: &str, limits: &[Limit]) -> Option<Value> {
	if limits.is_empty() {
		return None;
	}
	// Caddy sees an address and no account, so it keeps a floor under the address's rows alone.
	let zones: serde_json::Map<String, Value> = limits
		.iter()
		.filter(|limit| limit.subject() == "address")
		.map(|limit| {
			let methods: Vec<String> = limit.methods.iter().map(|method| method.to_lowercase()).collect();
			let named = limit.path.replace("/*", "/any");
			let path = named.split('/').filter(|part| !part.is_empty()).collect::<Vec<_>>();
			let path = if path.is_empty() { "root".to_owned() } else { path.join("-") };
			// A limit names the path after the version, so it counts every version's call to it, and
			// the unversioned one until its callers move; a prefix ending in `/*` counts everything
			// under it. See spec/architecture/gateway.md, "The declaration".
			let pattern = match limit.path.strip_suffix('*') {
				Some(stem) => format!("^(/v[1-9][0-9]*)?{}", escaped(stem)),
				None => format!("^(/v[1-9][0-9]*)?{}$", escaped(&limit.path)),
			};
			let zone = json!({
				"match": [{
					"method": limit.methods,
					"path_regexp": { "pattern": pattern },
					"header": { MARK.0: [MARK.1] }
				}],
				// The address Caddy took from Cloudflare's header; `http.request.client_ip` is no
				// placeholder, and a key that does not resolve counts everyone as one.
				"key": "{http.vars.client_ip}",
				// A sliding window cannot be a bucket; it allows the most the bucket ever admits in
				// one, so the floor never refuses what `quota` lets through. See
				// spec/architecture/quota.md, "Who asks".
				"window": format!("{}s", limit.seconds),
				"max_events": limit.most_in_window()
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

/// One of Caddy's sides: the LAN's, the tunnel's, and the internal gateway's. See
/// spec/architecture/host.md, "The inside side answers the internal gateway alone".
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Side {
	Private,
	Tunnel,
	Inside,
}

impl Side {
	/// As a declaration's `sides` names it.
	fn name(self) -> &'static str {
		match self {
			Side::Private => "private",
			Side::Tunnel => "tunnel",
			Side::Inside => "inside",
		}
	}
}

/// The name the inside side answers, and its port, published nowhere.
const INSIDE_HOST: &str = "api.inside";
const INSIDE_LISTEN: &str = ":8080";

/// The header the internal gateway carries its token in; the same name as `INTERNAL_HEADER` in the
/// gateway.
const INTERNAL_HEADER: &str = "X-Internal";

/// Each API scope a side carries, its prefix stripped before the service sees the request; what the
/// public may reach of it is the gateway's table, not this render. Limits are only ever counted on
/// the tunnel's side, over what the gateway forwards. See spec/architecture/services.md, "A path
/// with no scope is a 400, on both gateways".
fn scopes(apps: &[Deployed], side: Side) -> Vec<Value> {
	let mut routes = vec![json!({
		"match": [{ "path": ["/"] }],
		"handle": [{ "handler": "static_response", "status_code": 400 }]
	})];
	routes.extend(apps.iter().filter_map(|app| {
		let name = &app.manifest.name;
		let api = app.manifest.api.as_ref().filter(|api| api.carried_on(side.name()))?;
		let port = app.manifest.container.as_ref()?.port?;
		let mut handle = vec![json!({ "handler": "rewrite", "strip_path_prefix": format!("/{name}") })];
		handle.extend((side == Side::Tunnel).then(|| limited(name, &api.limits)).flatten());
		// The token stops at Caddy: no service behind it ever sees it.
		if side == Side::Inside {
			handle.push(json!({ "handler": "headers", "request": { "delete": [INTERNAL_HEADER] } }));
		}
		handle.extend([encode(), proxy(&format!("{name}:{port}"), name)]);
		Some(json!({
			"match": [{ "path": [format!("/{name}"), format!("/{name}/*")] }],
			"handle": handle
		}))
	}));
	routes.push(json!({ "handle": [{ "handler": "static_response", "status_code": 404 }] }));
	routes
}

fn api_host(host: String, apps: &[Deployed], side: Side) -> Value {
	json!({
		"match": [{ "host": [host] }],
		"handle": [{ "handler": "subroute", "routes": scopes(apps, side) }]
	})
}

/// The inside side: every scope a declaration lets it carry, to a caller holding `INTERNAL_TOKEN`
/// from Caddy's own environment, and nothing to anyone else. A token that is not set lets nobody
/// in, rather than matching a header that is absent too.
fn inside_side(apps: &[Deployed]) -> Vec<Value> {
	let holds = format!(
		"{{env.INTERNAL_TOKEN}} != '' && {{http.request.header.{INTERNAL_HEADER}}} == {{env.INTERNAL_TOKEN}}"
	);
	vec![
		json!({
			"match": [{ "host": [INSIDE_HOST], "expression": holds }],
			"handle": [{ "handler": "subroute", "routes": scopes(apps, Side::Inside) }],
			"terminal": true
		}),
		abort(),
	]
}

/// The app the node lets claim hostnames, and what it claims: the first deployed that declares an
/// `[edge]` and is granted `hosts`. See spec/architecture/host.md, "A role is asked for by the app
/// and granted by the node".
pub fn claimant<'a>(grants: &Grants, apps: &'a [Deployed]) -> Option<(&'a Deployed, &'a Edge)> {
	apps.iter().find_map(|app| {
		let edge = app.manifest.edge.as_ref()?;
		grants.claims_hosts(&app.manifest).then_some((app, edge))
	})
}

/// The claimed hostnames on the LAN's side, handed to the app that claims them with the address
/// they were asked from in `Cf-Connecting-Ip`, over whatever the caller sent. None while no app
/// claims any. See spec/architecture/host.md, "The inside side answers the internal gateway alone".
fn claimed_hosts(config: &CaddyConfig, claimant: Option<(&Deployed, &Edge)>) -> Option<Value> {
	let (app, edge) = claimant?;
	let name = app.manifest.name.as_str();
	let port = app.manifest.container.as_ref()?.port?;
	let mut proxy = proxy(&format!("{name}:{port}"), name);
	proxy["headers"] =
		json!({ "request": { "set": { "Cf-Connecting-Ip": ["{http.vars.client_ip}"] } } });
	Some(json!({
		"match": [{ "host": edge.hosts }],
		"handle": [{ "handler": "subroute", "routes": [
			refuse_unless(&config.private_sources),
			{ "handle": [encode(), proxy] }
		]}],
		"terminal": true
	}))
}

/// Everything reached by a subdomain of its own on one side, by its label: each app with an
/// interface, the panel among them, and each route. host has none: only the panel reaches it.
/// Every label is on `.app`; the private suffix carries it only when the interface's `lan`, or the
/// route's `private`, says so. See spec/architecture/host.md, "The private suffix is a mirror of
/// part of `.app`, and nothing else".
fn interfaces(apps: &[Deployed], routes: &[Route], public: bool) -> Vec<Target> {
	let mut targets = Vec::new();
	targets.extend(
		apps
			.iter()
			.filter(|app| {
				app.manifest.interface.as_ref().is_some_and(|interface| public || interface.lan)
			})
			.filter_map(|app| {
				let interface = app.manifest.interface.as_ref()?;
				Some(Target {
					name: interface.label(&app.manifest.name).to_owned(),
					dial: format!("{}:{}", app.manifest.name, app.manifest.container.as_ref()?.port?),
					home: interface.home.clone(),
				})
			}),
	);
	targets.extend(routes.iter().filter(|route| public || route.private).map(|route| Target {
		name: route.name.clone(),
		dial: route.upstream.clone(),
		home: route.home.clone(),
	}));
	targets
}

pub fn render(config: &CaddyConfig, grants: &Grants, apps: &[Deployed], routes: &[Route]) -> Value {
	let private = &config.private_suffix;
	let public = &config.public_suffix;

	let mut inside = vec![refuse_unless(&config.private_sources)];
	inside.push(api_host(format!("api.{private}"), apps, Side::Private));
	for target in interfaces(apps, routes, false) {
		inside.push(named(format!("{}.{private}", target.name), &target));
	}
	inside.push(abort());

	let mut outside = vec![refuse_unless(std::slice::from_ref(&config.tunnel_source))];
	outside.push(api_host(format!("api.{public}"), apps, Side::Tunnel));
	for target in interfaces(apps, routes, true) {
		outside.push(named(format!("{}.{public}", target.name), &target));
	}
	outside.push(json!({ "handle": [{ "handler": "static_response", "status_code": 404 }] }));

	let claimant = claimant(grants, apps);
	let mut lan = Vec::from_iter(claimed_hosts(config, claimant));
	lan.push(json!({
		"match": [{ "host": [format!("*.{private}")] }],
		"handle": [{ "handler": "subroute", "routes": inside }],
		"terminal": true
	}));
	let mut subjects = vec![format!("*.{private}")];
	if lan.len() > 1
		&& let Some((_, edge)) = claimant
	{
		subjects.extend(edge.hosts.iter().cloned());
	}

	// The visitor's address comes from Cloudflare's header, and only when cloudflared sent it.
	let trusted = json!({ "source": "static", "ranges": [config.tunnel_source] });
	json!({
		"admin": { "listen": config.admin_listen, "config": { "persist": false } },
		"apps": {
			"http": { "servers": {
				"private": {
					"listen": [":443"],
					"routes": lan,
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
				},
				// Plain HTTP on a port no one outside Caddy's networks reaches, so no certificate.
				"inside": {
					"listen": [INSIDE_LISTEN],
					"routes": inside_side(apps),
					"automatic_https": { "disable": true }
				}
			}},
			"tls": { "automation": { "policies": [{
				"subjects": subjects,
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

/// Through a temporary file and a rename, so neither Caddy nor the resolver ever starts from half
/// of one.
pub async fn write(path: &Path, bytes: &[u8]) -> Result<(), Error> {
	let failed = |source| Error::Write { path: path.display().to_string(), source };
	if let Some(parent) = path.parent() {
		tokio::fs::create_dir_all(parent).await.map_err(failed)?;
	}
	let name = path.file_name().map(|name| name.to_string_lossy().into_owned()).unwrap_or_default();
	let temporary = path.with_file_name(format!("{name}.next"));
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
			manifest: Manifest::parse(include_str!("../../../../platform/apps/geo/service.toml"))
				.unwrap(),
			image: "sha256:a".into(),
			previous: None,
			deployed_at: String::new(),
			held: false,
		}
	}

	fn text(value: &Value) -> String {
		serde_json::to_string(value).unwrap()
	}

	fn deployed(declaration: &str) -> Deployed {
		Deployed { manifest: Manifest::parse(declaration).unwrap(), ..geo() }
	}

	fn quota() -> Deployed {
		deployed(include_str!("../../../../apps/quota/service.toml"))
	}

	/// The node's grants as a test node has them: the gateway may claim its hostnames.
	fn grants() -> Grants {
		Grants::parse("gateway:hosts").unwrap()
	}

	fn gateway() -> Deployed {
		deployed(include_str!("../../../../apps/gateway/service.toml"))
	}

	#[test]
	fn the_inside_side_carries_every_scope_to_a_holder_of_the_token_alone() {
		let rendered = render(&config(), &grants(), &[geo(), quota()], &[]);
		let inside = &rendered["apps"]["http"]["servers"]["inside"];
		assert_eq!(inside["listen"][0], ":8080");
		assert_eq!(inside["automatic_https"]["disable"], true);
		let route = &inside["routes"][0];
		assert_eq!(route["match"][0]["host"][0], "api.inside");
		let holds = route["match"][0]["expression"].as_str().unwrap();
		assert!(holds.contains("{env.INTERNAL_TOKEN} != ''"));
		assert!(holds.contains("{http.request.header.X-Internal} == {env.INTERNAL_TOKEN}"));
		let carried = text(&route["handle"][0]["routes"]);
		assert!(carried.contains(r#""/geo/*""#) && carried.contains(r#""/quota/*""#));
		// The token stops at Caddy, and what reaches this side was counted already.
		assert!(carried.contains(r#""delete":["X-Internal"]"#));
		assert!(!carried.contains(r#""handler":"rate_limit""#));
		assert_eq!(inside["routes"][1]["handle"][0]["abort"], true);
	}

	#[test]
	fn a_scope_on_the_inside_side_alone_is_on_neither_api_host() {
		let rendered = text(&render(&config(), &grants(), &[quota()], &[]));
		let servers =
			serde_json::from_str::<Value>(&rendered).unwrap()["apps"]["http"]["servers"].clone();
		assert!(!text(&servers["private"]).contains("/quota"));
		assert!(!text(&servers["tunnel"]).contains("/quota"));
		assert!(text(&servers["inside"]).contains("/quota"));
	}

	#[test]
	fn the_lan_hands_the_gateways_hostnames_to_the_internal_gateway_once_it_runs() {
		let without = render(&config(), &grants(), &[geo()], &[]);
		assert!(!text(&without).contains("monoflake"));
		let with = render(&config(), &grants(), &[geo(), gateway()], &[]);
		let route = &with["apps"]["http"]["servers"]["private"]["routes"][0];
		let hosts = &gateway().manifest.edge.unwrap().hosts;
		assert_eq!(text(&route["match"][0]["host"]), text(&json!(hosts)));
		let handle = &route["handle"][0]["routes"];
		assert_eq!(handle[0]["handle"][0]["abort"], true);
		let proxy = &handle[1]["handle"][1];
		assert_eq!(proxy["upstreams"][0]["dial"], "gateway:26512");
		assert_eq!(proxy["headers"]["request"]["set"]["Cf-Connecting-Ip"][0], "{http.vars.client_ip}");
		let subjects = text(&with["apps"]["tls"]["automation"]["policies"][0]["subjects"]);
		assert!(subjects.contains("*.monoflake.com") && subjects.contains("symlink.si"));
	}

	#[test]
	fn an_api_scope_answers_on_both_api_hosts_regardless_of_its_public_flag() {
		let mut private = geo();
		private.manifest.api.as_mut().unwrap().public = false;
		let rendered = text(&render(&config(), &grants(), &[private], &[]));
		assert!(rendered.contains(r#""host":["api.inside.test"]"#));
		assert!(rendered.contains(r#""host":["api.outside.test"]"#));
		assert!(rendered.contains(r#""path":["/geo","/geo/*"]"#));
		assert!(rendered.contains(r#""strip_path_prefix":"/geo""#));
		// geo declares no interface, so a private scope still reaches nothing of its own on either
		// suffix -- the API host alone carries it, on both sides. `api.public` is the gateway's
		// scope table's alone; see spec/architecture/services.md, "One API host, scoped by path".
		assert!(!rendered.contains("geo.outside.test"));
		assert!(!rendered.contains("geo.inside.test"));
		// The LAN's side, the tunnel's, and the inside side the internal gateway asks.
		assert_eq!(rendered.matches(r#""dial":"geo:23440""#).count(), 3);
	}

	#[test]
	fn a_public_scope_is_on_the_tunnels_api_host_too() {
		let rendered = render(&config(), &grants(), &[geo()], &[]);
		let tunnel = &rendered["apps"]["http"]["servers"]["tunnel"]["routes"][0]["handle"][0]["routes"];
		assert_eq!(tunnel[1]["match"][0]["host"][0], "api.outside.test");
		assert_eq!(text(&rendered).matches(r#""dial":"geo:23440""#).count(), 3);
	}

	#[test]
	fn a_limit_counts_what_the_gateway_forwards_on_the_tunnels_side_alone() {
		let rendered = render(&config(), &grants(), &[geo()], &[]);
		let servers = &rendered["apps"]["http"]["servers"];
		let tunnel = &servers["tunnel"]["routes"][0]["handle"][0]["routes"][1]["handle"][0]["routes"];
		let handle = &tunnel[1]["handle"];
		assert_eq!(handle[0]["handler"], "rewrite");
		assert_eq!(handle[1]["handler"], "rate_limit");
		let zone = &handle[1]["rate_limits"]["geo_get-head_address"];
		assert_eq!(text(&zone["match"][0]["method"]), r#"["GET","HEAD"]"#);
		let pattern = regex::Regex::new(zone["match"][0]["path_regexp"]["pattern"].as_str().unwrap());
		let pattern = pattern.unwrap();
		assert!(pattern.is_match("/address") && pattern.is_match("/v1/address"));
		assert!(!pattern.is_match("/address/x") && !pattern.is_match("/v1x/address"));
		assert_eq!(zone["match"][0]["header"]["X-Gateway"][0], "public");
		assert_eq!(zone["key"], "{http.vars.client_ip}");
		// geo's row is 60 a minute with no burst named: a full bucket of 60, and 60 more meanwhile.
		assert_eq!((zone["window"].as_str(), zone["max_events"].as_u64()), (Some("60s"), Some(120)));
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
		assert!(
			!text(&render(&config(), &grants(), &[free], &[])).contains(r#""handler":"rate_limit""#)
		);
	}

	#[test]
	fn a_path_with_no_scope_is_malformed() {
		let first = &scopes(&[geo()], Side::Private)[0];
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
		check(&render(&config(), &grants(), &[geo()], &[nas]), &mut proxies);
		assert!(proxies >= 3);
	}

	#[test]
	fn the_source_guard_comes_first_on_both_sides() {
		let rendered = render(&config(), &grants(), &[], &[]);
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
		let rendered = text(&render(&config(), &grants(), &[], &[nas]));
		assert!(rendered.contains("nas.outside.test"));
		assert!(!rendered.contains("nas.inside.test"));
		// host is on neither: the panel is its only way in.
		assert!(!rendered.contains("host.inside.test") && !rendered.contains("host.outside.test"));
	}

	#[test]
	fn an_apps_declared_home_redirects_its_root() {
		let text = include_str!("../../../../platform/apps/gemini/service.toml");
		let gemini = Deployed {
			manifest: Manifest::parse(text).unwrap(),
			image: "sha256:g".into(),
			previous: None,
			deployed_at: String::new(),
			held: false,
		};
		let rendered = super::tests::text(&render(&config(), &grants(), &[gemini], &[]));
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
		let rendered = text(&render(&config(), &grants(), &[], &[gemini]));
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
		let rendered = text(&render(&config(), &grants(), &[], &[unifi]));
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
	fn keepers_whole_interface_is_on_both_suffixes() {
		let keeper = Deployed {
			manifest: Manifest::parse(include_str!("../../keeper/service.toml")).unwrap(),
			image: "sha256:k".into(),
			previous: None,
			deployed_at: String::new(),
			held: false,
		};
		// keeper's whole interface is on `.app` now, behind Access like any other -- not the one
		// `/notice` path the Worker used to reach it by. See spec/architecture/host.md, "The private
		// suffix is a mirror of part of `.app`, and nothing else".
		let rendered = text(&render(&config(), &grants(), &[keeper], &[]));
		assert!(rendered.contains(r#"{"host":["keeper.outside.test"]}"#));
		assert!(rendered.contains(r#"{"host":["keeper.inside.test"]}"#));
		assert_eq!(rendered.matches(r#""dial":"keeper:11010""#).count(), 2);
	}

	#[test]
	fn the_render_is_the_same_for_the_same_state() {
		// Stable output is what makes a diff of two renders mean something changed.
		assert_eq!(
			text(&render(&config(), &grants(), &[geo()], &[])),
			text(&render(&config(), &grants(), &[geo()], &[]))
		);
	}
}
