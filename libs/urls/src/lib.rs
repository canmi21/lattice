//! Generated from libs/urls/src/index.ts by `mise run urls`; do not edit.
//! One URL map for both languages -- see spec/architecture/workspace.md.

pub const APPS_DEVELOPMENT_SITE: &str = "http://localhost:26511";
pub const APPS_DEVELOPMENT_API: &str = "http://localhost:26512/v1/site";
pub const APPS_DEVELOPMENT_ALIAS: &str = "http://localhost:26512/v1/aka";
pub const APPS_DEVELOPMENT_SYMLINK: &str = "http://localhost:26512/v1/aka/symlink";
pub const APPS_DEVELOPMENT_CDN: &str = "http://localhost:26512/v3/cdn";
pub const APPS_DEVELOPMENT_PANEL: &str = "http://localhost:26519";
pub const APPS_PRODUCTION_SITE: &str = "https://canmi.net";
pub const APPS_PRODUCTION_API: &str = "https://api.monoflake.com/v1/site";
pub const APPS_PRODUCTION_ALIAS: &str = "https://ill.li";
pub const APPS_PRODUCTION_SYMLINK: &str = "https://symlink.si";
pub const APPS_PRODUCTION_CDN: &str = "https://cdn.monoflake.com";
pub const APPS_PRODUCTION_PANEL: &str = "https://infra.canmi.icu";
pub const SOURCE: &str = "https://github.com/canmi21/lattice";
pub const INTERNAL_APP: &str = "https://canmi.app";
pub const INTERNAL_INFRA: &str = "https://ffoni.com";
pub const INTERNAL_ALIAS: &str = "https://ill.li";
pub const INTERNAL_PANEL: &str = "https://infra.canmi.icu";
pub const INTERNAL_KEEPER: &str = "https://keeper.canmi.icu";
pub const INTERNAL_HOST: &str = "http://host:11011";
pub const INTERNAL_LEDGER: &str = "https://api.canmi.icu/ledger";
pub const INTERNAL_CRON: &str = "https://api.canmi.icu/cron";
pub const INTERNAL_SHOT: &str = "https://api.monoflake.com/v1/shot";
pub const INTERNAL_API_PRIVATE: &str = "https://api.canmi.icu";
pub const INTERNAL_API_PUBLIC: &str = "https://api.monoflake.com";
pub const INTERNAL_STATUS_CANONICAL: &str = "https://status.canmi.app";
pub const INTERNAL_STATUS_MIRROR: &str = "https://canmi.vercel.app";
pub const CONTACT_SECURITY: &str = "mailto:security@canmi.net";
pub const EXTERNAL_DOH_CLOUDFLARE: &str = "https://1.1.1.1/dns-query";
pub const EXTERNAL_DOH_GOOGLE: &str = "https://8.8.8.8/resolve";
pub const EXTERNAL_GITHUB_WEB: &str = "https://github.com";
pub const EXTERNAL_GITHUB_API: &str = "https://api.github.com";
pub const EXTERNAL_GITHUB_RAW: &str = "https://raw.githubusercontent.com";
pub const EXTERNAL_GITHUB_AVATARS: &str = "https://avatars.githubusercontent.com";
pub const EXTERNAL_GITHUB_CDN: &str = "https://cdn.jsdelivr.net/gh";
pub const EXTERNAL_GOOGLE_SOURCE_PREFERENCES: &str = "https://www.google.com/preferences/source";
pub const EXTERNAL_GEOLITE_CITY: &str =
	"https://github.com/P3TERX/GeoLite.mmdb/releases/latest/download/GeoLite2-City.mmdb";
pub const EXTERNAL_GEOLITE_ASN: &str =
	"https://github.com/P3TERX/GeoLite.mmdb/releases/latest/download/GeoLite2-ASN.mmdb";
pub const EXTERNAL_GEOLITE_MAXMIND: &str = "https://www.maxmind.com";
pub const EXTERNAL_REGISTRIES_NPM: &str = "https://www.npmjs.com";
pub const EXTERNAL_REGISTRIES_CARGO: &str = "https://crates.io";
pub const EXTERNAL_REGISTRIES_CARGO_INDEX: &str = "https://index.crates.io";
pub const EXTERNAL_SPDX: &str = "https://spdx.org/licenses";
pub const EXTERNAL_ROBOTSTXT: &str = "https://www.robotstxt.org/robotstxt.html";
pub const EXTERNAL_CONTENT_SIGNALS: &str = "https://contentsignals.org";
pub const EXTERNAL_CONTENT_USAGE: &str =
	"https://datatracker.ietf.org/doc/draft-ietf-aipref-attach/";
pub const EXTERNAL_AGENT_INCIDENT: &str =
	"https://openai.com/index/hugging-face-incident-and-the-road-ahead/";
pub const EXTERNAL_SENTRY_SITE: &str =
	"https://a7f2f790ed2fa4f8e0c4310d26d9c39f@o4511131162116096.ingest.us.sentry.io/4511380121976832";
pub const EXTERNAL_SENTRY_STATUS: &str =
	"https://0c9dd7de9a89dddc79dbdc2252e1c940@o4511131162116096.ingest.us.sentry.io/4512173650542592";
pub const EXTERNAL_FEEDSMITH: &str = "https://feedsmith.dev";
pub const EXTERNAL_INDEXNOW: &str = "https://api.indexnow.org/IndexNow";
pub const EXTERNAL_SOCIAL_TELEGRAM: &str = "https://t.me";
pub const EXTERNAL_SOCIAL_TWITTER: &str = "https://twitter.com";
pub const EXTERNAL_SOCIAL_TWITTER_INTENT: &str = "https://twitter.com/intent/follow";
pub const EXTERNAL_SOCIAL_FEDIVERSE: &str = "https://nya.one";
pub const EXTERNAL_SOCIAL_BLUESKY: &str = "https://bsky.app/profile";
pub const EXTERNAL_RUST_DOCS: &str = "https://docs.rs";
pub const EXTERNAL_RUST_LIB: &str = "https://lib.rs";
pub const EXTERNAL_WEBRING_TRAVELLINGS: &str = "https://www.travellings.cn/go.html";
pub const EXTERNAL_WEBRING_MOE: &str = "https://travel.moe/go?travel=on";
pub const EXTERNAL_ICPMOE: &str = "https://icp.gov.moe";
pub const EXTERNAL_UMAMI: &str = "https://cloud.umami.is/script.js";
pub const EXTERNAL_UMAMI_GATEWAY: &str = "https://gateway.umami.is";
pub const EXTERNAL_OPENPANEL: &str = "https://api.openpanel.dev";
pub const EXTERNAL_GOOGLE_FONTS_CSS: &str = "https://fonts.googleapis.com";
pub const EXTERNAL_GOOGLE_FONTS_STATIC: &str = "https://fonts.gstatic.com";

/// Every hostname the gateway answers at home.
#[rustfmt::skip]
pub const GATEWAY_HOSTS: [&str; 5] = ["*.monoflake.com", "*.monoflake.net", "*.ixc.one", "ill.li", "symlink.si"];
