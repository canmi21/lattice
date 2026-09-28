//! agent: what the machine is doing, sampled every second from /proc and /sys and kept for host to
//! read. See spec/architecture/agent.md.

pub mod probe;
pub mod retention;
pub mod sample;
pub mod sampler;
pub mod store;
