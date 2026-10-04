//! Running one app's container on a node, as both of the platform's programs do it: the
//! declaration an app ships, Docker, each app's btrfs subvolume, and the replacement of one version
//! by the next. host and keeper differ in what they deploy and what they remember, not in how a
//! container is replaced. See spec/architecture/host.md.

pub mod btrfs;
pub mod engine;
pub mod github;
pub mod http;
pub mod manifest;
pub mod replace;
pub mod sidecar;
pub mod volume;

pub use engine::{Engine, Shape, Version};
pub use manifest::Manifest;
pub use volume::Volumes;

/// A path in `directory` for one upload, named by nothing the request said: no name a client sends
/// becomes a path, and two uploads arriving at once never share a file.
pub fn arrival(directory: &std::path::Path) -> std::path::PathBuf {
	static NEXT: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
	let sequence = NEXT.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
	directory.join(format!("upload-{}-{sequence}.tar", std::process::id()))
}

/// Empty `directory` of whatever a previous run left half-received, and make sure it exists.
pub fn clear_arrivals(directory: &std::path::Path) -> std::io::Result<()> {
	match std::fs::remove_dir_all(directory) {
		Err(error) if error.kind() != std::io::ErrorKind::NotFound => return Err(error),
		_ => {}
	}
	std::fs::create_dir_all(directory)
}

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

#[cfg(test)]
mod tests {
	#[test]
	fn an_arrival_is_new_each_time_and_never_named_by_the_request() {
		let directory = std::path::Path::new("/incoming");
		let first = super::arrival(directory);
		let second = super::arrival(directory);
		assert_ne!(first, second);
		assert_eq!(first.parent(), Some(directory));
	}
}
