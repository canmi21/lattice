//! What a certificate a capture was asked to overlook was wrong with, found by asking the host
//! again as a strict client would. Only an `insecure` capture asks; one whose check cannot finish
//! says nothing rather than failing. See spec/architecture/shot.md, "What an answer tells".

use rustls::pki_types::ServerName;
use rustls::{ClientConfig, RootCertStore};
use std::net::IpAddr;
use std::sync::Arc;
use std::time::Duration;
use tokio::net::TcpStream;
use tokio_rustls::TlsConnector;

/// How long connecting and the handshake may each take.
const ATTEMPT: Duration = Duration::from_secs(5);

/// Why a strict client would refuse `host`'s certificate at `address`; nothing when it would not,
/// or when the question could not be put.
pub async fn overlooked(host: &str, address: IpAddr, port: u16) -> Option<String> {
	let roots = RootCertStore { roots: webpki_roots::TLS_SERVER_ROOTS.to_vec() };
	let config =
		ClientConfig::builder_with_provider(Arc::new(rustls::crypto::ring::default_provider()))
			.with_safe_default_protocol_versions()
			.ok()?
			.with_root_certificates(roots)
			.with_no_client_auth();
	let name = ServerName::try_from(host.to_owned()).ok()?;
	let stream =
		tokio::time::timeout(ATTEMPT, TcpStream::connect((address, port))).await.ok()?.ok()?;
	match tokio::time::timeout(ATTEMPT, TlsConnector::from(Arc::new(config)).connect(name, stream))
		.await
	{
		Ok(Err(refused)) => Some(refused.to_string()),
		_ => None,
	}
}

#[cfg(test)]
mod tests {
	use super::*;

	/// Asks real hosts; run with `cargo test -p shot -- --ignored` on a machine with a network.
	#[tokio::test]
	#[ignore]
	async fn names_what_is_wrong_and_nothing_when_nothing_is() {
		let address = |host: &str| {
			let host = host.to_owned();
			async move { tokio::net::lookup_host((host.as_str(), 443)).await.unwrap().next().unwrap().ip() }
		};
		let bad =
			overlooked("self-signed.badssl.com", address("self-signed.badssl.com").await, 443).await;
		assert!(bad.as_deref().is_some_and(|why| why.contains("UnknownIssuer")), "{bad:?}");
		let expired = overlooked("expired.badssl.com", address("expired.badssl.com").await, 443).await;
		assert!(expired.as_deref().is_some_and(|why| why.contains("expired")), "{expired:?}");
		assert_eq!(overlooked("example.com", address("example.com").await, 443).await, None);
	}
}
