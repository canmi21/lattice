//! What CI built, fetched: a run's record held to what a deploy requires, and its artifacts
//! downloaded and held to the digest GitHub recorded for them. The notice that names a run is a
//! hint; this is where it becomes a decision. See spec/architecture/host.md, "The machine pulls;
//! nothing pushes into it".

use bytes::Bytes;
use http_body_util::{BodyExt, Empty};
use hyper::Request;
use hyper::body::Incoming;
use hyper_util::client::legacy::Client;
use hyper_util::client::legacy::connect::HttpConnector;
use hyper_util::rt::TokioExecutor;
use serde::Deserialize;
use serde::de::DeserializeOwned;
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};
use tokio::io::AsyncWriteExt;

/// The workflow that builds images; a run of any other builds nothing to deploy.
pub const WORKFLOW: &str = ".github/workflows/deploy.yml";
/// What may have started it. A pull request never does, and would not count if it did.
const EVENTS: [&str; 3] = ["push", "schedule", "workflow_dispatch"];
/// How an artifact carrying an app's image is named: `deploy-geo`.
const PREFIX: &str = "deploy-";

#[derive(Debug, thiserror::Error)]
pub enum Error {
	#[error("GitHub answered {status} for {what}")]
	Status { status: u16, what: String },
	#[error("reaching GitHub: {0}")]
	Http(String),
	#[error("run {run} is not one to deploy: {why}")]
	NotDeployable { run: u64, why: String },
	#[error("artifact `{0}` does not match the digest GitHub recorded for it")]
	Digest(String),
	#[error("artifact `{name}` is not what CI uploads: {why}")]
	Shape { name: String, why: String },
	#[error("{what}: {source}")]
	Io { what: String, source: std::io::Error },
}

fn io(what: impl Into<String>) -> impl FnOnce(std::io::Error) -> Error {
	let what = what.into();
	move |source| Error::Io { what, source }
}

#[derive(Debug, Deserialize)]
pub struct Run {
	pub repository: Repository,
	pub path: String,
	pub head_branch: Option<String>,
	pub event: String,
	pub status: String,
	pub conclusion: Option<String>,
	/// The commit the run built, recorded beside what it deployed.
	#[serde(default)]
	pub head_sha: Option<String>,
}

/// What a run built: its commit, and the artifacts it left.
#[derive(Debug)]
pub struct Built {
	pub commit: Option<String>,
	pub artifacts: Vec<Artifact>,
}

#[derive(Debug, Deserialize)]
pub struct Repository {
	pub full_name: String,
}

#[derive(Deserialize)]
struct Listed {
	artifacts: Vec<Record>,
}

#[derive(Deserialize)]
struct Record {
	id: u64,
	name: String,
	expired: bool,
	digest: Option<String>,
}

/// One app's image as a run left it.
#[derive(Debug, Clone)]
pub struct Artifact {
	pub app: String,
	id: u64,
	digest: String,
}

/// An artifact on disk: the image archive, and the declaration built beside it.
pub struct Fetched {
	pub image: PathBuf,
	pub declaration: String,
}

/// The app an artifact name carries, when the name is one CI gives and the app a name an app can
/// have. The name comes from GitHub's answer, not from this repository, so it is held to the
/// same rule as any other name before anything is done with it.
pub fn app_of(artifact: &str) -> Option<String> {
	let app = artifact.strip_prefix(PREFIX)?;
	let named = crate::manifest::check_name(app).is_ok() || crate::manifest::OWN.contains(&app);
	named.then(|| app.to_owned())
}

/// Whether `record` is a finished, successful run of this repository's deploy workflow on `main`.
pub fn check(run: u64, record: &Run, repository: &str) -> Result<(), Error> {
	let refuse = |why: String| Err(Error::NotDeployable { run, why });
	if record.repository.full_name != repository {
		return refuse(format!("it belongs to {}", record.repository.full_name));
	}
	if record.path != WORKFLOW {
		return refuse(format!("it ran {}", record.path));
	}
	if record.head_branch.as_deref() != Some("main") {
		return refuse(format!("it ran on {:?}", record.head_branch));
	}
	if !EVENTS.contains(&record.event.as_str()) {
		return refuse(format!("a {} started it", record.event));
	}
	if record.status != "completed" || record.conclusion.as_deref() != Some("success") {
		return refuse(format!("it is {} with {:?}", record.status, record.conclusion));
	}
	Ok(())
}

