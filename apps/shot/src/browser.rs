//! Chromium, driven over the DevTools protocol: one browser for the life of the service, and a
//! context of its own for every capture, given the proxy its ask may use and thrown away after. See
//! spec/architecture/shot.md, "One browser, a context per capture".

use crate::asked::Asked;
use crate::render::{Capture, Render};
use crate::resolve::{Reach, Resolve, destination};
use chromiumoxide::cdp::browser_protocol::emulation::SetDeviceMetricsOverrideParams;
use chromiumoxide::cdp::browser_protocol::page::{
	CaptureScreenshotFormat, CaptureScreenshotParams, Viewport,
};
use chromiumoxide::cdp::browser_protocol::target::{
	CreateBrowserContextParams, CreateTargetParams,
};
use chromiumoxide::{Browser, BrowserConfig, Page};
use futures_util::StreamExt;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::Mutex;

/// WebP's side is at most this many pixels, so a whole page is cut off here and both formats fit.
pub const TALLEST: u32 = 16_383;
/// WebP quality: past where text looks any different from the PNG, at a fraction of its size.
pub const WEBP_QUALITY: i64 = 85;
/// How long a page has to load.
const LOAD: Duration = Duration::from_secs(20);
/// How long the network must be quiet before the page is taken as settled, and the most waited.
const QUIET: Duration = Duration::from_millis(500);
const SETTLE: Duration = Duration::from_secs(5);

/// Everything that is not a page's own work, turned off; and QUIC, which would leave by UDP around
/// the proxy, and WebRTC's own UDP, for the same reason.
const FLAGS: &[&str] = &[
	"--disable-dev-shm-usage",
	"--disable-gpu",
	"--hide-scrollbars",
	"--mute-audio",
	"--no-first-run",
	"--disable-quic",
	"--force-webrtc-ip-handling-policy=disable_non_proxied_udp",
	"--disable-background-networking",
	"--disable-component-update",
	"--disable-sync",
	"--disable-default-apps",
	"--disable-features=Translate,MediaRouter,OptimizationHints,DialMediaRouteProvider",
];

/// Where the proxy for each reach listens.
#[derive(Debug, Clone, Copy)]
pub struct Proxies {
	pub public: u16,
	pub internal: u16,
}

impl Proxies {
	/// A host and port, which Chromium takes as a plain HTTP proxy.
	fn server(self, reach: Reach) -> String {
		let port = match reach {
			Reach::Public => self.public,
			Reach::Internal => self.internal,
		};
		format!("127.0.0.1:{port}")
	}
}

/// Loopback is sent to the proxy too: Chromium bypasses it for itself unless told not to.
const BYPASS: &str = "<-loopback>";

struct Running {
	browser: Arc<Browser>,
	handler: tokio::task::JoinHandle<()>,
}

pub struct Chromium<R> {
	executable: Option<PathBuf>,
	profile: PathBuf,
	proxies: Proxies,
	resolver: Arc<R>,
	running: Mutex<Option<Running>>,
}

impl<R: Resolve> Chromium<R> {
	pub fn new(
		executable: Option<PathBuf>,
		profile: PathBuf,
		proxies: Proxies,
		resolver: Arc<R>,
	) -> Self {
		Self { executable, profile, proxies, resolver, running: Mutex::new(None) }
	}

	async fn launch(&self) -> Result<Running, String> {
		let mut config = BrowserConfig::builder()
			.new_headless_mode()
			.no_sandbox()
			.user_data_dir(&self.profile)
			.launch_timeout(Duration::from_secs(30))
			.request_timeout(LOAD + SETTLE)
			// Even the default context goes through the public proxy; every capture has its own.
			.arg(format!("--proxy-server={}", self.proxies.server(Reach::Public)))
			.arg(format!("--proxy-bypass-list={BYPASS}"))
			.args(FLAGS.iter().copied());
		if let Some(executable) = &self.executable {
			config = config.chrome_executable(executable);
		}
		let config = config.build()?;
		let (browser, mut handler) =
			Browser::launch(config).await.map_err(|error| format!("Chromium did not start: {error}"))?;
		let handler = tokio::spawn(async move { while handler.next().await.is_some() {} });
		Ok(Running { browser: Arc::new(browser), handler })
	}

	/// The browser, started again if it has gone. The lock is held only to look, so two captures
	/// share one browser at once.
	async fn browser(&self) -> Result<Arc<Browser>, String> {
		let mut running = self.running.lock().await;
		match running.as_ref() {
			Some(alive) if !alive.handler.is_finished() => Ok(alive.browser.clone()),
			_ => {
				eprintln!("shot: starting Chromium");
				let started = self.launch().await?;
				let browser = started.browser.clone();
				*running = Some(started);
				Ok(browser)
			}
		}
	}

