import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Event } from '../wire.ts';
import { bound, down, paths, success } from './bound.ts';
import { ALL, fleetEvents, fleetNow, fleetSeries } from './fleet.ts';

afterEach(() => {
	vi.restoreAllMocks();
});

const event = (id: number, started_at: string): Event => ({
	id,
	app: 'web',
	action: 'deploy',
	source: { kind: 'run', run: 1 },
	outcome: 'succeeded',
	started_at,
});

describe('fleet', () => {
	it('asks every node once and keeps a node that is down apart from the rest', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const answers = Object.fromEntries(ALL.map((name) => [name, () => success({ at: name })]));
		answers.gvx = down;
		const { sent, env } = bound(answers);
		const now = await fleetNow({ env });
		expect(sent).toHaveLength(7);
		expect(new Set(sent.map(({ node }) => node)).size).toBe(7);
		expect(now.gvx).toMatchObject({ ok: false, failure: { status: 502 } });
		expect(now.tyo).toMatchObject({ ok: true, node: 'tyo' });
		expect(Object.keys(now).sort()).toEqual([...ALL].sort());
	});

	it('asks each node for the series with the same query', async () => {
		const { sent, env } = bound(Object.fromEntries(ALL.map((n) => [n, () => success([])])));
		await fleetSeries({ env }, { grain: 'minute', since: 1, until: 2, metrics: ['cpu.usage'] });
		expect(new Set(paths(sent))).toEqual(
			new Set(['/node/series?grain=minute&metrics=cpu.usage&since=1&until=2']),
		);
	});
});

describe('fleetEvents', () => {
	const answers = () => ({
		tyo: () => success([event(9, '2026-10-06T10:00:00Z'), event(8, '2026-10-06T08:00:00Z')]),
		gvx: () => success([event(4, '2026-10-06T09:00:00Z'), event(3, '2026-10-06T07:00:00Z')]),
		buf: down,
	});

	it('merges newest first with each row on its node, and keeps the failure', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const { sent, env } = bound(answers());
		const merged = await fleetEvents({ env }, { limit: 3 });
		expect(merged.events.map((e) => [e.node, e.id])).toEqual([
			['tyo', 9],
			['gvx', 4],
			['tyo', 8],
		]);
		expect(Object.keys(merged.failures)).toEqual(['buf', 'nrt', 'hnd', 'bru', 'rdu']);
		expect(sent).toHaveLength(3);
		expect(new Set(paths(sent))).toEqual(new Set(['/events?limit=3']));
		expect(merged.next).toEqual({ tyo: 8, gvx: 4 });
	});

	it('pages each node from its own cursor', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const { sent, env } = bound(answers());
		await fleetEvents({ env }, { limit: 3, before: { tyo: 8, gvx: 4 } });
		expect(paths(sent).filter((p) => p.includes('before'))).toEqual([
			'/events?before=8&limit=3',
			'/events?before=4&limit=3',
		]);
	});
});
