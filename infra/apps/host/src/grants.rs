//! What the node lets an app be beyond a sandboxed container. An app asks for a role in its
//! declaration and the node's `GRANTS` names the app and the role too, so neither a declaration
//! nor this program grants one alone, and host knows roles rather than the apps that hold them.
//! See spec/architecture/host.md, "A role is asked for by the app and granted by the node".

use deploy::manifest::Manifest;
use deploy::sidecar::Driver;

/// A role the node can grant, by the word `GRANTS` and a declaration both spell it with.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Role {
	/// Calls every service's jobs: given the schedule table and each socket service's directory.
	Scheduler,
	/// Asks the machine's systemd for its own packages: root, and the D-Bus socket.
	Steward,
	/// Shows the platform to anyone: given host's account of the services and the meter's readings.
	Reporter,
	/// The image every sidecar of a kind runs.
	Driver(Driver),
	/// Claims hostnames, which Caddy routes to it and the resolver answers with the node.
	Hosts,
}

impl Role {
	pub fn parse(word: &str) -> Option<Self> {
		Some(match word {
			"scheduler" => Role::Scheduler,
			"steward" => Role::Steward,
			"reporter" => Role::Reporter,
			"hosts" => Role::Hosts,
			other => Role::Driver(Driver::named(other)?),
		})
	}
}

/// `GRANTS` read: `app:role` pairs separated by whitespace, as `cron:scheduler objects:objects`.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct Grants(Vec<(String, Role)>);

/// A role an app asked for and the node does not grant it.
#[derive(Debug, thiserror::Error, PartialEq)]
#[error("`{app}` asks to be {role}, and this node's GRANTS does not grant it")]
pub struct Refused {
	pub app: String,
	pub role: String,
}

impl Grants {
	/// Every pair in `value`, or the first one that is not `app:role` with a role there is.
	pub fn parse(value: &str) -> Result<Self, String> {
		value
			.split_whitespace()
			.map(|pair| {
				let (app, role) = pair.split_once(':').ok_or_else(|| pair.to_owned())?;
				let role = Role::parse(role).ok_or_else(|| pair.to_owned())?;
				if app.is_empty() { Err(pair.to_owned()) } else { Ok((app.to_owned(), role)) }
			})
			.collect::<Result<_, _>>()
			.map(Grants)
	}

	pub fn allows(&self, app: &str, role: Role) -> bool {
		self.0.iter().any(|(name, granted)| name == app && *granted == role)
	}

	/// The app the node grants `role` to; the first named, where several are.
	pub fn holder(&self, role: Role) -> Option<&str> {
		self.0.iter().find(|(_, granted)| *granted == role).map(|(name, _)| name.as_str())
	}

	/// The role `manifest` asks for and is granted, none when it asks for none, and a refusal when
	/// it asks for one the node does not grant: a deploy that quietly ran sandboxed instead would
	/// fail later and somewhere else.
	pub fn shape_of(&self, manifest: &Manifest) -> Result<Option<Role>, Refused> {
		let Some(asked) = manifest.shape.as_ref() else { return Ok(None) };
		let refused = || Refused { app: manifest.name.clone(), role: asked.kind.clone() };
		let role = Role::parse(&asked.kind).ok_or_else(refused)?;
		if self.allows(&manifest.name, role) { Ok(Some(role)) } else { Err(refused()) }
	}

	/// The driver `manifest` is, when it offers one and the node grants it.
	pub fn driver_of(&self, manifest: &Manifest) -> Option<Driver> {
		let driver = Driver::named(&manifest.driver.as_ref()?.provides)?;
		self.allows(&manifest.name, Role::Driver(driver)).then_some(driver)
	}

	/// Whether `manifest` claims hostnames the node lets it claim.
	pub fn claims_hosts(&self, manifest: &Manifest) -> bool {
		self.allows(&manifest.name, Role::Hosts)
	}
}

#[cfg(test)]
mod tests {
	use super::*;

	fn declared(name: &str, extra: &str) -> Manifest {
		let text = format!(
			"version = 1\nname = \"{name}\"\nplacements = [\"home\"]\n{extra}\n[container]\nport = \
			 20000\nhealth = \"/health\"\n"
		);
		Manifest::parse(&text).unwrap()
	}

	#[test]
	fn reads_the_pairs_the_node_names() {
		let grants = Grants::parse(" cron:scheduler\tobjects:objects  gateway:hosts\n").unwrap();
		assert!(grants.allows("cron", Role::Scheduler));
		assert!(grants.allows("objects", Role::Driver(Driver::Objects)));
		assert_eq!(grants.holder(Role::Hosts), Some("gateway"));
		assert_eq!(grants.holder(Role::Steward), None);
		assert_eq!(Grants::parse(""), Ok(Grants::default()));
		assert_eq!(Grants::parse("cron"), Err("cron".into()));
		assert_eq!(Grants::parse("cron:root"), Err("cron:root".into()));
		assert_eq!(Grants::parse(":scheduler"), Err(":scheduler".into()));
	}

	#[test]
	fn a_role_needs_both_the_asking_and_the_grant() {
		let grants = Grants::parse("cron:scheduler").unwrap();
		let asking = declared("cron", "[shape]\nkind = \"scheduler\"");
		assert_eq!(grants.shape_of(&asking), Ok(Some(Role::Scheduler)));
		// Granted but not asked for: a plain app.
		assert_eq!(grants.shape_of(&declared("cron", "")), Ok(None));
		// Asked for but not granted, under another name or for another role: refused.
		let other = declared("geo", "[shape]\nkind = \"scheduler\"");
		assert_eq!(grants.shape_of(&other).unwrap_err().app, "geo");
		let steward = declared("cron", "[shape]\nkind = \"steward\"");
		assert_eq!(grants.shape_of(&steward).unwrap_err().role, "steward");
	}

	#[test]
	fn a_driver_is_one_only_where_the_node_grants_it() {
		let grants = Grants::parse("objects:objects").unwrap();
		let offering = declared("objects", "[driver]\nprovides = \"objects\"");
		assert_eq!(grants.driver_of(&offering), Some(Driver::Objects));
		let elsewhere = declared("store", "[driver]\nprovides = \"objects\"");
		assert_eq!(grants.driver_of(&elsewhere), None);
		assert_eq!(grants.driver_of(&declared("objects", "")), None);
	}
}
