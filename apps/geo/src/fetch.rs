//! Fetching GeoLite2 from its mirror and swapping it in -- see spec/architecture/geo.md,
//! "**geo fetches it itself, at run time, once a day**".
//!
//! `P3TERX/GeoLite.mmdb` republishes MaxMind's GeoLite2 City and ASN as plain `.mmdb` files under
//! its `latest` release tag, so this address always answers with whatever it most recently built,
//! no license key needed. It redirects twice: once from `latest/download/<asset>` to the tagged
//! release, once from there to signed release-asset storage.

use crate::store::{Readers, Store};
use anyhow::{Context, bail};
use bytes::Bytes;
use http_body_util::{BodyExt, Empty};
use hyper::Request;
use hyper_rustls::HttpsConnector;
use hyper_util::client::legacy::Client as HyperClient;
use hyper_util::client::legacy::connect::HttpConnector;
use hyper_util::rt::TokioExecutor;
use std::net::IpAddr;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;
use tokio::io::AsyncWriteExt;

const CITY_URL: &str = urls::EXTERNAL_GEOLITE_CITY;
const ASN_URL: &str = urls::EXTERNAL_GEOLITE_ASN;

/// GitHub's own redirect to the tagged release, then to signed storage: two hops, seen live.
const MAX_REDIRECTS: u8 = 5;
const DAY: Duration = Duration::from_secs(24 * 60 * 60);

/// A known-good address, present in both databases, to prove a downloaded file readable.
const CANARY: IpAddr = IpAddr::V4(std::net::Ipv4Addr::new(1, 1, 1, 1));

pub struct Client {
	inner: HyperClient<HttpsConnector<HttpConnector>, Empty<Bytes>>,
}

impl Client {
	/// Roots compiled in rather than read from the system: the image is built from scratch and
	/// has none. See libs/deploy/src/github.rs, `GitHub::new`.
	pub fn new() -> Self {
		let https = hyper_rustls::HttpsConnectorBuilder::new()
			.with_webpki_roots()
			.https_only()
			.enable_http1()
			.build();
		Self { inner: HyperClient::builder(TokioExecutor::new()).build(https) }
	}

	/// GET `url`, following redirects itself, and write the body to `dest`.
	async fn download(&self, url: &str, dest: &Path) -> anyhow::Result<()> {
		let mut uri = url.to_owned();
		let mut answer = None;
		for _ in 0..MAX_REDIRECTS {
			let request = Request::get(&uri).header("user-agent", "canmi-geo").body(Empty::new())?;
			let response = self.inner.request(request).await.context(uri.clone())?;
			if response.status().is_redirection() {
				let location = response
					.headers()
					.get(hyper::header::LOCATION)
					.and_then(|value| value.to_str().ok())
					.map(str::to_owned)
					.with_context(|| format!("{uri} redirected with no location"))?;
				uri = location;
				continue;
			}
			if !response.status().is_success() {
				bail!("{uri} answered {}", response.status());
			}
			answer = Some(response);
			break;
		}
		let mut response = answer.with_context(|| format!("{url} redirected too many times"))?;

		if let Some(parent) = dest.parent() {
			tokio::fs::create_dir_all(parent).await?;
		}
		let mut file =
			tokio::fs::File::create(dest).await.with_context(|| dest.display().to_string())?;
		while let Some(frame) = response.body_mut().frame().await {
			if let Some(data) = frame?.data_ref() {
				file.write_all(data).await?;
			}
		}
		file.flush().await?;
		Ok(())
	}
}

impl Default for Client {
	fn default() -> Self {
		Self::new()
	}
}

fn city_path(dir: &Path) -> PathBuf {
	dir.join("GeoLite2-City.mmdb")
}

fn asn_path(dir: &Path) -> PathBuf {
	dir.join("GeoLite2-ASN.mmdb")
}

/// Open whatever is already at `dir`, memory-mapped, without fetching anything.
fn open(dir: &Path) -> anyhow::Result<Readers> {
	// SAFETY: a file here is only ever replaced by a rename over a freshly written path, never
	// modified in place -- so a reader mapping the file that used to be at this path keeps
	// mapping it, unharmed, even after this call returns a reader for what replaced it.
	let city = unsafe { maxminddb::Reader::open_mmap(city_path(dir)) }?;
	let asn = unsafe { maxminddb::Reader::open_mmap(asn_path(dir)) }?;
	Ok(Readers { city, asn })
}

/// Open `path` and look up one address, to prove it whole rather than merely present.
fn verify(path: &Path) -> anyhow::Result<()> {
	// SAFETY: `path` is a `.tmp` file nothing else touches until this returns; it is renamed
	// into place only afterward.
	let reader = unsafe { maxminddb::Reader::open_mmap(path) }?;
	reader.lookup(CANARY)?;
	Ok(())
}

/// Download both files beside the ones in use, prove each readable, then rename over the old
/// ones and hand back readers for what now sits at `dir`.
async fn refresh_once(client: &Client, dir: &Path) -> anyhow::Result<Readers> {
	tokio::fs::create_dir_all(dir).await?;
	let city_tmp = dir.join("GeoLite2-City.mmdb.tmp");
	let asn_tmp = dir.join("GeoLite2-ASN.mmdb.tmp");

	client.download(CITY_URL, &city_tmp).await.context("City")?;
	client.download(ASN_URL, &asn_tmp).await.context("ASN")?;
	verify(&city_tmp).context("the downloaded City file is not a readable database")?;
	verify(&asn_tmp).context("the downloaded ASN file is not a readable database")?;

	tokio::fs::rename(&city_tmp, city_path(dir)).await?;
	tokio::fs::rename(&asn_tmp, asn_path(dir)).await?;
	open(dir)
}

/// Fetch once a day, forever: at start with whatever is already on disk if anything is, then a
/// fetch straight away (which is the "at start when none is on disk" case), then one a day after.
/// A failed download or a bad file leaves `store` holding the previous file; `/ip` answers `503`
/// only until the very first one lands.
pub async fn refresh_forever(dir: PathBuf, store: Arc<Store>) {
	if let Ok(readers) = open(&dir) {
		store.set(readers);
	}
	let client = Client::new();
	loop {
		match refresh_once(&client, &dir).await {
			Ok(readers) => store.set(readers),
			Err(error) => eprintln!("geo: GeoLite2 refresh failed, keeping the previous file: {error:#}"),
		}
		tokio::time::sleep(DAY).await;
	}
}

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn opening_a_directory_with_nothing_in_it_fails_rather_than_panics() {
		assert!(open(Path::new("/nowhere-at-all")).is_err());
	}
}
