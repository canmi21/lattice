use super::report::*;
use super::shape::*;
use super::*;
use bollard::models::{
	ContainerInspectResponse, ContainerSummary, EndpointSettings, HostConfig, NetworkInspect,
};
use std::collections::HashMap;
use std::path::{Path, PathBuf};

#[test]
fn shapes_a_container_from_what_list_and_inspect_each_report() {
	use bollard::models::{
		ContainerState, ContainerStateStatusEnum, ContainerSummaryNetworkSettings, MountPoint,
	};
	let summary = ContainerSummary {
		id: Some("abcdef0123456789".into()),
		names: Some(vec!["/geo".into()]),
		image: Some("host/geo:0f939c217676".into()),
		status: Some("Up 3 hours".into()),
		network_settings: Some(ContainerSummaryNetworkSettings {
			networks: Some(HashMap::from([(
				"app-geo".into(),
				EndpointSettings { ip_address: Some("10.0.0.5".into()), ..Default::default() },
			)])),
		}),
		mounts: Some(vec![MountPoint {
			typ: Some("bind".into()),
			source: Some("/data/apps/geo".into()),
			destination: Some("/data".into()),
			rw: Some(false),
			..Default::default()
		}]),
		..Default::default()
	};
	let inspected = ContainerInspectResponse {
		state: Some(ContainerState {
			status: Some(ContainerStateStatusEnum::RUNNING),
			started_at: Some("2026-09-28T00:00:00Z".into()),
			oom_killed: Some(true),
			..Default::default()
		}),
		restart_count: Some(2),
		host_config: Some(HostConfig { memory: Some(512 * 1024 * 1024), ..Default::default() }),
		..Default::default()
	};
	let info = container_info(summary, inspected);
	assert_eq!(info.name, "geo");
	assert_eq!(info.id, "abcdef012345");
	assert_eq!(info.image, "host/geo:0f939c217676");
	assert_eq!(info.state, "running");
	assert_eq!(info.status, "Up 3 hours");
	assert_eq!(info.started_at, Some("2026-09-28T00:00:00Z".into()));
	assert_eq!(info.restart_count, 2);
	assert!(info.oom_killed);
	assert_eq!(info.memory_limit, Some(512 * 1024 * 1024));
	assert_eq!(
		info.networks,
		vec![ContainerNetwork { name: "app-geo".into(), address: Some("10.0.0.5".into()) }]
	);
	assert_eq!(
		info.mounts,
		vec![ContainerMount {
			source: "/data/apps/geo".into(),
			destination: "/data".into(),
			read_only: true,
		}]
	);
}

#[test]
fn socket_service_of_takes_only_a_direct_child_of_the_sockets_directory() {
	assert_eq!(socket_service_of("/sockets/apt"), Some("apt".into()));
	assert_eq!(socket_service_of("/data"), None);
	assert_eq!(socket_service_of("/sockets/"), None);
	assert_eq!(socket_service_of("/sockets/a/b"), None);
}

#[test]
fn shapes_a_network_and_who_is_on_it() {
	use bollard::models::{EndpointResource, Ipam, IpamConfig};
	let network = NetworkInspect {
		name: Some("app-geo".into()),
		driver: Some("bridge".into()),
		ipam: Some(Ipam {
			config: Some(vec![IpamConfig { subnet: Some("172.20.0.0/16".into()), ..Default::default() }]),
			..Default::default()
		}),
		containers: Some(HashMap::from([(
			"endpoint-1".into(),
			EndpointResource {
				name: Some("geo".into()),
				ipv4_address: Some("172.20.0.2/16".into()),
				..Default::default()
			},
		)])),
		..Default::default()
	};
	let info = network_info(network);
	assert_eq!(info.name, "app-geo");
	assert_eq!(info.driver, "bridge");
	assert_eq!(info.subnet, Some("172.20.0.0/16".into()));
	assert_eq!(
		info.members,
		vec![NetworkMember { name: "geo".into(), address: Some("172.20.0.2/16".into()) }]
	);
}

#[test]
fn reads_the_filesystem_a_path_is_under() {
	let root = tempfile::tempdir().unwrap();
	let usage = filesystem_usage(root.path()).unwrap();
	assert!(usage.total > 0);
	assert!(usage.total >= usage.available);
	assert!(filesystem_usage(std::path::Path::new("/no/such/mount")).is_err());
}

#[test]
fn reads_a_numeric_user() {
	assert_eq!(numeric_user("65532:65532"), Some((65532, 65532)));
	assert_eq!(numeric_user("1000"), Some((1000, 1000)));
	assert_eq!(numeric_user("0:0"), None);
	assert_eq!(numeric_user("nobody"), None);
	assert_eq!(numeric_user(""), None);
}

#[test]
fn the_scheduler_shape_mounts_its_own_directory_and_every_socket_service() {
	let own = Some(bind("/data/apps/cron/data".into(), "/state".into(), false));
	let sockets = vec![
		("apt".to_owned(), PathBuf::from("/data/apps/apt/data")),
		("shot".to_owned(), PathBuf::from("/data/apps/shot/data")),
	];
	let mounts = scheduler_mounts(own, &sockets);
	assert_eq!(mounts.len(), 3);
	assert_eq!(
		(mounts[0].source.as_deref(), mounts[0].target.as_deref()),
		(Some("/data/apps/cron/data"), Some("/state"))
	);
	assert_eq!(
		(mounts[1].source.as_deref(), mounts[1].target.as_deref()),
		(Some("/data/apps/apt/data"), Some("/sockets/apt"))
	);
	assert_eq!(
		(mounts[2].source.as_deref(), mounts[2].target.as_deref()),
		(Some("/data/apps/shot/data"), Some("/sockets/shot"))
	);
	assert!(mounts.iter().all(|mount| mount.read_only == Some(false)));
	assert!(scheduler_mounts(None, &[]).is_empty());
}

#[test]
fn the_steward_shape_mounts_the_machines_dbus_socket() {
	let mounts = steward_mounts(None);
	assert_eq!(mounts.len(), 1);
	assert_eq!(mounts[0].source.as_deref(), Some(DBUS_SOCKET));
	assert_eq!(mounts[0].target.as_deref(), Some(DBUS_SOCKET));
	assert_eq!(mounts[0].read_only, Some(false));
	let own = Some(bind("/data/apps/apt/data".into(), "/state".into(), false));
	assert_eq!(steward_mounts(own).len(), 2);
}

#[test]
fn the_reporter_shape_mounts_the_meters_directory_read_only() {
	let own = Some(bind("/data/apps/telemetry/data".into(), "/data".into(), false));
	let mounts = reporter_mounts(own, Path::new("/data/apps/meter/data"));
	assert_eq!(mounts.len(), 2);
	assert_eq!(
		(mounts[1].source.as_deref(), mounts[1].target.as_deref()),
		(Some("/data/apps/meter/data"), Some("/sockets/meter"))
	);
	assert_eq!(mounts[1].read_only, Some(true));
	assert_eq!(reporter_mounts(None, Path::new("/m")).len(), 1);
	let shape = Shape::Reporter { env: vec![], meter: "/m".into() };
	assert!(shape.networked());
}
