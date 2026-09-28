//! host's HTTP surface. One token admits everything but `/health`, on the LAN as much as through
//! the tunnel -- see spec/architecture/host.md, "One token, behind two doors".

use crate::Host;
use crate::environment;
use crate::panel;
use crate::rollout::{self, Error as DeployError};
use crate::store::{Action, Deployed, Route, Source};
use axum::extract::{DefaultBodyLimit, Multipart, Path, Query, Request, State};
use axum::http::{StatusCode, header};
use axum::middleware::{self, Next};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post, put};
use axum::{Json, Router};
use deploy::Manifest;
use deploy::manifest;
use deploy::replace::Error as Failed;
use serde::Deserialize;
use std::sync::Arc;
use tokio::io::AsyncWriteExt;

pub fn router(host: Arc<Host>) -> Router {
	let guarded = Router::new()
		.route("/apps", get(apps))
		.route("/apps/{name}", get(app).post(upload).layer(DefaultBodyLimit::disable()))
		.route("/apps/{name}/history", get(history))
		.route("/apps/{name}/redeploy", post(redeploy))
		.route("/apps/{name}/rollback", post(rollback))
		.route("/apps/{name}/start", post(start))
		.route("/apps/{name}/stop", post(stop))
		.route("/apps/{name}/restart", post(restart))
		.route("/apps/{name}/logs", get(logs))
		.route("/apps/{name}/logs/archive", get(archived))
		.route("/apps/{name}/logs/archive/{file}", get(archived_file))
		.route("/apps/{name}/environment", get(environment))
		.route("/apps/{name}/environment/{kind}/{key}", put(set_variable).delete(unset_variable))
		.route("/routes", get(routes))
		.route("/routes/{name}", put(put_route).delete(delete_route))
		.route("/caddy", get(caddy).post(reapply))
		.layer(middleware::from_fn_with_state(host.clone(), admit));
	Router::new()
		.route("/health", get(health))
		.route("/notice", post(notice))
		.route("/session", post(sign_in).delete(sign_out))
		.route("/", get(panel::index))
		.route(&format!("/{}/{{*path}}", panel::IMMUTABLE), get(panel::immutable))
		.fallback(|| async { response::failure(StatusCode::NOT_FOUND, "no_such_route") })
		.merge(guarded)
		.with_state(host)
}

/// What keeper asks before it lets a new host stay: that it reads its own state and reaches
/// Docker, which are what every other request needs. Open, since it says nothing about either.
async fn health(State(host): State<Arc<Host>>) -> Response {
	if host.store.apps().is_err() {
		return response::failure(StatusCode::SERVICE_UNAVAILABLE, "store_unavailable");
	}
	if host.engine.ping().await.is_err() {
		return response::failure(StatusCode::SERVICE_UNAVAILABLE, "docker_unavailable");
	}
	response::success(StatusCode::OK, ())
}

#[derive(Deserialize)]
struct Notice {
	run: u64,
	/// Set by keeper when it passes a run on, having dealt with the host that run built. Also read
	/// under the name a keeper built before the rename sends.
	#[serde(default, alias = "host_done")]
	host_replaced: bool,
}

/// A CI run has finished. Open, since it can only ask host to look: the run is checked against
/// GitHub before anything is fetched. See spec/architecture/host.md, "The machine pulls; nothing
/// pushes into it". Each run is taken once, and again only if taking it failed.
async fn notice(State(host): State<Arc<Host>>, Json(notice): Json<Notice>) -> Response {
	if host.github.is_none() {
		return response::failure(StatusCode::SERVICE_UNAVAILABLE, "github_unavailable");
	}
	let fresh =
		host.notices.lock().unwrap_or_else(std::sync::PoisonError::into_inner).insert(notice.run);
	if !fresh {
		return response::success(StatusCode::OK, serde_json::json!({ "run": notice.run }));
	}
	let taker = host.clone();
	tokio::spawn(async move {
		if !rollout::from_run(taker.clone(), notice.run, notice.host_replaced).await {
			let mut notices = taker.notices.lock().unwrap_or_else(std::sync::PoisonError::into_inner);
			notices.remove(&notice.run);
		}
	});
	response::success(StatusCode::ACCEPTED, serde_json::json!({ "run": notice.run }))
}

