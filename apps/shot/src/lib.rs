//! shot: a web page, or an API as a browser shows it, captured as a PNG and a WebP and kept five
//! minutes. See spec/architecture/shot.md.

pub mod address;
pub mod api;
pub mod asked;
pub mod browser;
pub mod proxy;
pub mod queue;
pub mod render;
pub mod resolve;
pub mod service;
pub mod store;
