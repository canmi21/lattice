/**
 * A fixture run of `render`, against small inline data shaped like each route's answer, without
 * calling the live node -- the new inspect routes are not deployed yet. See infra.ts and
 * spec/architecture/inspect.md.
 */
import { render } from './infra.ts';

const containers = [
	{
		name: 'geo',
		id: 'abc123',
		image: 'geo:abc123',
		state: 'running',
		status: 'Up 3 hours',
		started_at: '2026-09-28T10:00:00Z',
		restart_count: 0,
		oom_killed: false,
		memory_limit: 268435456,
		networks: [{ name: 'app', address: '10.0.0.2' }],
		mounts: [{ source: '/data/geo', destination: '/data', read_only: false }],
	},
	{
		name: 'shot',
		id: 'def456',
		image: 'shot:def456',
		state: 'exited',
		status: 'Exited (137)',
		started_at: '2026-09-28T09:00:00Z',
		restart_count: 3,
		oom_killed: true,
		memory_limit: 536870912,
		networks: [{ name: 'app', address: '10.0.0.3' }],
		mounts: [],
	},
];

const disk = {
	mounts: [{ path: '/', total: 100_000_000_000, used: 40_000_000_000, available: 60_000_000_000 }],
	apps: [{ app: 'geo', bytes: 1_000_000_000, partial: false }],
	snapshots: [{ name: 'geo-2026-09-28', app: 'geo', created: '2026-09-28T00:00:00Z' }],
};

const kernel = {
	kills: [{ task: 'shot', pid: 4242, cgroup: 'docker/shot', monotonic_seconds: 12345.6 }],
	unavailable: null,
};

console.log(render('containers', containers, false));
console.log();
console.log(render('containers', containers, true));
console.log();
console.log(render('disk', disk, false));
console.log();
console.log(render('kernel', kernel, false));