/// Compared in time independent of where the first difference is.
fn same(given: &[u8], expected: &[u8]) -> bool {
	given.len() == expected.len()
		&& given.iter().zip(expected).fold(0, |acc, (a, b)| acc | (a ^ b)) == 0
}

/// The cookie the panel's session is: the token itself, out of a script's reach. See
/// spec/architecture/host.md, "The panel signs in with the token, once".
const SESSION: &str = "host_token";
/// Thirty days, after which the panel asks again.
const SESSION_SECONDS: u32 = 30 * 24 * 60 * 60;

/// The token a request carries: its `Authorization` header, or the panel's cookie.
fn carried(headers: &header::HeaderMap) -> &str {
	let bearer = headers
		.get(header::AUTHORIZATION)
		.and_then(|value| value.to_str().ok())
		.and_then(|value| value.strip_prefix("Bearer "));
	let cookie = || {
		headers
			.get_all(header::COOKIE)
			.iter()
			.filter_map(|value| value.to_str().ok())
			.flat_map(|value| value.split(';'))
			.filter_map(|pair| pair.trim().split_once('='))
			.find(|(name, _)| *name == SESSION)
			.map(|(_, value)| value)
	};
	bearer.or_else(cookie).unwrap_or_default()
}

#[derive(Deserialize)]
struct SignIn {
	token: String,
}

/// Sign the panel in: the token checked once, then kept as a cookie the browser sends and no
/// script reads.
async fn sign_in(State(host): State<Arc<Host>>, Json(asked): Json<SignIn>) -> Response {
	if !same(asked.token.as_bytes(), host.config.token.as_bytes()) {
		return response::failure(StatusCode::UNAUTHORIZED, "invalid_token");
	}
	let cookie = format!(
		"{SESSION}={}; Path=/; Max-Age={SESSION_SECONDS}; HttpOnly; Secure; SameSite=Strict",
		asked.token
	);
	([(header::SET_COOKIE, cookie)], response::success(StatusCode::OK, ())).into_response()
}

async fn sign_out() -> Response {
	let cookie = format!("{SESSION}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict");
	([(header::SET_COOKIE, cookie)], response::success(StatusCode::OK, ())).into_response()
}

async fn admit(State(host): State<Arc<Host>>, request: Request, next: Next) -> Response {
	let given = carried(request.headers());
	if !same(given.as_bytes(), host.config.token.as_bytes()) {
		return response::failure(StatusCode::UNAUTHORIZED, "invalid_token");
	}
	next.run(request).await
}

/// host is reached from the LAN and the tailnet alone, so a refusal may say exactly what went
/// wrong; see spec/architecture/services.md, "Every answer is one envelope".
fn failed(status: StatusCode, code: &str, error: impl ToString) -> Response {
	response::failure_with(status, code, error)
}

fn stored<T: serde::Serialize>(read: Result<T, impl ToString>) -> Response {
	match read {
		Ok(value) => response::success(StatusCode::OK, value),
		Err(error) => failed(StatusCode::INTERNAL_SERVER_ERROR, "store_unavailable", error),
	}
}

/// An app as the panel shows it: what the store holds, and what only Docker and the snapshots know.
#[derive(serde::Serialize)]
struct Shown {
	#[serde(flatten)]
	app: Deployed,
	running: bool,
	/// Whether a rollback with data can be offered.
	restorable: bool,
}

async fn shown(host: &Host, app: Deployed) -> Shown {
	let running = host.engine.running(&app.manifest.name).await.unwrap_or(false);
	let restorable = rollout::restorable(host, &app).ok().flatten().is_some();
	Shown { app, running, restorable }
}

async fn apps(State(host): State<Arc<Host>>) -> Response {
	let apps = match host.store.apps() {
		Ok(apps) => apps,
		Err(error) => return failed(StatusCode::INTERNAL_SERVER_ERROR, "store_unavailable", error),
	};
	let mut all = Vec::with_capacity(apps.len());
	for app in apps {
		all.push(shown(&host, app).await);
	}
	response::success(StatusCode::OK, all)
}

