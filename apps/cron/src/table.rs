//! `schedules.json`, the table host writes into this service's directory. See
//! spec/architecture/cron.md, "host gives `cron` the table".

use crate::schedule::Schedule;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::time::SystemTime;

pub const FILE: &str = "schedules.json";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CatchUp {
	Once,
	Skip,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Overlap {
	Skip,
	Queue,
}

/// How `cron` asks: a scope through Caddy, or a socket host mounted.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Reach {
	Scope(String),
	Socket(PathBuf),
}

/// One job as host wrote it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Job {
	pub service: String,
	pub name: String,
	pub cron: Option<String>,
	pub every: Option<String>,
	pub path: String,
	pub catch_up: CatchUp,
	pub overlap: Overlap,
	/// Seconds before a run is called failed.
	pub timeout: u64,
	pub reach: Reach,
}

impl Job {
	/// Exactly one of `cron` and `every`, and a schedule that reads.
	pub fn schedule(&self) -> Result<Schedule, String> {
		match (&self.cron, &self.every) {
			(Some(cron), None) => Schedule::cron(cron),
			(None, Some(every)) => Schedule::every(every),
			_ => Err("a job takes exactly one of `cron` and `every`".into()),
		}
	}

	/// What the ledger's summary and the API name the schedule by.
	pub fn schedule_text(&self) -> String {
		match (&self.cron, &self.every) {
			(Some(cron), _) => cron.clone(),
			(None, Some(every)) => format!("every {every}"),
			(None, None) => String::new(),
		}
	}
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct Table {
	pub jobs: Vec<Job>,
}

impl Table {
	/// The whole table or an error: one bad job refuses the file, so the last good table stays.
	pub fn parse(text: &str) -> Result<Self, String> {
		let table: Self = serde_json::from_str(text).map_err(|error| error.to_string())?;
		let mut seen = std::collections::HashSet::new();
		for job in &table.jobs {
			job.schedule().map_err(|error| format!("{}/{}: {error}", job.service, job.name))?;
			if !job.path.starts_with('/') {
				return Err(format!("{}/{}: a path starts with /", job.service, job.name));
			}
			if !seen.insert((job.service.as_str(), job.name.as_str())) {
				return Err(format!("{}/{}: listed twice", job.service, job.name));
			}
		}
		Ok(table)
	}
}

/// The file's modification time, which is what says it changed; host replaces it by a rename.
pub fn modified(directory: &Path) -> Option<SystemTime> {
	std::fs::metadata(directory.join(FILE)).and_then(|meta| meta.modified()).ok()
}

pub fn read(directory: &Path) -> Result<Table, String> {
	let text = std::fs::read_to_string(directory.join(FILE)).map_err(|error| error.to_string())?;
	Table::parse(&text)
}

#[cfg(test)]
mod tests {
	use super::*;

	/// The example in spec/architecture/cron.md, verbatim.
	const EXAMPLE: &str = r#"{
		"jobs": [
			{
				"service": "geo",
				"name": "refresh",
				"cron": "0 4 * * *",
				"every": null,
				"path": "/jobs/refresh",
				"catch_up": "once",
				"overlap": "skip",
				"timeout": 300,
				"reach": { "scope": "geo" }
			},
			{
				"service": "apt",
				"name": "update",
				"cron": "0 7 * * *",
				"every": null,
				"path": "/jobs/update",
				"catch_up": "once",
				"overlap": "skip",
				"timeout": 1800,
				"reach": { "socket": "/sockets/apt/apt.sock" }
			}
		]
	}"#;

	#[test]
	fn reads_the_table_the_spec_shows() {
		let table = Table::parse(EXAMPLE).unwrap();
		assert_eq!(table.jobs.len(), 2);
		assert_eq!(table.jobs[0].reach, Reach::Scope("geo".into()));
		assert_eq!(table.jobs[1].reach, Reach::Socket("/sockets/apt/apt.sock".into()));
		assert_eq!(table.jobs[1].catch_up, CatchUp::Once);
		assert_eq!(table.jobs[1].timeout, 1800);
	}

	#[test]
	fn refuses_both_or_neither_schedule() {
		let both = EXAMPLE.replacen(r#""every": null"#, r#""every": "1m""#, 1);
		assert!(Table::parse(&both).is_err());
		let neither = EXAMPLE.replacen(r#""cron": "0 4 * * *""#, r#""cron": null"#, 1);
		assert!(Table::parse(&neither).is_err());
		let every = neither.replacen(r#""every": null"#, r#""every": "30s""#, 1);
		assert!(Table::parse(&every).is_ok());
	}

	#[test]
	fn refuses_a_bad_expression_a_duplicate_and_an_unknown_policy() {
		assert!(Table::parse(&EXAMPLE.replacen("0 4 * * *", "0 4 * *", 1)).is_err());
		assert!(
			Table::parse(&EXAMPLE.replacen("update", "refresh", 1).replacen("apt", "geo", 1)).is_err()
		);
		assert!(
			Table::parse(&EXAMPLE.replacen(r#""overlap": "skip""#, r#""overlap": "wait""#, 1)).is_err()
		);
	}
}
