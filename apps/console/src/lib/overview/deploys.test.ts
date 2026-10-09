import { describe, expect, it } from 'vitest';
import type { Node } from '../server/nodes.ts';
import type { Placement, Run } from '../server/runs.ts';
import { byNode, figures, marks } from './deploys.ts';

const NOW = Date.parse('2026-10-06T12:00:00Z');
const HOUR = 3_600_000;

function run(
	id: number,
	start: string,
	over: Partial<Run> = {},
	placed: Partial<Placement>[] = [],
): Run {
	const placements = placed.map((one) => ({
		node: 'tyo' as Node,
		app: 'web',
		action: 'deploy',
		outcome: 'succeeded',
		started_at: start,
		...one,
	}));
	return {
		run: id,
		placements,
		apps: ['web'],
		nodes: ['tyo'],
		succeeded: 1,
		failed: 0,
		skipped: 0,
		running: 0,
		first_start: start,
		duration: 60_000,
		...over,
	} as Run;
}

describe('runs counted for the Overview', () => {
	it('tallies each node by outcome, leaving out what is still running or too old', () => {
		const runs = [
			run(1, '2026-10-06T10:00:00Z', {}, [
				{ node: 'tyo' },
				{ node: 'gvx', outcome: 'failed' },
				{ node: 'gvx', outcome: 'running' },
			]),
			run(2, '2026-09-01T10:00:00Z', {}, [{ node: 'tyo' }]),
		];
		const since = Date.parse('2026-09-06T00:00:00Z');
		expect(byNode(runs, ['tyo', 'gvx'], since)).toEqual({
			nodes: ['tyo', 'gvx'],
			succeeded: [1, 0],
			failed: [0, 1],
			skipped: [0, 0],
		});
	});

	it('takes the last day for deploys and its rate, and the window for the median', () => {
		const runs = [
			run(3, new Date(NOW - 2 * HOUR).toISOString(), { failed: 1, duration: 30_000 }),
			run(2, new Date(NOW - 3 * HOUR).toISOString(), { duration: 90_000 }),
			run(1, new Date(NOW - 48 * HOUR).toISOString(), { duration: 60_000 }),
		];
		const said = figures(runs, NOW, NOW - 30 * 24 * HOUR);
		expect(said.day).toBe(2);
		expect(said.rate).toBe(0.5);
		expect(said.median).toBe(60_000);
		expect(said.durations).toEqual([60_000, 90_000, 30_000]);
	});

	it('marks the runs started in the span by their commit', () => {
		const at = NOW / 1000;
		const runs = [
			run(7, new Date(NOW).toISOString(), { commit: 'abcdef1234' }),
			run(8, new Date(NOW - 2 * HOUR).toISOString()),
		];
		expect(marks(runs, at - 3600, at)).toEqual([{ at, label: 'abcdef1' }]);
		expect(marks(runs, at - 3 * 3600, at)[1]).toEqual({ at: at - 7200, label: 'Run 8' });
	});
});