async fn app(State(host): State<Arc<Host>>, Path(name): Path<String>) -> Response {
	match host.store.app(&name) {
		Ok(Some(app)) => response::success(StatusCode::OK, shown(&host, app).await),
		Ok(None) => response::failure(StatusCode::NOT_FOUND, "no_such_app"),
		Err(error) => failed(StatusCode::INTERNAL_SERVER_ERROR, "store_unavailable", error),
	}
}

#[derive(Deserialize)]
struct Page {
	before: Option<i64>,
	limit: Option<u32>,
}

/// How many events a page holds when the panel names no number, and the most it may ask for.
const EVENTS: u32 = 50;
const MOST_EVENTS: u32 = 500;

/// An app's events, the newest first, a page at a time: the next page is the one `before` the
/// last id of this one.
async fn history(
	State(host): State<Arc<Host>>,
	Path(name): Path<String>,
	Query(page): Query<Page>,
) -> Response {
	let limit = page.limit.unwrap_or(EVENTS).clamp(1, MOST_EVENTS);
	stored(host.store.events(Some(&name), page.before, limit))
}

/// A panel action's refusal, by what went wrong.
fn refused(error: DeployError) -> Response {
	let (status, code) = match &error {
		DeployError::Itself => (StatusCode::FORBIDDEN, "invalid_target"),
		DeployError::NoSuchApp(_) => (StatusCode::NOT_FOUND, "no_such_app"),
		DeployError::NoPrevious(_) => (StatusCode::CONFLICT, "no_such_version"),
		DeployError::NoSnapshot(_) => (StatusCode::CONFLICT, "no_such_snapshot"),
		DeployError::Replace(Failed::Unhealthy { .. } | Failed::FirstFailed { .. }) => {
			(StatusCode::BAD_GATEWAY, "app_unavailable")
		}
		DeployError::Engine(_) | DeployError::Replace(_) => {
			(StatusCode::BAD_GATEWAY, "docker_unavailable")
		}
		DeployError::Store(_) => (StatusCode::INTERNAL_SERVER_ERROR, "store_unavailable"),
		_ => (StatusCode::INTERNAL_SERVER_ERROR, "service_unavailable"),
	};
	failed(status, code, error)
}

fn done(result: Result<impl serde::Serialize, DeployError>) -> Response {
	match result {
		Ok(value) => response::success(StatusCode::OK, value),
		Err(error) => refused(error),
	}
}

async fn redeploy(State(host): State<Arc<Host>>, Path(name): Path<String>) -> Response {
	done(rollout::redeploy(&host, &name).await)
}

#[derive(Deserialize)]
struct Rollback {
	#[serde(default)]
	with_data: bool,
}

async fn rollback(
	State(host): State<Arc<Host>>,
	Path(name): Path<String>,
	Json(asked): Json<Rollback>,
) -> Response {
	done(rollout::rollback(&host, &name, asked.with_data).await)
}

async fn start(State(host): State<Arc<Host>>, Path(name): Path<String>) -> Response {
	done(rollout::act(&host, &name, Action::Start).await)
}

async fn stop(State(host): State<Arc<Host>>, Path(name): Path<String>) -> Response {
	done(rollout::act(&host, &name, Action::Stop).await)
}

async fn restart(State(host): State<Arc<Host>>, Path(name): Path<String>) -> Response {
	done(rollout::act(&host, &name, Action::Restart).await)
}

