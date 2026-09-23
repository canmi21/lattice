//! Content management operations shared by the command-line and desktop adapters.
//! See spec/architecture/local.md.

mod alt;
mod captions;
mod check;
mod classify;
mod clip;
mod diagram;
mod embed;
mod extension;
pub mod favicon;
mod frames;
pub mod gc;
mod i18n;
pub mod image;
mod licenses;
mod locale;
mod media;
mod migrate;
mod opengraph;
pub mod paths;
mod port;
mod refs;
pub mod resource;
mod serve;
mod summary;
mod tags;
pub mod twitter;
pub mod urls;
pub mod video;
mod words;

pub mod articles;
pub mod cli;
pub mod derived;
pub mod document;
pub mod overview;
pub mod segments;
pub mod task;
