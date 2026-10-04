use super::*;

/// The file geo ships. Two programs read this format, so the reader is tested against a real
/// declaration rather than one written to suit it.
const GEO: &str = include_str!("../../../../../apps/geo/service.toml");

#[test]
fn reads_the_declaration_geo_ships() {
	let manifest = Manifest::parse(GEO).unwrap();
	assert_eq!(manifest.name, "geo");
	assert_eq!(manifest.data, Some(Data { path: "/state".into() }));
	let limits = vec![
		Limit {
			methods: vec!["GET".into(), "HEAD".into()],
			path: "/address".into(),
			count: 60,
			seconds: 60,
			burst: None,
			subject: None,
		},
		Limit {
			methods: vec!["GET".into(), "HEAD".into()],
			path: "/ip".into(),
			count: 60,
			seconds: 60,
			burst: None,
			subject: None,
		},
	];
	assert_eq!(manifest.api, Some(Api { public: true, prefix: None, limits, sides: None }));
	assert_eq!(manifest.check("geo", "home"), Ok(()));
}

#[test]
fn an_unknown_version_is_refused_before_anything_else_is_read() {
	let newer = GEO.replace("version = 1", "version = 2").replace("port =", "port_moved =");
	assert_eq!(Manifest::parse(&newer), Err(Invalid::Version(2)));
}

#[test]
fn an_unknown_key_is_ignored() {
	// A key a newer declaration adds is compatible by definition; refusing it would turn every
	// addition into an outage on the hosts not yet updated. See spec/json.md.
	assert!(Manifest::parse(&format!("{GEO}\nlater = true\n")).is_ok());
}

#[test]
fn names_are_labels_and_not_the_platforms() {
	assert!(check_name("geo").is_ok());
	assert!(check_name("ip-lookup2").is_ok());
	assert_eq!(check_name("Geo"), Err(Invalid::Name("Geo".into())));
	assert_eq!(check_name("-geo"), Err(Invalid::Name("-geo".into())));
	assert_eq!(check_name("geo_ip"), Err(Invalid::Name("geo_ip".into())));
	assert_eq!(check_name("api"), Err(Invalid::Reserved("api".into())));
	assert_eq!(check_name("caddy"), Err(Invalid::Reserved("caddy".into())));
}

#[test]
fn a_node_runs_only_what_is_placed_on_it() {
	let manifest = Manifest::parse(GEO).unwrap();
	assert_eq!(
		manifest.check("geo", "vps"),
		Err(Invalid::NotPlaced { name: "geo".into(), node: "vps".into() })
	);
	assert!(matches!(manifest.check("other", "home"), Err(Invalid::Mismatch { .. })));
}

#[test]
fn only_the_platforms_own_pass_its_own_check() {
	let mut manifest = Manifest::parse(GEO).unwrap();
	manifest.name = "keeper".into();
	assert_eq!(manifest.check_own("keeper", "home"), Ok(()));
	// The ordinary check still refuses the name, so no app can be sent as keeper.
	assert_eq!(manifest.check("keeper", "home"), Err(Invalid::Reserved("keeper".into())));
	assert_eq!(check_name("meter"), Err(Invalid::Reserved("meter".into())));
	manifest.name = "api".into();
	assert_eq!(manifest.check_own("api", "home"), Err(Invalid::Name("api".into())));
}

#[test]
fn a_default_port_is_refused() {
	let mut manifest = Manifest::parse(GEO).unwrap();
	manifest.container.as_mut().unwrap().port = Some(8080);
	assert_eq!(manifest.check("geo", "home"), Err(Invalid::Port(8080)));
}

