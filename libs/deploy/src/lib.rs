//! Running one app's container on a node, as both of the platform's programs do it: the
//! declaration an app ships, Docker, each app's btrfs subvolume, and the replacement of one version
//! by the next. host and keeper differ in what they deploy and what they remember, not in how a
//! container is replaced. See spec/architecture/host.md.

pub mod engine;
pub mod http;
pub mod manifest;
pub mod replace;
pub mod volume;

pub use engine::{Engine, Shape, Version};
pub use manifest::Manifest;
pub use volume::Volumes;

/// The environment the node's `.env` holds, as `KEY=value` lines. Both of the platform's programs
/// start from it, so the token has one home on the machine.
pub fn read_env(path: &std::path::Path) -> std::io::Result<Vec<String>> {
	let text = std::fs::read_to_string(path)?;
	Ok(
		text
			.lines()
			.map(str::trim)
			.filter(|line| !line.is_empty() && !line.starts_with('#') && line.contains('='))
			.map(str::to_owned)
			.collect(),
	)
}
