//! Embeds `platform/libs/status-schema/migrations`, as `sqlx::migrate!` would: every top-level
//! `<version>_<description>.sql`, sorted by version, written to `$OUT_DIR/migrations.rs` as
//! `(version, description, sql)`. Cargo.toml says why this is not the macro; `src/schema.rs`
//! turns the list into a migrator, and its tests hold it to sqlx's own reading of the directory.

use std::fmt::Write as _;
use std::path::PathBuf;

fn main() {
	let manifest = PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").expect("set by Cargo"));
	let directory = manifest.join("../../libs/status-schema/migrations");
	println!("cargo:rerun-if-changed={}", directory.display());

	let mut found = Vec::new();
	for entry in std::fs::read_dir(&directory).expect("the migrations directory is readable") {
		let path = entry.expect("a directory entry").path();
		if !path.is_file() {
			continue;
		}
		let name = path.file_name().and_then(|name| name.to_str()).unwrap_or_default().to_owned();
		let Some((version, rest)) = name.split_once('_') else { continue };
		let Some(description) = rest.strip_suffix(".sql") else { continue };
		let version: i64 = version.parse().expect("a migration's name starts with its version");
		println!("cargo:rerun-if-changed={}", path.display());
		found.push((version, description.replace('_', " "), path.canonicalize().expect("exists")));
	}
	found.sort_by_key(|(version, ..)| *version);

	let mut out = String::from("&[\n");
	for (version, description, path) in &found {
		writeln!(
			out,
			"\t({version}, {description:?}, include_str!({:?})),",
			path.display().to_string()
		)
		.expect("writing to a String");
	}
	out.push_str("]\n");
	let target = PathBuf::from(std::env::var("OUT_DIR").expect("set by Cargo")).join("migrations.rs");
	std::fs::write(target, out).expect("OUT_DIR is writable");
}