#[test]
fn a_container_answers_on_a_port_or_a_socket() {
	let socketed = |extra: &str| {
		Manifest::parse(&format!(
			"version = 1\nname = \"probe\"\nplacements = [\"home\"]\n{extra}\n[container]\nhealth = \"/health\"\nsocket = \"probe.sock\"\n[data]\npath = \"/data\"\n",
		))
		.unwrap()
	};
	assert_eq!(socketed("").check("probe", "home"), Ok(()));
	let mut both = socketed("");
	both.container.as_mut().unwrap().port = Some(20000);
	assert_eq!(both.check("probe", "home"), Err(Invalid::Answer));
	let mut neither = socketed("");
	neither.container.as_mut().unwrap().socket = None;
	assert_eq!(neither.check("probe", "home"), Err(Invalid::Answer));
	let mut nested = socketed("");
	nested.container.as_mut().unwrap().socket = Some("../probe.sock".into());
	assert_eq!(nested.check("probe", "home"), Err(Invalid::Socket));
	let mut homeless = socketed("");
	homeless.data = None;
	assert_eq!(homeless.check("probe", "home"), Err(Invalid::Socket));
	let routed = socketed("[api]\npublic = false");
	assert_eq!(routed.check("probe", "home"), Err(Invalid::Unroutable));
}

#[test]
fn a_node_refuses_a_service_with_no_container() {
	let manifest =
		Manifest::parse("version = 1\nname = \"edge\"\nplacements = [\"workers\", \"home\"]\n")
			.unwrap();
	assert_eq!(manifest.check("edge", "home"), Err(Invalid::NoContainer("edge".into())));
}

#[test]
fn every_declaration_in_the_repository_is_one_this_reader_takes() {
	// The gateway's table is generated from these files by a second reader, so this one has to
	// accept each of them too. See apps/gateway/scripts/scopes.ts.
	let apps = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../apps");
	let mut read = 0;
	for entry in std::fs::read_dir(apps).unwrap() {
		let path = entry.unwrap().path().join("service.toml");
		let Ok(text) = std::fs::read_to_string(&path) else { continue };
		let manifest = Manifest::parse(&text).unwrap_or_else(|e| panic!("{}: {e}", path.display()));
		let node = manifest.placements.iter().find(|placement| *placement != WORKERS);
		if let Some(node) = node {
			let checked = if OWN.contains(&manifest.name.as_str()) {
				manifest.check_own(&manifest.name, node)
			} else {
				manifest.check(&manifest.name, node)
			};
			assert_eq!(checked, Ok(()), "{}", path.display());
		}
		read += 1;
	}
	assert!(read >= 3);
}

#[test]
fn counts_a_prefix_beside_an_exact_path_it_does_not_cover() {
	let rows = "[[api.limits]]\nmethods = [\"GET\"]\npath = \"/checks\"\ncount = 1\nseconds = 60\n\
		[[api.limits]]\nmethods = [\"GET\"]\npath = \"/checks/*\"\ncount = 1\nseconds = 60";
	let manifest = Manifest::parse(&format!("{GEO}\n{rows}\n")).unwrap();
	assert_eq!(manifest.check("geo", "home"), Ok(()));
}

#[test]
fn refuses_a_limit_it_could_not_count() {
	for broken in [
		"methods = []\npath = \"/a\"\ncount = 1\nseconds = 60",
		"methods = [\"get\"]\npath = \"/a\"\ncount = 1\nseconds = 60",
		"methods = [\"GET\"]\npath = \"a\"\ncount = 1\nseconds = 60",
		"methods = [\"GET\"]\npath = \"/a\"\ncount = 0\nseconds = 60",
		"methods = [\"GET\"]\npath = \"/a\"\ncount = 1\nseconds = 0",
		"methods = [\"GET\"]\npath = \"/a\"\ncount = 1\nseconds = 86401",
		"methods = [\"GET\"]\npath = \"/a/*/b\"\ncount = 1\nseconds = 60",
		"methods = [\"GET\"]\npath = \"/a\"\ncount = 1\nseconds = 60\nburst = 0",
		// Only an address is counted until there are accounts.
		"methods = [\"GET\"]\npath = \"/a\"\ncount = 1\nseconds = 60\nsubject = \"account\"",
		// geo's own row covers GET /address, and a prefix over it would count it twice.
		"methods = [\"GET\"]\npath = \"/*\"\ncount = 1\nseconds = 60",
		// geo's own row covers GET /address already.
		"methods = [\"GET\"]\npath = \"/address\"\ncount = 1\nseconds = 60",
	] {
		let text = format!("{GEO}\n[[api.limits]]\n{broken}\n");
		let manifest = Manifest::parse(&text).unwrap();
		assert_eq!(manifest.check("geo", "home"), Err(Invalid::Limit), "{broken}");
	}
}