/// A deploy: the declaration as the part `service`, then the image archive as the part `image`.
/// The archive is written to disk before anything is stopped, so a transfer cut short never
/// leaves the app down.
async fn upload(
	State(host): State<Arc<Host>>,
	Path(name): Path<String>,
	mut parts: Multipart,
) -> Response {
	if let Err(error) = rollout::deployable(&name) {
		return failed(StatusCode::UNPROCESSABLE_ENTITY, "invalid_name", error);
	}
	let mut declared: Option<Manifest> = None;
	let archive = deploy::arrival(&host.config.incoming);
	let mut received = false;
	loop {
		let part = match parts.next_field().await {
			Ok(Some(part)) => part,
			Ok(None) => break,
			Err(error) => return failed(StatusCode::BAD_REQUEST, "invalid_upload", error),
		};
		match part.name() {
			Some("service") => {
				let text = match part.text().await {
					Ok(text) => text,
					Err(error) => return failed(StatusCode::BAD_REQUEST, "invalid_upload", error),
				};
				match Manifest::parse(&text) {
					Ok(manifest) => declared = Some(manifest),
					Err(error) => {
						return failed(StatusCode::UNPROCESSABLE_ENTITY, "invalid_declaration", error);
					}
				}
			}
			Some("image") => {
				if let Err(error) = save(&archive, part).await {
					return failed(StatusCode::BAD_REQUEST, "invalid_upload", error);
				}
				received = true;
			}
			_ => {}
		}
	}
	let Some(manifest) = declared else {
		return failed(StatusCode::BAD_REQUEST, "invalid_upload", "No service part");
	};
	if !received {
		return failed(StatusCode::BAD_REQUEST, "invalid_upload", "No image part");
	}
	match rollout::from_archive(&host, &name, manifest, &archive, &Source::upload()).await {
		Ok(outcome) => response::success(StatusCode::OK, outcome),
		Err(error @ DeployError::Invalid(_)) => {
			failed(StatusCode::UNPROCESSABLE_ENTITY, "invalid_declaration", error)
		}
		Err(error @ DeployError::PortTaken { .. }) => {
			failed(StatusCode::CONFLICT, "invalid_port", error)
		}
		Err(error @ DeployError::Load(_)) => {
			failed(StatusCode::UNPROCESSABLE_ENTITY, "invalid_image", error)
		}
		Err(error @ DeployError::Replace(Failed::Unhealthy { .. } | Failed::FirstFailed { .. })) => {
			failed(StatusCode::BAD_GATEWAY, "app_unavailable", error)
		}
		Err(error) => failed(StatusCode::INTERNAL_SERVER_ERROR, "service_unavailable", error),
	}
}

async fn save(
	path: &std::path::Path,
	mut part: axum::extract::multipart::Field<'_>,
) -> anyhow::Result<()> {
	if let Some(parent) = path.parent() {
		tokio::fs::create_dir_all(parent).await?;
	}
	let mut file = tokio::fs::File::create(path).await?;
	while let Some(chunk) = part.chunk().await? {
		file.write_all(&chunk).await?;
	}
	file.flush().await?;
	Ok(())
}

#[derive(Deserialize)]
struct Lines {
	lines: Option<u32>,
}

/// How many of the running container's lines are sent when the panel names no number, and the
/// most it may ask for; older lines are in the archive.
const LINES: u32 = 500;
const MOST_LINES: u32 = 10_000;

async fn logs(
	State(host): State<Arc<Host>>,
	Path(name): Path<String>,
	Query(asked): Query<Lines>,
) -> Response {
	if let Err(refused) = known(&host, &name) {
		return refused;
	}
	let count = asked.lines.unwrap_or(LINES).clamp(1, MOST_LINES);
	match host.engine.lines(&name, count).await {
		Ok(lines) => response::success(StatusCode::OK, serde_json::json!({ "lines": lines })),
		Err(error) => failed(StatusCode::BAD_GATEWAY, "docker_unavailable", error),
	}
}

#[derive(serde::Serialize)]
struct Archived {
	file: String,
	bytes: u64,
}

/// Every archived log of the app, the newest first.
async fn archived(State(host): State<Arc<Host>>, Path(name): Path<String>) -> Response {
	if let Err(refused) = known(&host, &name) {
		return refused;
	}
	let directory = host.volumes.logs(&name);
	let mut files = Vec::new();
	if let Ok(mut entries) = tokio::fs::read_dir(&directory).await {
		while let Ok(Some(entry)) = entries.next_entry().await {
			let file = entry.file_name().to_string_lossy().into_owned();
			let bytes = entry.metadata().await.map(|meta| meta.len()).unwrap_or_default();
			if archive_name(&file) {
				files.push(Archived { file, bytes });
			}
		}
	}
	files.sort_by(|a, b| b.file.cmp(&a.file));
	response::success(StatusCode::OK, files)
}

