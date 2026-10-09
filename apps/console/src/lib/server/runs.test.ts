import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Event } from '../wire.ts';
import { bound, down, success } from './bound.ts';
import type { FleetEvent } from './fleet.ts';
import { aggregates, group, percentile, runs } from './runs.ts';

afterEach(() => {
	vi.restoreAllMocks();
});

let ids = 0;
type Over = Partial<Event> & Pick<Event, 'started_at'>;
function at(node: FleetEvent['node'], over: Over): FleetEvent {
	return {
		id: ++ids,
		node,
		app: 'web',
		action: 'deploy',
		source: { kind: 'run', run: 1, commit: 'aaa' },
		outcome: 'succeeded',
		...over,
	};
}

/** Run 41 reaches two nodes and one skips; run 42 fails on one; 43 is still going. */
const FIXTURE: FleetEvent[] = [
	// Run 41: web on tyo goes through two events, the second of which is its latest.
	at('tyo', {
		source: { kind: 'run', run: 41, commit: 'c41' },
		outcome: 'running',
		stage: 'loading',
		started_at: '2026-10-04T10:00:00Z',
	}),
	at('tyo', {
		source: { kind: 'run', run: 41, commit: 'c41' },
		stage: 'starting',
		started_at: '2026-10-04T10:00:00Z',
		finished_at: '2026-10-04T10:01:00Z',
	}),
	at('gvx', {
		source: { kind: 'run', run: 41, commit: 'c41' },
		started_at: '2026-10-04T10:00:05Z',
		finished_at: '2026-10-04T10:02:00Z',
	}),
	at('buf', {
		source: { kind: 'run', run: 41, commit: 'c41' },
		outcome: 'skipped',
		stage: 'admitting',
		detail: 'not placed here',
		started_at: '2026-10-04T10:00:03Z',
		finished_at: '2026-10-04T10:00:03Z',
	}),
	// Run 42: hub fails on one node while succeeding on another.
	at('tyo', {
		app: 'hub',
		source: { kind: 'run', run: 42, commit: 'c42' },
		started_at: '2026-10-05T09:00:00Z',
		finished_at: '2026-10-05T09:00:30Z',
	}),
	at('nrt', {
		app: 'hub',
		source: { kind: 'run', run: 42, commit: 'c42' },
		outcome: 'failed',
		stage: 'downloading',
		detail: 'digest mismatch',
		started_at: '2026-10-05T09:00:00Z',
		finished_at: '2026-10-05T09:00:10Z',
	}),
	// An upload and a panel action belong to no run.
	at('tyo', {
		source: { kind: 'upload' },
		started_at: '2026-10-05T12:00:00Z',
		finished_at: '2026-10-05T12:00:20Z',
	}),
	at('tyo', {
		action: 'restart',
		source: { kind: 'panel' },
		started_at: '2026-10-05T13:00:00Z',
		finished_at: '2026-10-05T13:00:02Z',
	}),
	// Run 43 is running.
	at('hnd', {
		source: { kind: 'run', run: 43, commit: 'c43' },
		outcome: 'running',
		stage: 'downloading',
		started_at: '2026-10-07T08:00:00Z',
	}),
];

describe('group', () => {
	const { runs: found, apart } = group(FIXTURE);
	const by = (run: number) => found.find((r) => r.run === run);

	it('puts uploads and panel actions apart and orders runs newest first', () => {
		expect(apart.map((e) => e.source.kind)).toEqual(['upload', 'panel']);
		expect(found.map((r) => r.run)).toEqual([43, 42, 41]);
	});

	it("keeps each node's app at its latest event, and counts by outcome", () => {
		const run = by(41);
		expect(run).toMatchObject({
			commit: 'c41',
			apps: ['web'],
			succeeded: 2,
			failed: 0,
			skipped: 1,
			running: 0,
			first_start: '2026-10-04T10:00:00.000Z',
			last_finish: '2026-10-04T10:02:00.000Z',
			duration: 120_000,
		});
		expect(run?.nodes.sort()).toEqual(['buf', 'gvx', 'tyo']);
		expect(run?.placements.find((p) => p.node === 'tyo')).toMatchObject({
			stage: 'starting',
			duration: 60_000,
		});
		expect(run?.placements.find((p) => p.node === 'buf')).toMatchObject({
			outcome: 'skipped',
			stage: 'admitting',
		});
	});

	it('names the stage a failure stopped at, and leaves a running run without a duration', () => {
		expect(by(42)).toMatchObject({ succeeded: 1, failed: 1, apps: ['hub'], duration: 30_000 });
		expect(by(42)?.placements.find((p) => p.outcome === 'failed')).toMatchObject({
			node: 'nrt',
			stage: 'downloading',
			detail: 'digest mismatch',
		});
		expect(by(43)).toMatchObject({ running: 1, last_finish: undefined, duration: undefined });
	});
});

describe('aggregates', () => {
	it('counts runs per day with empty days between, the success rate and the durations', () => {
		const result = aggregates(group(FIXTURE).runs);
		expect(result.frequency).toEqual([
			{ day: '2026-10-04', runs: 1 },
			{ day: '2026-10-05', runs: 1 },
			{ day: '2026-10-06', runs: 0 },
			{ day: '2026-10-07', runs: 1 },
		]);
		// Run 43 is still running and is not counted; 41 succeeded and 42 failed.
		expect(result.success_rate).toBe(0.5);
		expect(result.median).toBe(30_000);
		expect(result.p95).toBe(120_000);
	});

	it('answers nothing for no runs', () => {
		expect(aggregates([])).toEqual({ frequency: [], success_rate: null, median: null, p95: null });
	});

	it('takes the nearest rank', () => {
		const list = Array.from({ length: 20 }, (_, i) => i + 1);
		expect(percentile(list, 0.5)).toBe(10);
		expect(percentile(list, 0.95)).toBe(19);
		expect(percentile([], 0.5)).toBeNull();
	});
});

describe('runs', () => {
	const mirror = { version: 1, node: 'tyo', runs: [FIXTURE[4], FIXTURE[5], FIXTURE[6]] };
	const relays = (answer: (path: string) => Response) => ({
		tyo: answer,
		rdu: answer,
		nrt: answer,
		hnd: answer,
		buf: answer,
		gvx: answer,
		bru: answer,
		sha: answer,
	});

	it('groups what the nearest relay mirrors, with no node unread', async () => {
		const { env, sent } = bound(relays(() => success(mirror)));
		const found = await runs({ env });
		expect(sent).toHaveLength(1);
		expect(sent[0]?.url).toMatch(/\/runs$/);
		expect(found.runs.map((r) => r.run)).toEqual([42]);
		expect(found.apart).toHaveLength(1);
		expect(found.failures).toEqual({});
	});

	it('says every node is unread where no relay answers', async () => {
		const { env } = bound(relays(down));
		const found = await runs({ env });
		expect(found.runs).toEqual([]);
		expect(Object.keys(found.failures)).toHaveLength(8);
	});
});
