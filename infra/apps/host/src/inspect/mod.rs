//! Read-only questions about the node itself, answered without becoming a command: containers,
//! networks, disk, files under an app's own directory, and the kernel's recent memory kills. See
//! spec/architecture/inspect.md.

pub mod containers;
pub mod disk;
pub mod files;
pub mod kernel;
pub mod networks;