#[test]
fn names_its_sides_from_three_and_never_leaves_out_inside() {
	let mut geo = Manifest::parse(GEO).unwrap();
	let api = geo.api.as_mut().unwrap();
	assert!(api.carried_on("private") && api.carried_on("tunnel") && api.carried_on("inside"));
	api.sides = Some(vec!["inside".into()]);
	assert!(!api.carried_on("private") && api.carried_on("inside"));
	assert_eq!(geo.check("geo", "home"), Ok(()));
	for sides in [vec!["private"], vec!["inside", "outside"], vec![]] {
		let mut broken = geo.clone();
		broken.api.as_mut().unwrap().sides = Some(sides.iter().map(|side| (*side).into()).collect());
		assert_eq!(broken.check("geo", "home"), Err(Invalid::Sides), "{sides:?}");
	}
}

#[test]
fn a_home_stays_on_the_apps_own_site() {
	let gemini = Manifest::parse(include_str!("../../../../../apps/gemini/service.toml")).unwrap();
	assert_eq!(gemini.check("gemini", "home"), Ok(()));
	for home in ["/", "admin", "//evil.example"] {
		let mut elsewhere = gemini.clone();
		elsewhere.interface.as_mut().unwrap().home = Some(home.into());
		assert_eq!(elsewhere.check("gemini", "home"), Err(Invalid::Home), "{home}");
	}
	let tunnel = Manifest::parse(include_str!("../../../../apps/tunnel/service.toml")).unwrap();
	assert_eq!(tunnel.check_own("tunnel", "home"), Ok(()));
}

#[test]
fn a_node_refuses_an_api_prefix() {
	let mut manifest = Manifest::parse(GEO).unwrap();
	manifest.api.as_mut().unwrap().prefix = Some("/api".into());
	assert_eq!(manifest.check("geo", "home"), Err(Invalid::Prefix));
}

#[test]
fn a_label_maps_an_apps_name_for_what_reaches_it_from_outside() {
	let gemini = Manifest::parse(include_str!("../../../../../apps/gemini/service.toml")).unwrap();
	let interface = gemini.interface.as_ref().unwrap();
	// No `domain` set: the label is the app's own name.
	assert_eq!(interface.label("gemini"), "gemini");
	let mut labeled = gemini.clone();
	labeled.interface.as_mut().unwrap().domain = Some("infra".into());
	assert_eq!(labeled.interface.as_ref().unwrap().label("gemini"), "infra");
	assert_eq!(labeled.check("gemini", "home"), Ok(()));
}

#[test]
fn a_reserved_label_is_refused() {
	let mut manifest = Manifest::parse(GEO).unwrap();
	manifest.interface = Some(Interface { domain: Some("cms".into()), lan: true, home: None });
	assert_eq!(manifest.check("geo", "home"), Err(Invalid::Reserved("cms".into())));
	manifest.interface.as_mut().unwrap().domain = Some("host".into());
	assert_eq!(manifest.check("geo", "home"), Err(Invalid::Reserved("host".into())));
	manifest.interface.as_mut().unwrap().domain = Some("Geo".into());
	assert_eq!(manifest.check("geo", "home"), Err(Invalid::Label("Geo".into())));
}

#[test]
fn an_old_manifests_interface_public_key_is_ignored() {
	// A manifest a store already holds from before this key was replaced with `domain` and
	// `lan` still has to deserialize; see spec/json.md and the note on `Interface` below.
	let text = format!("{GEO}\n[interface]\npublic = false\n");
	let manifest = Manifest::parse(&text).unwrap();
	let interface = manifest.interface.unwrap();
	assert_eq!((interface.domain, interface.lan), (None, true));
}

