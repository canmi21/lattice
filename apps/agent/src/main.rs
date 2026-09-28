//! agent: what the machine is doing, sampled every second from /proc and /sys and kept for host to
//! read. See spec/architecture/agent.md.

mod probe;
mod sample;

fn main() -> anyhow::Result<()> {
	let roots = probe::Roots::system(None);
	let earlier = probe::reading(&roots);
	std::thread::sleep(std::time::Duration::from_secs(1));
	let sample = sample::between(&earlier, &probe::reading(&roots));
	println!(
		"{}",
		serde_json::to_string_pretty(
			&serde_json::json!({ "info": probe::info(&roots), "sample": sample })
		)?
	);
	Ok(())
}