/// One archived log, as the text it is.
async fn archived_file(
	State(host): State<Arc<Host>>,
	Path((name, file)): Path<(String, String)>,
) -> Response {
	if let Err(refused) = known(&host, &name) {
		return refused;
	}
	if !archive_name(&file) {
		return response::failure(StatusCode::NOT_FOUND, "no_such_object");
	}
	match tokio::fs::read(host.volumes.logs(&name).join(&file)).await {
		Ok(bytes) => ([(header::CONTENT_TYPE, "text/plain; charset=utf-8")], bytes).into_response(),
		Err(_) => response::failure(StatusCode::NOT_FOUND, "no_such_object"),
	}
}

/// A name `Engine::archive` gives, and so one that cannot reach outside the app's directory.
fn archive_name(file: &str) -> bool {
	file.ends_with(".log")
		&& file.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'.')
		&& !file.starts_with('.')
}

/// The app's environment as the panel may see it: configuration in full, secrets by name.
async fn environment(State(host): State<Arc<Host>>, Path(name): Path<String>) -> Response {
	if let Err(refused) = known(&host, &name) {
		return refused;
	}
	match environment::shown(&host.volumes.root(&name)) {
		Ok(shown) => response::success(StatusCode::OK, shown),
		Err(error) => failed(StatusCode::INTERNAL_SERVER_ERROR, "store_unavailable", error),
	}
}

#[derive(Deserialize)]
struct Variable {
	value: String,
}

async fn set_variable(
	State(host): State<Arc<Host>>,
	Path((name, kind, key)): Path<(String, String, String)>,
	Json(variable): Json<Variable>,
) -> Response {
	change_variable(&host, &name, &kind, &key, Some(&variable.value))
}

async fn unset_variable(
	State(host): State<Arc<Host>>,
	Path((name, kind, key)): Path<(String, String, String)>,
) -> Response {
	change_variable(&host, &name, &kind, &key, None)
}

/// A change is written now and applies when the container is next started from its version; the
/// answer says whether anything changed, for the panel to offer that.
fn change_variable(
	host: &Host,
	name: &str,
	kind: &str,
	key: &str,
	value: Option<&str>,
) -> Response {
	if let Err(refused) = known(host, name) {
		return refused;
	}
	let Some(kind) = environment::Kind::from_segment(kind) else {
		return response::failure(StatusCode::NOT_FOUND, "no_such_route");
	};
	match environment::set(&host.volumes.root(name), kind, key, value) {
		Ok(changed) => response::success(StatusCode::OK, serde_json::json!({ "changed": changed })),
		Err(error @ (environment::Error::Name(_) | environment::Error::Value)) => {
			failed(StatusCode::UNPROCESSABLE_ENTITY, "invalid_variable", error)
		}
		Err(error) => failed(StatusCode::INTERNAL_SERVER_ERROR, "store_unavailable", error),
	}
}

/// An app host runs, or the refusal to answer for one it does not.
fn known(host: &Host, name: &str) -> Result<(), Response> {
	match host.store.app(name) {
		Ok(Some(_)) => Ok(()),
		Ok(None) => Err(response::failure(StatusCode::NOT_FOUND, "no_such_app")),
		Err(error) => Err(failed(StatusCode::INTERNAL_SERVER_ERROR, "store_unavailable", error)),
	}
}

async fn routes(State(host): State<Arc<Host>>) -> Response {
	stored(host.store.routes())
}

#[derive(Deserialize)]
struct RouteBody {
	upstream: String,
	private: bool,
	public: bool,
	#[serde(default)]
	home: Option<String>,
}

async fn put_route(
	State(host): State<Arc<Host>>,
	Path(name): Path<String>,
	Json(body): Json<RouteBody>,
) -> Response {
	if let Err(error) = manifest::check_name(&name) {
		return failed(StatusCode::UNPROCESSABLE_ENTITY, "invalid_name", error);
	}
	if body.home.as_deref().is_some_and(|home| !is_home(home)) {
		return response::failure(StatusCode::UNPROCESSABLE_ENTITY, "invalid_home");
	}
	let route = Route {
		name,
		upstream: body.upstream,
		private: body.private,
		public: body.public,
		home: body.home,
	};
	if let Err(error) = host.store.put_route(&route) {
		return failed(StatusCode::CONFLICT, "invalid_route", error);
	}
	routed(&host).await
}