pub struct GitHub {
	client: Client<hyper_rustls::HttpsConnector<HttpConnector>, Empty<Bytes>>,
	repository: String,
	token: String,
}

impl GitHub {
	/// Roots compiled in rather than read from the system: an image built from scratch has none.
	pub fn new(token: String) -> Self {
		let https = hyper_rustls::HttpsConnectorBuilder::new()
			.with_webpki_roots()
			.https_only()
			.enable_http1()
			.build();
		let repository = canmi::SOURCE
			.trim_start_matches(canmi::EXTERNAL_GITHUB_WEB)
			.trim_start_matches('/')
			.to_owned();
		Self { client: Client::builder(TokioExecutor::new()).build(https), repository, token }
	}

	/// A GET, with the token only when it is GitHub's own API being asked.
	async fn get(&self, uri: &str, authorized: bool) -> Result<hyper::Response<Incoming>, Error> {
		let mut request = Request::get(uri)
			.header("user-agent", "canmi-host")
			.header("accept", "application/vnd.github+json")
			.header("x-github-api-version", "2022-11-28");
		if authorized {
			request = request.header("authorization", format!("Bearer {}", self.token));
		}
		let request = request.body(Empty::new()).map_err(|e| Error::Http(e.to_string()))?;
		self.client.request(request).await.map_err(|e| Error::Http(e.to_string()))
	}

	async fn json<T: DeserializeOwned>(&self, path: &str) -> Result<T, Error> {
		let uri = format!("{}/repos/{}{path}", canmi::EXTERNAL_GITHUB_API, self.repository);
		let response = self.get(&uri, true).await?;
		let status = response.status().as_u16();
		let body = response.into_body().collect().await.map_err(|e| Error::Http(e.to_string()))?;
		if !(200..300).contains(&status) {
			return Err(Error::Status { status, what: path.to_owned() });
		}
		serde_json::from_slice(&body.to_bytes()).map_err(|e| Error::Http(e.to_string()))
	}

	/// The deploy artifacts of `run`, once its record says it is one to deploy.
	pub async fn artifacts(&self, run: u64) -> Result<Built, Error> {
		let record: Run = self.json(&format!("/actions/runs/{run}")).await?;
		check(run, &record, &self.repository)?;
		let listed: Listed = self.json(&format!("/actions/runs/{run}/artifacts?per_page=100")).await?;
		let artifacts = listed
			.artifacts
			.into_iter()
			.filter(|record| !record.expired)
			.filter_map(|record| {
				Some(Artifact { app: app_of(&record.name)?, id: record.id, digest: record.digest? })
			})
			.collect();
		Ok(Built { commit: record.head_sha, artifacts })
	}

	/// Download `artifact` into `directory`, hold it to its digest, and take out what CI put in it.
	pub async fn fetch(&self, artifact: &Artifact, directory: &Path) -> Result<Fetched, Error> {
		tokio::fs::create_dir_all(directory).await.map_err(io(directory.display().to_string()))?;
		// GitHub answers with a redirect to storage, which is signed and must not be sent the token.
		let uri = format!(
			"{}/repos/{}/actions/artifacts/{}/zip",
			canmi::EXTERNAL_GITHUB_API,
			self.repository,
			artifact.id
		);
		let redirect = self.get(&uri, true).await?;
		let status = redirect.status().as_u16();
		let location = redirect
			.headers()
			.get(hyper::header::LOCATION)
			.and_then(|value| value.to_str().ok())
			.map(str::to_owned)
			.ok_or(Error::Status { status, what: format!("artifact {}", artifact.id) })?;
		let mut response = self.get(&location, false).await?;
		let status = response.status().as_u16();
		if !(200..300).contains(&status) {
			return Err(Error::Status { status, what: format!("artifact {} from storage", artifact.id) });
		}

		// Named by a counter, like an upload, so nothing GitHub answered becomes part of a path.
		let zip = crate::arrival(directory);
		let mut file = tokio::fs::File::create(&zip).await.map_err(io(zip.display().to_string()))?;
		let mut hasher = Sha256::new();
		while let Some(frame) = response.body_mut().frame().await {
			let frame = frame.map_err(|e| Error::Http(e.to_string()))?;
			if let Some(data) = frame.data_ref() {
				hasher.update(data);
				file.write_all(data).await.map_err(io(zip.display().to_string()))?;
			}
		}
		file.flush().await.map_err(io(zip.display().to_string()))?;
		// GitHub's digest is the SHA-256 of the zip as it is downloaded; measured on run 36368010996.
		let digest = format!("sha256:{}", hex(&hasher.finalize()));
		if !digest.eq_ignore_ascii_case(&artifact.digest) {
			let _ = tokio::fs::remove_file(&zip).await;
			return Err(Error::Digest(artifact.app.clone()));
		}

		let image = crate::arrival(directory);
		let (name, from, to) = (artifact.app.clone(), zip.clone(), image.clone());
		let unpacked = tokio::task::spawn_blocking(move || unpack(&name, &from, &to))
			.await
			.map_err(|e| Error::Http(e.to_string()))?;
		let _ = tokio::fs::remove_file(&zip).await;
		Ok(Fetched { image, declaration: unpacked? })
	}
}