	/// Start the browser now, so the first capture does not wait on it.
	pub async fn warm(&self) -> Result<(), String> {
		self.browser().await.map(|_| ())
	}
}

/// What the browser said went wrong, as the net error it names when it names one.
fn why(error: impl std::fmt::Display) -> String {
	let said = error.to_string();
	said
		.split(|c: char| c.is_whitespace() || c == '"' || c == '\'')
		.find(|word| word.starts_with("net::ERR_"))
		.map_or(said.clone(), str::to_owned)
}

async fn settle(page: &Page) {
	let started = Instant::now();
	let _ = page.evaluate("document.fonts.ready.then(() => true)").await;
	let mut seen = -1i64;
	while started.elapsed() < SETTLE {
		let loaded: i64 = page
			.evaluate("performance.getEntriesByType('resource').length")
			.await
			.ok()
			.and_then(|result| result.into_value().ok())
			.unwrap_or(0);
		if loaded == seen {
			return;
		}
		seen = loaded;
		tokio::time::sleep(QUIET).await;
	}
}

async fn shoot(page: &Page, asked: &Asked) -> Result<Capture, String> {
	let mut height = asked.height;
	if asked.full {
		let tall: f64 = page
			.evaluate("Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0)")
			.await
			.ok()
			.and_then(|result| result.into_value().ok())
			.unwrap_or(f64::from(asked.height));
		height = (tall.ceil() as u32).clamp(asked.height, TALLEST);
		page
			.execute(SetDeviceMetricsOverrideParams::new(
				i64::from(asked.width),
				i64::from(height),
				1.,
				false,
			))
			.await
			.map_err(why)?;
	}
	let clip =
		Viewport { x: 0., y: 0., width: f64::from(asked.width), height: f64::from(height), scale: 1. };
	let take = |format: CaptureScreenshotFormat, quality: Option<i64>| CaptureScreenshotParams {
		format: Some(format),
		quality,
		clip: Some(clip.clone()),
		capture_beyond_viewport: Some(asked.full),
		..Default::default()
	};
	let decode = |data: &str| {
		use base64::Engine;
		base64::engine::general_purpose::STANDARD.decode(data).map_err(|error| error.to_string())
	};
	let png = page.execute(take(CaptureScreenshotFormat::Png, None)).await.map_err(why)?;
	let webp =
		page.execute(take(CaptureScreenshotFormat::Webp, Some(WEBP_QUALITY))).await.map_err(why)?;
	let png = decode(png.result.data.as_ref())?;
	let webp = decode(webp.result.data.as_ref())?;
	Ok(Capture { png, webp: Some(webp) })
}

impl<R: Resolve> Render for Chromium<R> {
	async fn capture(&self, asked: &Asked) -> Result<Capture, String> {
		let reach = if asked.internal { Reach::Internal } else { Reach::Public };
		// Judged here as well as at the proxy, so a refusal says why rather than a tunnel failing.
		destination(&*self.resolver, asked.url.host_str().unwrap_or_default(), reach).await?;

		let browser = self.browser().await?;
		let context = CreateBrowserContextParams {
			dispose_on_detach: Some(true),
			proxy_server: Some(self.proxies.server(reach)),
			proxy_bypass_list: Some(BYPASS.to_owned()),
			..Default::default()
		};
		let context = browser.create_browser_context(context).await.map_err(why)?;
		let target = CreateTargetParams {
			browser_context_id: Some(context.clone()),
			..CreateTargetParams::new("about:blank")
		};
		let page = browser.new_page(target).await.map_err(why);
		let captured = match page {
			Ok(page) => {
				let captured = async {
					page
						.execute(SetDeviceMetricsOverrideParams::new(
							i64::from(asked.width),
							i64::from(asked.height),
							1.,
							false,
						))
						.await
						.map_err(why)?;
					tokio::time::timeout(LOAD, page.goto(asked.url.as_str()))
						.await
						.map_err(|_| format!("The page did not load in {} seconds", LOAD.as_secs()))?
						.map_err(why)?;
					settle(&page).await;
					shoot(&page, asked).await
				}
				.await;
				let _ = page.close().await;
				captured
			}
			Err(error) => Err(error),
		};
		let _ = browser.dispose_browser_context(context).await;
		captured
	}
}
