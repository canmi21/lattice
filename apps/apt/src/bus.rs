//! Starting a unit through `org.freedesktop.systemd1` on the system bus, and reading how it went.
//! See spec/architecture/apt.md, "It starts a unit through systemd's D-Bus API".

use async_trait::async_trait;
use std::collections::HashMap;
use zbus::Connection;
use zbus::zvariant::{OwnedObjectPath, OwnedValue};

/// The unit `job` `update` starts.
pub const UNIT_UPDATE: &str = "apt-nightly-update.service";
/// The unit `job` `upgrade` starts.
pub const UNIT_UPGRADE: &str = "apt-weekly-upgrade.service";

const DESTINATION: &str = "org.freedesktop.systemd1";
const MANAGER_PATH: &str = "/org/freedesktop/systemd1";
const MANAGER_INTERFACE: &str = "org.freedesktop.systemd1.Manager";
const PROPERTIES_INTERFACE: &str = "org.freedesktop.DBus.Properties";
const UNIT_INTERFACE: &str = "org.freedesktop.systemd1.Unit";
const SERVICE_INTERFACE: &str = "org.freedesktop.systemd1.Service";

/// What `status` reports and a run is followed by: `org.freedesktop.systemd1.Unit`'s
/// `ActiveState`/`SubState`, and `.Service`'s `Result`/`ExecMainStartTimestamp`/
/// `ExecMainExitTimestamp`/`ExecMainStatus`.
#[derive(Debug, Clone, Default, PartialEq, serde::Serialize)]
pub struct Properties {
	pub active_state: String,
	pub sub_state: String,
	pub result: String,
	/// Microseconds since the epoch, `CLOCK_REALTIME`; 0 before the unit has ever run.
	pub exec_main_start_timestamp: u64,
	pub exec_main_exit_timestamp: u64,
	pub exec_main_status: i32,
}

impl Properties {
	/// Not settled: anything but `ActiveState` "inactive" or "failed" -- a oneshot unit like ours
	/// passes through "activating" on the way, but this holds for any unit's shape.
	pub fn running(&self) -> bool {
		!matches!(self.active_state.as_str(), "inactive" | "failed")
	}
}

/// What the routes and the run-following logic in `run.rs` need from systemd, behind a trait so
/// both are testable without a bus.
#[async_trait]
pub trait Bus: Send + Sync {
	async fn start(&self, unit: &str) -> anyhow::Result<()>;
	async fn properties(&self, unit: &str) -> anyhow::Result<Properties>;
}

/// The real bus, over the machine's system bus socket -- the one thing host mounts in. See
/// spec/architecture/apt.md, "The door".
pub struct SystemBus {
	connection: Connection,
}

impl SystemBus {
	pub async fn connect() -> anyhow::Result<Self> {
		Ok(Self { connection: Connection::system().await? })
	}

	/// `LoadUnit` rather than `GetUnit`: it loads the unit's properties into memory without
	/// starting it, which a `status` read must not do.
	async fn unit_path(&self, unit: &str) -> anyhow::Result<OwnedObjectPath> {
		let reply = self
			.connection
			.call_method(
				Some(DESTINATION),
				MANAGER_PATH,
				Some(MANAGER_INTERFACE),
				"LoadUnit",
				&(unit,),
			)
			.await?;
		let (path,): (OwnedObjectPath,) = reply.body().deserialize()?;
		Ok(path)
	}

	async fn get_all(&self, path: &str, interface: &str) -> anyhow::Result<HashMap<String, OwnedValue>> {
		let reply = self
			.connection
			.call_method(Some(DESTINATION), path, Some(PROPERTIES_INTERFACE), "GetAll", &(interface,))
			.await?;
		Ok(reply.body().deserialize()?)
	}
}

#[async_trait]
impl Bus for SystemBus {
	async fn start(&self, unit: &str) -> anyhow::Result<()> {
		self.connection
			.call_method(
				Some(DESTINATION),
				MANAGER_PATH,
				Some(MANAGER_INTERFACE),
				"StartUnit",
				&(unit, "replace"),
			)
			.await?;
		Ok(())
	}

