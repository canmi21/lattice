//! An app's environment: `config.env`, which the panel shows, and `secret.env`, which it names and
//! never shows. Both sit in the app's subvolume, outside what its container mounts. See
//! spec/architecture/host.md, "An app's environment is two files, and the panel shows one".

use serde::Serialize;
use std::collections::{BTreeMap, BTreeSet};
use std::io::Write;
use std::os::unix::fs::OpenOptionsExt;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Kind {
	Config,
	Secret,
}

impl Kind {
	pub fn from_segment(segment: &str) -> Option<Self> {
		match segment {
			"config" => Some(Self::Config),
			"secret" => Some(Self::Secret),
			_ => None,
		}
	}

	fn file(self, root: &Path) -> PathBuf {
		root.join(match self {
			Self::Config => "config.env",
			Self::Secret => "secret.env",
		})
	}

	fn other(self) -> Self {
		match self {
			Self::Config => Self::Secret,
			Self::Secret => Self::Config,
		}
	}
}

/// What the panel is shown: every configuration value, and only the names of the secrets.
#[derive(Debug, Serialize, PartialEq)]
pub struct Shown {
	pub config: BTreeMap<String, String>,
	pub secrets: BTreeSet<String>,
}

#[derive(Debug, thiserror::Error)]
pub enum Error {
	#[error(
		"`{0}` is not a variable name: capitals, digits and underscores, not starting with a digit"
	)]
	Name(String),
	#[error("a value is one line")]
	Value,
	#[error("{path}: {source}")]
	File { path: String, source: std::io::Error },
}

fn failed(path: &Path) -> impl FnOnce(std::io::Error) -> Error + '_ {
	|source| Error::File { path: path.display().to_string(), source }
}

pub fn valid_name(name: &str) -> bool {
	!name.is_empty()
		&& !name.starts_with(|c: char| c.is_ascii_digit())
		&& name.bytes().all(|b| b.is_ascii_uppercase() || b.is_ascii_digit() || b == b'_')
}

/// One file's variables. A file that is not there holds none.
fn read(path: &Path) -> Result<BTreeMap<String, String>, Error> {
	let text = match std::fs::read_to_string(path) {
		Ok(text) => text,
		Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(BTreeMap::new()),
		Err(error) => return Err(failed(path)(error)),
	};
	Ok(
		text
			.lines()
			.filter_map(|line| line.split_once('='))
			.filter(|(name, _)| valid_name(name))
			.map(|(name, value)| (name.to_owned(), value.to_owned()))
			.collect(),
	)
}

/// Written whole through a temporary file, readable by root alone.
fn write(path: &Path, variables: &BTreeMap<String, String>) -> Result<(), Error> {
	let temporary = path.with_extension("env.next");
	let mut file = std::fs::OpenOptions::new()
		.write(true)
		.create(true)
		.truncate(true)
		.mode(0o600)
		.open(&temporary)
		.map_err(failed(&temporary))?;
	for (name, value) in variables {
		writeln!(file, "{name}={value}").map_err(failed(&temporary))?;
	}
	file.sync_all().map_err(failed(&temporary))?;
	std::fs::rename(&temporary, path).map_err(failed(path))
}

pub fn shown(root: &Path) -> Result<Shown, Error> {
	Ok(Shown {
		config: read(&Kind::Config.file(root))?,
		secrets: read(&Kind::Secret.file(root))?.into_keys().collect(),
	})
}

/// What the container is started with: both files, as `NAME=value`.
pub fn variables(root: &Path) -> Result<Vec<String>, Error> {
	let mut all = read(&Kind::Config.file(root))?;
	all.extend(read(&Kind::Secret.file(root))?);
	Ok(all.into_iter().map(|(name, value)| format!("{name}={value}")).collect())
}

/// Set one variable, or remove it with `None`. A name is in one file only, so setting it in one
/// takes it out of the other. True when anything changed.
pub fn set(root: &Path, kind: Kind, name: &str, value: Option<&str>) -> Result<bool, Error> {
	if !valid_name(name) {
		return Err(Error::Name(name.into()));
	}
	if value.is_some_and(|value| value.contains(['\n', '\r', '\0'])) {
		return Err(Error::Value);
	}
	std::fs::create_dir_all(root).map_err(failed(root))?;
	let mut changed = false;
	if value.is_some() {
		let other = kind.other().file(root);
		let mut theirs = read(&other)?;
		if theirs.remove(name).is_some() {
			write(&other, &theirs)?;
			changed = true;
		}
	}
	let file = kind.file(root);
	let mut ours = read(&file)?;
	let before = ours.get(name).cloned();
	match value {
		Some(value) => {
			ours.insert(name.into(), value.into());
		}
		None => {
			ours.remove(name);
		}
	}
	if before.as_deref() != value {
		write(&file, &ours)?;
		changed = true;
	}
	Ok(changed)
}

#[cfg(test)]
mod tests {
	use super::*;
	use std::os::unix::fs::PermissionsExt;

	#[test]
	fn shows_configuration_and_only_names_secrets() {
		let root = tempfile::tempdir().unwrap();
		set(root.path(), Kind::Config, "LEVEL", Some("debug")).unwrap();
		set(root.path(), Kind::Secret, "TOKEN", Some("s3cret")).unwrap();
		let shown = shown(root.path()).unwrap();
		assert_eq!(shown.config.get("LEVEL").map(String::as_str), Some("debug"));
		assert_eq!(shown.secrets.iter().collect::<Vec<_>>(), ["TOKEN"]);
		assert!(!serde_json::to_string(&shown).unwrap().contains("s3cret"));
		assert_eq!(variables(root.path()).unwrap(), ["LEVEL=debug", "TOKEN=s3cret"]);
		let mode = std::fs::metadata(root.path().join("secret.env")).unwrap().permissions().mode();
		assert_eq!(mode & 0o777, 0o600);
	}

	#[test]
	fn a_name_moves_between_the_files_rather_than_living_in_both() {
		let root = tempfile::tempdir().unwrap();
		set(root.path(), Kind::Config, "KEY", Some("plain")).unwrap();
		set(root.path(), Kind::Secret, "KEY", Some("hidden")).unwrap();
		let shown = shown(root.path()).unwrap();
		assert!(shown.config.is_empty() && shown.secrets.contains("KEY"));
		assert!(set(root.path(), Kind::Secret, "KEY", None).unwrap());
		assert!(!set(root.path(), Kind::Secret, "KEY", None).unwrap());
		assert!(variables(root.path()).unwrap().is_empty());
	}

	#[test]
	fn refuses_what_would_not_survive_a_line_of_its_own() {
		let root = tempfile::tempdir().unwrap();
		assert!(matches!(set(root.path(), Kind::Config, "lower", Some("x")), Err(Error::Name(_))));
		assert!(matches!(set(root.path(), Kind::Config, "1ST", Some("x")), Err(Error::Name(_))));
		assert!(matches!(set(root.path(), Kind::Config, "OK", Some("a\nB=c")), Err(Error::Value)));
		// A value may hold `=` and spaces; only the first `=` separates.
		set(root.path(), Kind::Config, "URL", Some("a=b c")).unwrap();
		assert_eq!(shown(root.path()).unwrap().config["URL"], "a=b c");
	}
}
