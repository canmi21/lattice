//! The one way out of the browser. Every request a capture makes -- the page, what it loads, where
//! it redirects -- comes here, and is sent on to an address this proxy resolved and judged itself,
//! so the browser never resolves a name and a name cannot change its answer between the judging and
//! the connecting. See spec/architecture/shot.md, "Only public addresses".

use crate::resolve::{Reach, Resolve, destination};
use std::net::{IpAddr, SocketAddr};
use std::sync::Arc;
use std::time::Duration;
use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader};
use tokio::net::{TcpListener, TcpStream};

/// The longest request head a browser sends, and more.
const HEAD: usize = 64 * 1024;
/// How long reaching an address may take.
const CONNECT: Duration = Duration::from_secs(10);

/// Listen on a loopback port of its own for one reach; answers the port.
pub async fn start<R: Resolve>(resolver: Arc<R>, reach: Reach) -> std::io::Result<u16> {
	let listener = TcpListener::bind("127.0.0.1:0").await?;
	let port = listener.local_addr()?.port();
	tokio::spawn(async move {
		loop {
			let Ok((client, _)) = listener.accept().await else { continue };
			let resolver = resolver.clone();
			tokio::spawn(async move {
				if let Err(error) = relay(client, &*resolver, reach).await {
					eprintln!("shot: proxy: {error}");
				}
			});
		}
	});
	Ok(port)
}

/// What a browser asked the proxy for.
#[derive(Debug, PartialEq)]
pub enum Asked {
	/// A tunnel, for HTTPS: the host and port to open it to.
	Tunnel { host: String, port: u16 },
	/// A plain request, sent on as it came but addressed to the origin, and closed after one answer.
	Plain { host: String, port: u16, head: Vec<u8> },
}

/// Read a request head as a browser sends it to a proxy. Anything but a tunnel or an absolute
/// `http` address is refused.
pub fn read_head(head: &str) -> Result<Asked, String> {
	let mut lines = head.split("\r\n");
	let line = lines.next().unwrap_or_default();
	let mut parts = line.split(' ');
	let (Some(method), Some(target), Some(version)) = (parts.next(), parts.next(), parts.next())
	else {
		return Err("a request line the proxy cannot read".into());
	};
	if method == "CONNECT" {
		let (host, port) = target.rsplit_once(':').ok_or("a tunnel with no port")?;
		let port = port.parse().map_err(|_| "a tunnel with no port")?;
		return Ok(Asked::Tunnel { host: host.to_owned(), port });
	}
	let url = url::Url::parse(target).map_err(|_| "a request that is not to an absolute address")?;
	if url.scheme() != "http" {
		return Err(format!("{} is not a scheme a capture may use", url.scheme()));
	}
	let host = url.host_str().ok_or("a request with no host")?.to_owned();
	let port = url.port_or_known_default().unwrap_or(80);
	let path = match url.query() {
		Some(query) => format!("{}?{query}", url.path()),
		None => url.path().to_owned(),
	};
	let mut sent = format!("{method} {path} {version}\r\n");
	for header in lines.filter(|header| !header.is_empty()) {
		let name = header.split(':').next().unwrap_or_default().trim().to_ascii_lowercase();
		// One answer per connection, so a browser reusing it for another host is judged again.
		if !matches!(
			name.as_str(),
			"connection" | "proxy-connection" | "keep-alive" | "proxy-authorization"
		) {
			sent.push_str(header);
			sent.push_str("\r\n");
		}
	}
	sent.push_str("Connection: close\r\n\r\n");
	Ok(Asked::Plain { host, port, head: sent.into_bytes() })
}

async fn refuse(client: &mut TcpStream, status: &str) -> std::io::Result<()> {
	let answer = format!("HTTP/1.1 {status}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");
	client.write_all(answer.as_bytes()).await
}

async fn connect(addresses: &[IpAddr], port: u16) -> Option<TcpStream> {
	for &address in addresses {
		let reached =
			tokio::time::timeout(CONNECT, TcpStream::connect(SocketAddr::new(address, port))).await;
		if let Ok(Ok(stream)) = reached {
			return Some(stream);
		}
	}
	None
}

async fn relay<R: Resolve>(
	mut client: TcpStream,
	resolver: &R,
	reach: Reach,
) -> std::io::Result<()> {
	let mut reader = BufReader::new(&mut client);
	let mut head = Vec::new();
	while !head.ends_with(b"\r\n\r\n") {
		if head.len() > HEAD || reader.read_until(b'\n', &mut head).await? == 0 {
			return Ok(());
		}
	}
	// Whatever the browser sent past the head is the start of the body, and goes on with it.
	let early = reader.buffer().to_vec();
	let asked = match read_head(&String::from_utf8_lossy(&head)) {
		Ok(asked) => asked,
		Err(_) => return refuse(&mut client, "400 Bad Request").await,
	};
	let (host, port) = match &asked {
		Asked::Tunnel { host, port } | Asked::Plain { host, port, .. } => (host.clone(), *port),
	};
	let addresses = match destination(resolver, &host, reach).await {
		Ok(addresses) => addresses,
		Err(_) => return refuse(&mut client, "403 Forbidden").await,
	};
	let Some(mut server) = connect(&addresses, port).await else {
		return refuse(&mut client, "502 Bad Gateway").await;
	};
	match asked {
		Asked::Tunnel { .. } => {
			client.write_all(b"HTTP/1.1 200 Connection Established\r\n\r\n").await?
		}
		Asked::Plain { head, .. } => server.write_all(&head).await?,
	}
	server.write_all(&early).await?;
	tokio::io::copy_bidirectional(&mut client, &mut server).await?;
	// Read to the end so a peer that closed first is not reset mid-answer.
	let _ = client.read(&mut [0; 1]).await;
	Ok(())
}

