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

/// One variable as `/api/apps/{name}/environment` and `/api/inspect` alike name it: its name and
/// which file it is in, with a value only for `config` -- never for `secret`. See
/// spec/architecture/inspect.md, "An app's environment is asked where it is kept".
#[derive(Debug, Serialize, PartialEq)]
pub struct VariableShown {
	pub name: String,
	#[serde(rename = "type")]
	pub kind: &'static str,
	#[serde(skip_serializing_if = "Option::is_none")]
	pub value: Option<String>,
}

/// What the panel is shown: every configuration value, and only the names of the secrets -- kept
/// beside `variables`, which answers the same thing by name and type, so a caller that wants
/// either shape is served without a second read of the files.
#[derive(Debug, Serialize, PartialEq)]
pub struct Shown {
	pub config: BTreeMap<String, String>,
	pub secrets: BTreeSet<String>,
	pub variables: Vec<VariableShown>,
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
	#[error("`{0}` in `secret.env` is not the URL host made, so its password cannot be read from it")]
	Binding(String),
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
	let config = read(&Kind::Config.file(root))?;
	let secrets = read(&Kind::Secret.file(root))?;
	let mut variables: Vec<VariableShown> = config
		.iter()
		.map(|(name, value)| VariableShown {
			name: name.clone(),
			kind: "config",
			value: Some(value.clone()),
		})
		.chain(secrets.keys().map(|name| VariableShown {
			name: name.clone(),
			kind: "secret",
			value: None,
		}))
		.collect();
	variables.sort_by(|a, b| a.name.cmp(&b.name));
	Ok(Shown { config, secrets: secrets.into_keys().collect(), variables })
}

/// What the container is started with: both files, as `NAME=value`.
pub fn variables(root: &Path) -> Result<Vec<String>, Error> {
	let mut all = read(&Kind::Config.file(root))?;
	all.extend(read(&Kind::Secret.file(root))?);
	Ok(all.into_iter().map(|(name, value)| format!("{name}={value}")).collect())
}

/// The names an app's object storage credentials are kept under in its `secret.env`, and handed to
/// it as. See spec/architecture/objects.md, "A sidecar per app, over the app's own directory".
pub const ACCESS_KEY_ID: &str = "S3_ACCESS_KEY_ID";
pub const SECRET_ACCESS_KEY: &str = "S3_SECRET_ACCESS_KEY";

/// An access key id and its secret, the app's and its sidecar's root account alike.
#[derive(Debug, Clone, PartialEq)]
pub struct Credentials {
	pub access_key_id: String,
	pub secret_access_key: String,
}

/// The app's object storage credentials, made once and kept in its `secret.env`: what is there is
/// answered as it is, and only a missing half is made.
pub fn credentials(root: &Path) -> Result<Credentials, Error> {
	let secrets = read(&Kind::Secret.file(root))?;
	let kept = |name: &str, length: usize, alphabet: &[u8]| -> Result<String, Error> {
		if let Some(value) = secrets.get(name).filter(|value| !value.is_empty()) {
			return Ok(value.clone());
		}
		let value = random(length, alphabet)?;
		set(root, Kind::Secret, name, Some(&value))?;
		Ok(value)
	};
	let upper = b"ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
	let mixed = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
	Ok(Credentials {
		access_key_id: kept(ACCESS_KEY_ID, 20, upper)?,
		secret_access_key: kept(SECRET_ACCESS_KEY, 40, mixed)?,
	})
}

/// A database's password, kept inside the URL its app is handed under `variable` in `secret.env`:
/// read back out of what is there, after `prefix`, or made with the URL `url` builds around it when
/// nothing is. See spec/architecture/databases.md, "Declared by the app, run beside it".
pub fn database_password(
	root: &Path,
	variable: &str,
	prefix: &str,
	url: impl FnOnce(&str) -> String,
) -> Result<String, Error> {
	let secrets = read(&Kind::Secret.file(root))?;
	if let Some(kept) = secrets.get(variable).filter(|value| !value.is_empty()) {
		let password = kept.strip_prefix(prefix).and_then(|rest| rest.split_once('@'));
		return match password {
			Some((password, _)) if !password.is_empty() => Ok(password.to_owned()),
			_ => Err(Error::Binding(variable.into())),
		};
	}
	let alphabet = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
	let password = random(32, alphabet)?;
	set(root, Kind::Secret, variable, Some(&url(&password)))?;
	Ok(password)
}

