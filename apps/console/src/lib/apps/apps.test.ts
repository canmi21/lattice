import { describe, expect, it } from 'vitest';
import type { Node } from '../server/nodes.ts';
import type { Point } from '../host.ts';
import type { Read } from '../server/read.ts';
import type { App, Cluster, Event } from '../wire.ts';
import { drifts, latest, lines, merge, placements, rowsOf, total } from './apps.ts';

const ORDER: Node[] = ['tyo', 'gvx', 'buf', 'nrt', 'hnd', 'bru', 'rdu'];

const app = (name: string, image: string, over: Partial<App> = {}): App => ({
	name,
	image,
	deployed_at: '2026-10-06T08:00:00Z',
	running: true,
	held: false,
	...over,
});

const held = (apps: App[]) => ({
	version: 1,
	heard_at: '',
	snapshot: { taken_at: '', events: [], apps },
});

const cluster = {
	version: 1,
	node: 'tyo',
	nodes: {
		tyo: held([app('web', 'r/web@sha256:aaa'), app('geo', 'r/geo@sha256:ccc')]),
		gvx: held([
			app('web', 'r/web@sha256:bbb', { deployed_at: '2026-10-06T09:00:00Z', held: true }),
			app('geo', 'r/geo@sha256:ccc', { running: false }),
		]),
	},
} as unknown as Cluster;

const ok = <T>(data: T): Read<T> => ({ ok: true, node: 'tyo', data });
const failed: Read<never> = {
	ok: false,
	failure: { status: 502, code: 'upstream_unavailable', message: '' },
};

describe('apps', () => {
	it('flags an app whose nodes run different images', () => {
		expect(drifts(['a', 'a'])).toBe(false);
		expect(drifts(['a', 'b'])).toBe(true);
		const [geo, web] = rowsOf(ORDER, cluster);
		expect([geo?.name, geo?.drift, geo?.running]).toEqual(['geo', false, 1]);
		expect([web?.name, web?.drift, web?.running, web?.deployed]).toEqual([
			'web',
			true,
			1,
			'2026-10-06T09:00:00Z',
		]);
	});

	it('states each placement in node order', () => {
		expect(placements(ORDER, cluster, 'web').map((one) => [one.node, one.state])).toEqual([
			['tyo', 'running'],
			['gvx', 'held'],
		]);
		expect(placements(ORDER, cluster, 'geo')[1]?.state).toBe('stopped');
		expect(placements(ORDER, cluster, 'none')).toEqual([]);
	});
});

describe('merge', () => {
	const event = (id: number, started_at: string): Event => ({
		id,
		app: 'web',
		action: 'deploy',
		source: { kind: 'run', run: id },
		outcome: 'succeeded',
		started_at,
	});

	it('puts every node newest first and names the node that did not answer', () => {
		const merged = merge(ORDER, {
			tyo: ok([event(2, '2026-10-06T10:00:00Z'), event(1, '2026-10-06T06:00:00Z')]),
			gvx: ok([event(7, '2026-10-06T08:00:00Z')]),
			buf: failed,
		});
		expect(merged.events.map((one) => [one.node, one.id])).toEqual([
			['tyo', 2],
			['gvx', 7],
			['tyo', 1],
		]);
		expect(merged.unknown).toEqual(['buf']);
	});
});

describe('series', () => {
	const points = (values: number[]): Point[] =>
		values.map((average, at) => ({
			at,
			values: { 'web.cpu': { average, minimum: 0, maximum: 9, count: 1 } },
		}));

	it('colors a line by its node, not its rank, and leaves out an unknown node', () => {
		const made = lines(
			ORDER,
			{ gvx: ok(points([1, 2])), tyo: failed, buf: ok(points([3])) },
			'web.cpu',
		);
		expect(made.lines.map((line) => [line.key, line.color])).toEqual([
			['gvx', 'var(--color-series-2)'],
			['buf', 'var(--color-series-3)'],
		]);
		expect(made.unknown).toEqual(['tyo']);
		expect(latest(made.lines)).toEqual({ gvx: 2, buf: 3 });
	});

	it('adds the nodes moment by moment', () => {
		const made = lines(
			ORDER,
			{ tyo: ok(points([1, 2])), gvx: ok(points([10, 20, 30])) },
			'web.cpu',
		);
		expect(total(made.lines).map((one) => one.value)).toEqual([11, 22, 30]);
	});
});