#[test]
fn objects_are_declared_as_buckets_s3_takes() {
	let declared =
		|buckets: &str| Manifest::parse(&format!("{GEO}\n[objects]\nbuckets = [{buckets}]\n")).unwrap();
	let manifest = declared("\"photos\", \"thumbs.v2\"");
	assert_eq!(manifest.check("geo", "home"), Ok(()));
	assert_eq!(manifest.sidecar().as_deref(), Some("geo-objects"));
	assert_eq!(Manifest::parse(GEO).unwrap().sidecar(), None);
	for broken in [
		"Photos",
		"ph",
		"-photos",
		"photos-",
		"ph..otos",
		"192.168.1.1",
		"xn--photos",
		"photos-s3alias",
		"ph_otos",
	] {
		let manifest = declared(&format!("\"{broken}\""));
		assert_eq!(manifest.check("geo", "home"), Err(Invalid::Bucket(broken.into())), "{broken}");
	}
	assert_eq!(declared("").check("geo", "home"), Err(Invalid::Buckets));
	assert_eq!(declared("\"photos\", \"photos\"").check("geo", "home"), Err(Invalid::Buckets));
	let mut long = declared("\"photos\"");
	long.name = "a".repeat(56);
	let named = Invalid::SidecarName(format!("{}-objects", "a".repeat(56)));
	assert_eq!(long.check(&"a".repeat(56), "home"), Err(named));
	long.name = "a".repeat(55);
	assert_eq!(long.check(&"a".repeat(55), "home"), Ok(()));
}

#[test]
fn the_driver_and_every_sidecar_name_are_reserved() {
	assert_eq!(check_name("objects"), Err(Invalid::Reserved("objects".into())));
	assert_eq!(check_name("geo-objects"), Err(Invalid::Reserved("geo-objects".into())));
	assert!(check_name("objects-geo").is_ok());
	let driver = Manifest::parse(include_str!("../../../../../apps/objects/service.toml")).unwrap();
	assert_eq!(driver.check_own("objects", "home"), Ok(()));
	assert_eq!(driver.check("objects", "home"), Err(Invalid::Reserved("objects".into())));
}

#[test]
fn databases_are_declared_each_with_an_optional_ceiling() {
	let text = format!("{GEO}\n[postgres]\nmemory_mb = 192\n");
	let manifest = Manifest::parse(&text).unwrap();
	assert_eq!(manifest.postgres, Some(Database { memory_mb: Some(192) }));
	assert_eq!(manifest.check("geo", "home"), Ok(()));
	assert_eq!(manifest.sidecars(), ["geo-postgres"]);
	assert_eq!(Driver::Postgres.memory_mb(&manifest), Some(192));
	// Objects are not declared, so its sidecar is not among them, and the one it names is none.
	assert_eq!(manifest.sidecar(), None);
	let geo = Manifest::parse(GEO).unwrap();
	assert!(geo.sidecars().is_empty() && geo.postgres.is_none());

	let unbounded = Manifest::parse(&format!("{GEO}\n[postgres]\nmemory_mb = 0\n")).unwrap();
	assert_eq!(unbounded.check("geo", "home"), Err(Invalid::SidecarMemory("postgres".into())));
	let mut long = Manifest::parse(&format!("{GEO}\n[postgres]\n")).unwrap();
	long.name = "a".repeat(55);
	let named = Invalid::SidecarName(format!("{}-postgres", "a".repeat(55)));
	assert_eq!(long.check(&"a".repeat(55), "home"), Err(named));
	long.name = "a".repeat(54);
	assert_eq!(long.check(&"a".repeat(54), "home"), Ok(()));
}

#[test]
fn the_database_drivers_and_every_sidecar_of_theirs_are_reserved() {
	for name in ["postgres", "geo-postgres"] {
		assert_eq!(check_name(name), Err(Invalid::Reserved(name.into())), "{name}");
	}
	assert!(check_name("postgres-geo").is_ok());
	assert!(OWN.contains(&"postgres"));
	let driver = Manifest::parse(include_str!("../../../../../apps/postgres/service.toml")).unwrap();
	assert_eq!(driver.check_own("postgres", "home"), Ok(()));
	assert_eq!(driver.check("postgres", "home"), Err(Invalid::Reserved("postgres".into())));
	// Only a driver keeps a port outside the services' range; an app on 5432 is still refused.
	let mut geo = Manifest::parse(GEO).unwrap();
	geo.container.as_mut().unwrap().port = Some(5432);
	assert_eq!(geo.check("geo", "home"), Err(Invalid::Port(5432)));
}

