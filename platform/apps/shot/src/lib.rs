//! shot: a web page, or an API as a browser shows it, captured as a PNG and a WebP and kept on disk
//! until the store rolls it out. See spec/architecture/shot.md.

pub mod address;
pub mod api;
pub mod asked;
pub mod browser;
pub mod certificate;
pub mod observe;
pub mod proxy;
pub mod queue;
pub mod record;
pub mod render;
pub mod resolve;
pub mod service;
pub mod store;