/// `length` characters of `alphabet` from the kernel's randomness, each byte past the largest
/// multiple of the alphabet's size thrown away so no character is likelier than another.
fn random(length: usize, alphabet: &[u8]) -> Result<String, Error> {
	use std::io::Read;
	let source = Path::new("/dev/urandom");
	let mut file = std::fs::File::open(source).map_err(failed(source))?;
	let limit = 256 - 256 % alphabet.len();
	let mut value = String::with_capacity(length);
	let mut byte = [0u8; 1];
	while value.len() < length {
		file.read_exact(&mut byte).map_err(failed(source))?;
		if usize::from(byte[0]) < limit {
			value.push(char::from(alphabet[usize::from(byte[0]) % alphabet.len()]));
		}
	}
	Ok(value)
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
	fn variables_name_each_ones_type_and_carry_a_value_only_for_config() {
		let root = tempfile::tempdir().unwrap();
		set(root.path(), Kind::Config, "LEVEL", Some("debug")).unwrap();
		set(root.path(), Kind::Secret, "TOKEN", Some("s3cret")).unwrap();
		let shown = shown(root.path()).unwrap();
		assert_eq!(
			shown.variables,
			[
				VariableShown { name: "LEVEL".into(), kind: "config", value: Some("debug".into()) },
				VariableShown { name: "TOKEN".into(), kind: "secret", value: None },
			]
		);
		assert!(!serde_json::to_string(&shown.variables).unwrap().contains("s3cret"));
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
	fn object_credentials_are_made_once_and_kept() {
		let root = tempfile::tempdir().unwrap();
		set(root.path(), Kind::Secret, "TOKEN", Some("mine")).unwrap();
		let made = credentials(root.path()).unwrap();
		assert_eq!(made.access_key_id.len(), 20);
		assert_eq!(made.secret_access_key.len(), 40);
		assert!(made.secret_access_key.bytes().all(|b| b.is_ascii_alphanumeric()));
		// A redeploy asks again and is given the same pair, beside what the app keeps itself.
		assert_eq!(credentials(root.path()).unwrap(), made);
		let shown = shown(root.path()).unwrap();
		let names = [ACCESS_KEY_ID, SECRET_ACCESS_KEY, "TOKEN"];
		assert_eq!(shown.secrets.iter().collect::<Vec<_>>(), names);
		// A half removed by hand is made again, and the other half kept.
		set(root.path(), Kind::Secret, SECRET_ACCESS_KEY, None).unwrap();
		let again = credentials(root.path()).unwrap();
		assert_eq!(again.access_key_id, made.access_key_id);
		assert_ne!(again.secret_access_key, made.secret_access_key);
	}

	#[test]
	fn a_database_url_is_made_once_and_its_password_read_back() {
		let root = tempfile::tempdir().unwrap();
		let prefix = "postgresql://umami:";
		let url = |password: &str| format!("{prefix}{password}@umami-postgres:5432/umami");
		let made = database_password(root.path(), "DATABASE_URL", prefix, url).unwrap();
		assert_eq!(made.len(), 32);
		assert!(made.bytes().all(|b| b.is_ascii_alphanumeric()));
		let kept = &read(&Kind::Secret.file(root.path())).unwrap()["DATABASE_URL"];
		assert_eq!(kept, &url(&made));
		// A redeploy is given the same password, and never writes the URL again.
		let unasked = |_: &str| -> String { panic!("the URL is kept") };
		assert_eq!(database_password(root.path(), "DATABASE_URL", prefix, unasked).unwrap(), made);
		// One changed by hand past reading is refused rather than written over.
		set(root.path(), Kind::Secret, "DATABASE_URL", Some("postgresql://elsewhere")).unwrap();
		let refused = database_password(root.path(), "DATABASE_URL", prefix, unasked);
		assert!(matches!(refused, Err(Error::Binding(_))));
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