fn hex(bytes: &[u8]) -> String {
	bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

/// `image.tar` out to `image`, and `service.toml` as text: the two files the workflow uploads.
fn unpack(name: &str, zip: &Path, image: &Path) -> Result<String, Error> {
	let shape = |why: String| Error::Shape { name: name.to_owned(), why };
	let file = std::fs::File::open(zip).map_err(io(zip.display().to_string()))?;
	let mut archive = zip::ZipArchive::new(file).map_err(|e| shape(e.to_string()))?;
	{
		let mut entry = archive.by_name("image.tar").map_err(|e| shape(e.to_string()))?;
		let mut out = std::fs::File::create(image).map_err(io(image.display().to_string()))?;
		std::io::copy(&mut entry, &mut out).map_err(io(image.display().to_string()))?;
	}
	let mut declaration = String::new();
	let mut entry = archive.by_name("service.toml").map_err(|e| shape(e.to_string()))?;
	std::io::Read::read_to_string(&mut entry, &mut declaration).map_err(|e| shape(e.to_string()))?;
	Ok(declaration)
}

#[cfg(test)]
mod tests {
	use super::*;

	fn run() -> Run {
		Run {
			repository: Repository { full_name: "owner/lattice".into() },
			path: WORKFLOW.into(),
			head_branch: Some("main".into()),
			event: "push".into(),
			status: "completed".into(),
			conclusion: Some("success".into()),
			head_sha: None,
		}
	}

	#[test]
	fn a_successful_deploy_run_on_main_is_one_to_deploy() {
		assert!(check(1, &run(), "owner/lattice").is_ok());
		assert!(check(1, &Run { event: "schedule".into(), ..run() }, "owner/lattice").is_ok());
	}

	#[test]
	fn anything_else_is_refused() {
		let refused = |record: Run| check(1, &record, "owner/lattice").is_err();
		assert!(refused(Run { repository: Repository { full_name: "else/lattice".into() }, ..run() }));
		assert!(refused(Run { path: ".github/workflows/other.yml".into(), ..run() }));
		assert!(refused(Run { head_branch: Some("feature".into()), ..run() }));
		assert!(refused(Run { head_branch: None, ..run() }));
		assert!(refused(Run { event: "pull_request".into(), ..run() }));
		assert!(refused(Run { status: "in_progress".into(), conclusion: None, ..run() }));
		assert!(refused(Run { conclusion: Some("failure".into()), ..run() }));
	}

	#[test]
	fn the_repository_is_read_from_the_source_address() {
		assert_eq!(GitHub::new(String::new()).repository, "canmi21/lattice");
	}

	#[test]
	fn an_artifact_names_an_app_only_when_the_name_could_be_one() {
		assert_eq!(app_of("deploy-geo").as_deref(), Some("geo"));
		assert_eq!(app_of("deploy-host").as_deref(), Some("host"));
		assert_eq!(app_of("deploy-keeper").as_deref(), Some("keeper"));
		// A name from GitHub's answer never reaches a path, but it is refused before it could.
		assert_eq!(app_of("deploy-../../etc"), None);
		assert_eq!(app_of("deploy-api"), None);
		assert_eq!(app_of("other-geo"), None);
	}

	#[test]
	fn a_digest_is_lowercase_hex() {
		assert_eq!(hex(&[0x00, 0xab, 0x10]), "00ab10");
	}
}
