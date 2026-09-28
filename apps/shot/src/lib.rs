//! shot: a web page, or an API as a browser shows it, captured as a PNG and a WebP and kept five
//! minutes. See spec/architecture/shot.md.

pub mod api;
pub mod asked;
pub mod queue;
pub mod render;
pub mod service;
pub mod store;