#[test]
fn lan_defaults_to_on_and_can_be_turned_off() {
	let gemini = Manifest::parse(include_str!("../../../../../apps/gemini/service.toml")).unwrap();
	assert!(gemini.interface.as_ref().unwrap().lan);
	let mut off = gemini;
	off.interface.as_mut().unwrap().lan = false;
	assert_eq!(off.check("gemini", "home"), Ok(()));
}

#[test]
fn cron_and_apt_are_reserved_and_deployed_by_host() {
	assert_eq!(check_name("cron"), Err(Invalid::Reserved("cron".into())));
	assert_eq!(check_name("apt"), Err(Invalid::Reserved("apt".into())));
	assert!(OWN.contains(&"cron") && OWN.contains(&"apt"));
}

#[test]
fn a_schedule_declares_exactly_one_clock() {
	let text = format!(
		"{GEO}\n[[schedules]]\nname = \"refresh\"\ncron = \"0 4 * * *\"\nevery = \"1m\"\npath = \"/jobs/refresh\"\n"
	);
	let manifest = Manifest::parse(&text).unwrap();
	assert_eq!(manifest.check("geo", "home"), Err(Invalid::Schedule("refresh".into())));
}

#[test]
fn a_schedule_reads_its_defaults_and_checks_its_shape() {
	let scheduled = |extra: &str| {
		Manifest::parse(&format!(
			"{GEO}\n[[schedules]]\nname = \"refresh\"\npath = \"/jobs/refresh\"\n{extra}\n"
		))
		.unwrap()
	};
	let manifest = scheduled("cron = \"0 4 * * *\"");
	let schedule = &manifest.schedules[0];
	assert_eq!(schedule.catch_up, CatchUp::Once);
	assert_eq!(schedule.overlap, Overlap::Skip);
	assert_eq!(schedule.timeout, 300);
	assert_eq!(manifest.check("geo", "home"), Ok(()));

	assert_eq!(scheduled("every = \"30s\"").check("geo", "home"), Ok(()));
	for broken in ["cron = \"0 4 * *\"", "cron = \"a 4 * * *\"", "every = \"m\"", "every = \"0s\""] {
		assert_eq!(
			scheduled(broken).check("geo", "home"),
			Err(Invalid::Schedule("refresh".into())),
			"{broken}"
		);
	}
	let no_slash = Manifest::parse(&format!(
		"{GEO}\n[[schedules]]\nname = \"refresh\"\ncron = \"0 4 * * *\"\npath = \"jobs/refresh\"\n"
	))
	.unwrap();
	assert_eq!(no_slash.check("geo", "home"), Err(Invalid::Schedule("refresh".into())));
	let too_long = scheduled("cron = \"0 4 * * *\"\ntimeout = 86401");
	assert_eq!(too_long.check("geo", "home"), Err(Invalid::Schedule("refresh".into())));
}

#[test]
fn a_scheduled_service_answers_through_its_scope_or_its_socket() {
	let socketed = Manifest::parse(
		"version = 1\nname = \"probe\"\nplacements = [\"home\"]\n[container]\nhealth = \"/health\"\nsocket = \"probe.sock\"\n[data]\npath = \"/data\"\n[[schedules]]\nname = \"update\"\ncron = \"0 7 * * *\"\npath = \"/jobs/update\"\n",
	)
	.unwrap();
	assert_eq!(socketed.check("probe", "home"), Ok(()));

	let unreachable = Manifest::parse(
		"version = 1\nname = \"probe\"\nplacements = [\"home\"]\n[container]\nhealth = \"/health\"\nport = 20000\n[[schedules]]\nname = \"update\"\ncron = \"0 7 * * *\"\npath = \"/jobs/update\"\n",
	)
	.unwrap();
	assert_eq!(unreachable.check("probe", "home"), Err(Invalid::Unscheduled("probe".into())));
}