async fn delete_route(State(host): State<Arc<Host>>, Path(name): Path<String>) -> Response {
	match host.store.delete_route(&name) {
		Ok(true) => routed(&host).await,
		Ok(false) => failed(StatusCode::NOT_FOUND, "no_such_route", "No route has this name"),
		Err(error) => failed(StatusCode::INTERNAL_SERVER_ERROR, "store_unavailable", error),
	}
}

/// Whether `home` stays on the name it is set for. `/` would send the root to itself forever; `//`
/// and `/\` are read by a browser as another site entirely, which would make the name an open
/// redirect; and a control character has no business in the `Location` it becomes.
fn is_home(home: &str) -> bool {
	home.starts_with('/')
		&& home != "/"
		&& !home.starts_with("//")
		&& !home.starts_with("/\\")
		&& !home.chars().any(char::is_control)
}

/// What Caddy would be given now, without giving it. What to read before switching Caddy over.
async fn caddy(State(host): State<Arc<Host>>) -> Response {
	match rollout::render(&host) {
		Ok(rendered) => response::success(StatusCode::OK, rendered),
		Err(error) => failed(StatusCode::INTERNAL_SERVER_ERROR, "store_unavailable", error),
	}
}

async fn reapply(State(host): State<Arc<Host>>) -> Response {
	if let Err(error) = rollout::attach(&host).await {
		return failed(StatusCode::INTERNAL_SERVER_ERROR, "docker_unavailable", error);
	}
	routed(&host).await
}

/// The state changed; Caddy follows. Stored even when Caddy cannot be reached, so the answer says
/// which half happened.
async fn routed(host: &Host) -> Response {
	match rollout::route(host).await {
		Ok(()) => StatusCode::NO_CONTENT.into_response(),
		Err(error) => {
			let message = format!("Stored, but Caddy was not updated: {error}");
			failed(StatusCode::BAD_GATEWAY, "caddy_unavailable", message)
		}
	}
}

#[cfg(test)]
mod tests {
	#[test]
	fn a_home_stays_on_its_own_site() {
		assert!(super::is_home("/admin"));
		assert!(super::is_home("/admin/"));
		assert!(!super::is_home("/"));
		assert!(!super::is_home("admin"));
		assert!(!super::is_home("//evil.example"));
		assert!(!super::is_home("/\\evil.example"));
		assert!(!super::is_home("/admin\r\nSet-Cookie: x=1"));
	}

	#[test]
	fn a_token_matches_only_itself() {
		assert!(super::same(b"secret", b"secret"));
		assert!(!super::same(b"secreT", b"secret"));
		assert!(!super::same(b"secret-and-more", b"secret"));
		assert!(!super::same(b"", b"secret"));
	}

	#[test]
	fn the_token_comes_from_the_header_or_the_panels_cookie() {
		use axum::http::{HeaderMap, HeaderValue, header};
		let mut headers = HeaderMap::new();
		assert_eq!(super::carried(&headers), "");
		headers.insert(header::COOKIE, HeaderValue::from_static("theme=dark; host_token=abc; x=1"));
		assert_eq!(super::carried(&headers), "abc");
		headers.insert(header::AUTHORIZATION, HeaderValue::from_static("Bearer xyz"));
		assert_eq!(super::carried(&headers), "xyz");
		let mut other = HeaderMap::new();
		other.insert(header::COOKIE, HeaderValue::from_static("not_host_token=abc"));
		assert_eq!(super::carried(&other), "");
	}

	#[test]
	fn an_archived_log_is_named_only_as_the_engine_names_one() {
		assert!(super::archive_name("20260928T051000Z-1b10fb0cc52f.log"));
		for outside in ["../apps/host/.env", "x/../y.log", ".log", "a.env", "a b.log", "..log"] {
			assert!(!super::archive_name(outside), "{outside}");
		}
	}

	#[test]
	fn every_code_it_answers_with_is_in_the_catalogue() {
		for code in response::codes_named(include_str!("api.rs")) {
			assert!(response::message_of(code).is_some(), "`{code}` is not in libs/response/codes.json");
		}
	}
}
