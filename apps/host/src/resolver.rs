//! The house's DNS, rendered from host's configuration and the gateway's names: CoreDNS answers
//! those with the node's own address and passes everything else down a chain that skips what
//! fails. Written whole, as Caddy's configuration is, and read again by CoreDNS on its own. See
//! spec/architecture/host.md, "The resolver answers the gateway's names, and passes the rest on".

use crate::caddy;
use crate::config::ResolverConfig;

/// Where CoreDNS answers inside its container; the node publishes it as 53.
const LISTEN: u16 = 1053;

/// Where its health is asked, as `[container]` in its declaration says.
const HEALTH: u16 = 15353;

/// How long an answer about one of the gateway's names is kept by whoever asked.
const OWN_TTL: u32 = 60;

/// `text` as a regular expression matching itself and nothing else, a dot as a dot.
fn literal(text: &str) -> String {
	text.replace('.', "[.]")
}

/// Each name the gateway answers at home as CoreDNS's template plugin takes it: the zone it is
/// under, and what in that zone it matches -- one exact name, or a deployment's, read from the
/// right as the profiles read it. Nothing else in those zones is matched, so a record of another
/// name there answers as it does in public.
fn names() -> Vec<(String, String)> {
	let mut names: Vec<(String, String)> = urls::GATEWAY_EXACT
		.iter()
		.map(|name| ((*name).to_owned(), format!("^{}[.]$", literal(name))))
		.collect();
	let zone = urls::GATEWAY_DEPLOYMENTS;
	let deployment = format!(
		"^[a-z][a-z0-9-]*-({})-({})[.]{}[.]$",
		urls::GATEWAY_REGIONS.join("|"),
		urls::GATEWAY_PROVIDERS.join("|"),
		literal(zone)
	);
	names.push((zone.to_owned(), deployment));
	names
}

/// The Corefile, or nothing on a node that runs no resolver. Each of the gateway's names answers
/// the node's address over IPv4 and nothing else, so no device is handed Cloudflare's address for
/// it by a record of another type; every other name goes to `filters` and then the configured
/// upstreams, in order, one that fails passed over.
pub fn render(config: &ResolverConfig, filters: &[String]) -> Option<String> {
	let address = config.address.as_deref()?;
	let mut out =
		String::from("# Rendered by host, never edited by hand; see spec/architecture/host.md.\n");
	out
		.push_str(&format!(".:{LISTEN} {{\n\terrors\n\thealth :{HEALTH}\n\treload 10s\n\tcache 300\n"));
	for (zone, pattern) in names() {
		out.push_str(&format!(
			"\ttemplate IN A {zone} {{\n\t\tmatch {pattern}\n\t\tanswer \"{{{{ .Name }}}} {OWN_TTL} IN A {address}\"\n\t\tfallthrough\n\t}}\n"
		));
		out.push_str(&format!(
			"\ttemplate ANY ANY {zone} {{\n\t\tmatch {pattern}\n\t\trcode NOERROR\n\t\tfallthrough\n\t}}\n"
		));
	}
	let upstreams: Vec<&str> =
		filters.iter().chain(config.upstreams.iter()).map(String::as_str).collect();
	out.push_str(&format!(
		"\tforward . {} {{\n\t\tpolicy sequential\n\t\thealth_check 5s\n\t}}\n}}\n",
		upstreams.join(" ")
	));
	Some(out)
}

/// Render and write it, when the node runs a resolver; CoreDNS notices the file change itself.
pub async fn apply(config: &ResolverConfig, filters: &[String]) -> Result<(), caddy::Error> {
	match render(config, filters) {
		Some(text) => caddy::write(&config.file, text.as_bytes()).await,
		None => Ok(()),
	}
}

#[cfg(test)]
mod tests {
	use super::*;

	fn config() -> ResolverConfig {
		ResolverConfig {
			file: "/nowhere/Corefile".into(),
			address: Some("10.0.0.11".into()),
			upstreams: vec!["10.0.0.1".into(), "1.1.1.1".into()],
		}
	}

	#[test]
	fn answers_every_gateway_name_with_the_node_and_nothing_else_for_it() {
		let text = render(&config(), &[]).unwrap();
		assert!(text.contains(".:1053 {"));
		assert!(
			text.contains("template IN A api.monoflake.com {\n\t\tmatch ^api[.]monoflake[.]com[.]$")
		);
		assert!(text.contains("template IN A ill.li {\n\t\tmatch ^ill[.]li[.]$"));
		assert!(text.contains("answer \"{{ .Name }} 60 IN A 10.0.0.11\""));
		let deployment = "match ^[a-z][a-z0-9-]*-(rdu|glo)-(int|cf|vcl)[.]ixc[.]one[.]$";
		assert!(
			text.contains(&format!("template ANY ANY ixc.one {{\n\t\t{deployment}\n\t\trcode NOERROR"))
		);
		assert_eq!(text.matches("template IN A ").count(), urls::GATEWAY_EXACT.len() + 1);
	}

	#[test]
	fn leaves_every_other_name_in_the_gateways_zones_to_the_upstreams() {
		let deployment = regex::Regex::new(&names().last().unwrap().1).unwrap();
		for own in ["geo-rdu-int.ixc.one.", "api-glo-cf.ixc.one.", "two-words-rdu-int.ixc.one."] {
			assert!(deployment.is_match(own), "{own}");
		}
		for other in ["lo.ixc.one.", "api.internal.ixc.one.", "geo-xyz-int.ixc.one.", "www.ixc.one."] {
			assert!(!deployment.is_match(other), "{other}");
		}
		let text = render(&config(), &[]).unwrap();
		// No zone is taken whole: every pattern names an exact host or a deployment's shape.
		assert!(!text.contains("www") && !text.contains("^.+"));
	}

	#[test]
	fn passes_the_rest_down_the_chain_a_filter_first() {
		let text = render(&config(), &["10.0.0.53".into()]).unwrap();
		assert!(text.contains("forward . 10.0.0.53 10.0.0.1 1.1.1.1 {\n\t\tpolicy sequential"));
	}

	#[test]
	fn renders_nothing_on_a_node_with_no_address_for_it() {
		let none = ResolverConfig { address: None, ..config() };
		assert_eq!(render(&none, &[]), None);
	}
}
