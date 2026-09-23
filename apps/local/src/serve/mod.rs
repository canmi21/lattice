//! `local serve`: the HTTP shell, beside the command line and over the same operations.
//!
//! Two halves answer here. This one owns bytes, derivation and the model calls; the TypeScript
//! half owns the collection's relational side, because its schema is Drizzle's and there is not
//! going to be a second declaration of it. What arrives under `/collection` is forwarded and
//! everything else is answered here, so which half owns a route is readable from the route.
//!
//! See spec/architecture/local.md.

mod proxy;

use anyhow::Context as _;
use axum::Router;
use axum::extract::State;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::routing::get;
use std::path::PathBuf;
use std::sync::Arc;

/// Where the TypeScript half listens, which is a socket rather than a port on purpose.
///
/// A port is an address, and an address is something another program can reach. This half is an
/// implementation detail of `local`, so it is given no address at all: the socket lives beside the
/// claims and locks under `.local/`, and nothing off this machine can name it.
pub fn socket_path(repository: &std::path::Path) -> PathBuf {
	repository.join(".local").join("collection.sock")
}

pub struct Shell {
	pub socket: PathBuf,
}

pub fn router(shell: Shell) -> Router {
	Router::new().route("/health", get(health)).fallback(proxy::forward).with_state(Arc::new(shell))
}

/// Whether both halves are up, which is the one question a caller cannot answer for itself.
///
/// The socket existing is not the same as the half behind it answering, so this asks it rather
/// than stating a file exists.
async fn health(State(shell): State<Arc<Shell>>) -> impl IntoResponse {
	let collection = proxy::reachable(&shell.socket).await;
	let code = if collection { StatusCode::OK } else { StatusCode::SERVICE_UNAVAILABLE };
	let body = format!("{{\"local\":true,\"collection\":{collection}}}");
	(code, [(axum::http::header::CONTENT_TYPE, "application/json")], body)
}

/// Bind, spawn the other half, and serve until interrupted.
///
/// The child inherits stdout and stderr: what it says is part of what this service says, and a
/// log a person has to go looking for is one they will not read. Binding happens before the
/// spawn, so a port already taken fails before anything else is started -- the port is the mutex
/// that keeps a second copy from writing the collection, and see spec/toolchain.md for why it
/// never falls back to another number.
pub async fn run(repository: &std::path::Path, port: u16) -> anyhow::Result<()> {
	let socket = socket_path(repository);
	std::fs::create_dir_all(socket.parent().expect("a parent")).context("could not make .local")?;
	let _ = std::fs::remove_file(&socket);

	let listener = tokio::net::TcpListener::bind(("::", port))
		.await
		.with_context(|| format!("could not bind port {port}"))?;

	let mut child = tokio::process::Command::new("node")
		.arg(repository.join("apps/local/server/main.ts"))
		.env("COLLECTION_SOCKET", &socket)
		.env("COLLECTION_REPOSITORY", repository)
		.kill_on_drop(true)
		.spawn()
		.context("could not start the collection half; is node on the path?")?;

	println!("local serving on http://localhost:{port}");
	let serving = axum::serve(listener, router(Shell { socket: socket.clone() }));
	let outcome = tokio::select! {
		served = serving => served.context("the server stopped"),
		status = child.wait() => Err(anyhow::anyhow!("the collection half exited: {status:?}")),
		_ = tokio::signal::ctrl_c() => Ok(()),
	};
	let _ = child.kill().await;
	let _ = std::fs::remove_file(&socket);
	outcome
}