	async fn properties(&self, unit: &str) -> anyhow::Result<Properties> {
		let path = self.unit_path(unit).await?;
		let unit_props = self.get_all(path.as_str(), UNIT_INTERFACE).await?;
		let service_props = self.get_all(path.as_str(), SERVICE_INTERFACE).await?;
		Ok(Properties {
			active_state: string_of(&unit_props, "ActiveState")?,
			sub_state: string_of(&unit_props, "SubState")?,
			result: string_of(&service_props, "Result").unwrap_or_default(),
			exec_main_start_timestamp: u64_of(&service_props, "ExecMainStartTimestamp").unwrap_or(0),
			exec_main_exit_timestamp: u64_of(&service_props, "ExecMainExitTimestamp").unwrap_or(0),
			exec_main_status: i32_of(&service_props, "ExecMainStatus").unwrap_or(0),
		})
	}
}

fn string_of(map: &HashMap<String, OwnedValue>, key: &str) -> anyhow::Result<String> {
	map.get(key).cloned().ok_or_else(|| anyhow::anyhow!("missing {key}"))?.try_into().map_err(Into::into)
}

fn u64_of(map: &HashMap<String, OwnedValue>, key: &str) -> anyhow::Result<u64> {
	map.get(key).cloned().ok_or_else(|| anyhow::anyhow!("missing {key}"))?.try_into().map_err(Into::into)
}

fn i32_of(map: &HashMap<String, OwnedValue>, key: &str) -> anyhow::Result<i32> {
	map.get(key).cloned().ok_or_else(|| anyhow::anyhow!("missing {key}"))?.try_into().map_err(Into::into)
}

/// A bus that never touches a real one, for the routes and the run-following logic. Shared with
/// `run.rs`'s own tests through `crate::bus::tests`.
#[cfg(test)]
pub mod tests {
	use super::*;
	use std::sync::Mutex;

	/// `properties` steps through a fixed script, one entry per call, repeating the last once it
	/// runs out; `start` only records what it was asked to start.
	pub struct FakeBus {
		script: Mutex<Vec<Properties>>,
		started: Mutex<Vec<String>>,
	}

	impl FakeBus {
		pub fn new(script: Vec<Properties>) -> Self {
			assert!(!script.is_empty(), "a fake bus needs at least one answer");
			Self { script: Mutex::new(script), started: Mutex::new(Vec::new()) }
		}

		/// "activating" once, then settled and successful from then on -- a run found done the
		/// first time it is next asked about, so a test need not wait out `POLL`.
		pub fn activating_then_done() -> Self {
			Self::new(vec![
				Properties {
					active_state: "activating".into(),
					sub_state: "start".into(),
					..Default::default()
				},
				Properties {
					active_state: "inactive".into(),
					sub_state: "dead".into(),
					result: "success".into(),
					exec_main_start_timestamp: 1,
					exec_main_exit_timestamp: 2,
					exec_main_status: 0,
				},
			])
		}

		/// Always reports the unit as running, for a `409` while it already is.
		pub fn always_active() -> Self {
			Self::new(vec![Properties {
				active_state: "active".into(),
				sub_state: "running".into(),
				..Default::default()
			}])
		}

		/// Always reports the unit as settled and idle, so starting it is never refused.
		pub fn idle() -> Self {
			Self::new(vec![Properties {
				active_state: "inactive".into(),
				sub_state: "dead".into(),
				..Default::default()
			}])
		}

		/// Idle when first asked -- the pre-check a route makes before starting a unit -- then
		/// activating from then on, so the `202` this route answers with shows a job under way.
		pub fn starting() -> Self {
			Self::new(vec![
				Properties {
					active_state: "inactive".into(),
					sub_state: "dead".into(),
					..Default::default()
				},
				Properties {
					active_state: "activating".into(),
					sub_state: "start".into(),
					..Default::default()
				},
			])
		}

		pub fn started(&self) -> Vec<String> {
			self.started.lock().unwrap().clone()
		}
	}

	#[async_trait]
	impl Bus for FakeBus {
		async fn start(&self, unit: &str) -> anyhow::Result<()> {
			self.started.lock().unwrap().push(unit.to_owned());
			Ok(())
		}

		async fn properties(&self, _unit: &str) -> anyhow::Result<Properties> {
			let mut script = self.script.lock().unwrap();
			if script.len() > 1 { Ok(script.remove(0)) } else { Ok(script[0].clone()) }
		}
	}
}
