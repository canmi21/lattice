use agent::{probe, sampler::Sampler, store::Store};
use std::path::PathBuf;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

/// Where the agent keeps its hours, and whose filesystem it reports as storage.
fn directory() -> PathBuf {
	std::env::var_os("AGENT_DATA").map_or_else(|| "/data".into(), PathBuf::from)
}

fn main() -> anyhow::Result<()> {
	let directory = directory();
	let store = Store::open(&directory.join("hours.db"))?;
	let mut sampler = Sampler::new(probe::Roots::system(Some(directory)), store);
	loop {
		// On the second, so each sample is one second's worth and lands in its own.
		let since = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default();
		std::thread::sleep(Duration::from_secs(1) - Duration::from_nanos(since.subsec_nanos().into()));
		if let Err(error) = sampler.tick() {
			eprintln!("agent: {error}");
		}
	}
}