#[cfg(test)]
mod tests {
	use super::*;
	use crate::resolve::tests::Table;

	#[test]
	fn reads_a_tunnel_and_readdresses_a_plain_request() {
		assert_eq!(
			read_head("CONNECT example.com:443 HTTP/1.1\r\nHost: example.com:443\r\n\r\n"),
			Ok(Asked::Tunnel { host: "example.com".into(), port: 443 })
		);
		let Ok(Asked::Plain { host, port, head }) = read_head(
			"GET http://example.com:8080/a/b?c=d HTTP/1.1\r\nHost: example.com:8080\r\nProxy-Connection: keep-alive\r\nConnection: keep-alive\r\nAccept: */*\r\n\r\n",
		) else {
			panic!("not read as a plain request");
		};
		assert_eq!((host.as_str(), port), ("example.com", 8080));
		assert_eq!(
			String::from_utf8(head).unwrap(),
			"GET /a/b?c=d HTTP/1.1\r\nHost: example.com:8080\r\nAccept: */*\r\nConnection: close\r\n\r\n"
		);
		for refused in [
			"GET /relative HTTP/1.1\r\n\r\n",
			"GET ftp://example.com/ HTTP/1.1\r\n\r\n",
			"CONNECT example.com HTTP/1.1\r\n\r\n",
			"\r\n\r\n",
		] {
			assert!(read_head(refused).is_err(), "{refused:?}");
		}
	}

	/// A server on loopback that answers once with what it was sent.
	async fn echo() -> u16 {
		let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
		let port = listener.local_addr().unwrap().port();
		tokio::spawn(async move {
			while let Ok((mut stream, _)) = listener.accept().await {
				let mut seen = vec![0; 4096];
				let read = stream.read(&mut seen).await.unwrap_or(0);
				let body = String::from_utf8_lossy(&seen[..read]).into_owned();
				let answer = format!(
					"HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
					body.len()
				);
				let _ = stream.write_all(answer.as_bytes()).await;
			}
		});
		port
	}

	async fn through(proxy: u16, request: String) -> String {
		let mut stream = TcpStream::connect(("127.0.0.1", proxy)).await.unwrap();
		stream.write_all(request.as_bytes()).await.unwrap();
		let mut answer = String::new();
		let _ = stream.read_to_string(&mut answer).await;
		answer
	}

	#[tokio::test]
	async fn sends_ours_inside_and_refuses_the_public() {
		let origin = echo().await;
		let resolver = Arc::new(Table(vec![("home.test", vec!["127.0.0.1".parse().unwrap()])]));
		let internal = start(resolver.clone(), Reach::Internal).await.unwrap();
		let public = start(resolver, Reach::Public).await.unwrap();

		let plain = format!(
			"GET http://home.test:{origin}/hello?x=1 HTTP/1.1\r\nHost: home.test\r\nProxy-Connection: keep-alive\r\n\r\n"
		);
		let answer = through(internal, plain.clone()).await;
		assert!(answer.starts_with("HTTP/1.1 200 OK"), "{answer}");
		// The origin was asked in origin form, and told to close after one answer.
		assert!(answer.contains("GET /hello?x=1 HTTP/1.1\r\n"), "{answer}");
		assert!(
			answer.contains("Connection: close") && !answer.contains("Proxy-Connection"),
			"{answer}"
		);
		assert!(through(public, plain).await.starts_with("HTTP/1.1 403"));

		let tunnel = format!("CONNECT home.test:{origin} HTTP/1.1\r\n\r\nping");
		let opened = through(internal, tunnel.clone()).await;
		assert!(
			opened.starts_with("HTTP/1.1 200 Connection Established\r\n\r\nHTTP/1.1 200 OK"),
			"{opened}"
		);
		assert!(opened.ends_with("ping"), "{opened}");
		for refused in [
			tunnel,
			format!("CONNECT 127.0.0.1:{origin} HTTP/1.1\r\n\r\n"),
			format!("CONNECT [::1]:{origin} HTTP/1.1\r\n\r\n"),
		] {
			assert!(through(public, refused.clone()).await.starts_with("HTTP/1.1 403"), "{refused}");
		}
	}
}
