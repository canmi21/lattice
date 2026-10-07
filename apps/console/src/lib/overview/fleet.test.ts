import { describe, expect, it } from 'vitest';
import type { Point } from '../host.ts';
import type { Fleet } from '../server/fleet.ts';
import { heat, missing, nodeColor, perNode } from './fleet.ts';

const point = (at: number, cpu: number): Point => ({
	at,
	values: { 'cpu.usage': { average: cpu, minimum: cpu, maximum: cpu, count: 60 } },
});
const down = { ok: false, failure: { status: 502, code: 'upstream_unavailable', message: 'gone' } };

/** Three of the seven, in node order, one of them down. */
const FLEET = {
	tyo: { ok: true, node: 'tyo', data: [point(3600, 10), point(7200, 20)] },
	gvx: down,
	buf: { ok: true, node: 'buf', data: [point(7200, 40)] },
} as unknown as Fleet<Point[]>;

describe('the fleet shaped for its charts', () => {
	it('draws a line per node that answered, each in the color of its place in node order', () => {
		const lines = perNode(FLEET, 'cpu.usage');
		expect(lines.map((line) => [line.key, line.color])).toEqual([
			['tyo', nodeColor(0)],
			['buf', nodeColor(2)],
		]);
		expect(lines[0]?.points.map((one) => one.value)).toEqual([10, 20]);
	});

	it('names the nodes that did not answer', () => {
		expect(missing(FLEET)).toEqual([{ node: 'gvx', message: 'gone' }]);
	});

	it('lays the hours out as a grid, a node that did not answer a row of gaps', () => {
		const grid = heat(FLEET, 'cpu.usage', { since: 3600 + 10, until: 3 * 3600, step: 3600 });
		expect(grid.times).toEqual([3600, 7200]);
		expect(grid.rows.map((row) => row.key)).toEqual(['tyo', 'gvx', 'buf']);
		expect(grid.values).toEqual([
			[10, 20],
			[Number.NaN, Number.NaN],
			[Number.NaN, 40],
		]);
	});
});
