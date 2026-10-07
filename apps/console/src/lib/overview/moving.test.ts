import { describe, expect, it } from 'vitest';
import type { Run } from '../server/runs.ts';
import type { Event, Held } from '../wire.ts';
import { current, fromLive, fromRuns, type Step } from './moving.ts';

const step = (over: Partial<Step>): Step => ({
	run: 1,
	node: 'tyo',
	app: 'web',
	outcome: 'running',
	started_at: '2026-10-06T10:00:00Z',
	...over,
});

function held(events: Partial<Event>[]): Held {
	return {
		version: 1,
		heard_at: '2026-10-06T10:00:00Z',
		snapshot: {
			taken_at: '2026-10-06T10:00:00Z',
			apps: [],
			events: events.map((one, index) => ({
				id: index + 1,
				app: 'web',
				action: 'deploy',
				source: { kind: 'run', run: 1 },
				outcome: 'running',
				started_at: '2026-10-06T10:00:00Z',
				...one,
			})),
		},
	};
}

describe('what is deploying now', () => {
	it('seeds from the runs: every running placement and the latest failures', () => {
		const runs = [
			{
				run: 9,
				placements: [
					{ node: 'tyo', app: 'web', action: 'deploy', outcome: 'running', started_at: 'a' },
					{ node: 'gvx', app: 'web', action: 'deploy', outcome: 'succeeded', started_at: 'a' },
				],
			},
			{
				run: 8,
				placements: [
					{
						node: 'buf',
						app: 'api',
						action: 'deploy',
						outcome: 'failed',
						stage: 'loading',
						started_at: '2026-10-06T09:00:00Z',
					},
				],
			},
		] as unknown as Run[];
		const seed = fromRuns(runs);
		expect(seed.map((one) => [one.run, one.node, one.outcome])).toEqual([
			[9, 'tyo', 'running'],
			[8, 'buf', 'failed'],
		]);
		expect(seed[1]?.stage).toBe('loading');
	});

	it('reads the run events a snapshot holds, and leaves uploads out', () => {
		const live = fromLive({
			tyo: held([{}, { source: { kind: 'upload' } }]),
			gvx: held([{ outcome: 'failed', stage: 'starting' }]),
		});
		expect(live.map((one) => [one.node, one.outcome, one.id])).toEqual([
			['tyo', 'running', 1],
			['gvx', 'failed', 1],
		]);
	});

	it('lets a snapshot overtake the seed, and the newer event win within a node', () => {
		const seed = [step({ node: 'tyo' }), step({ node: 'gvx', stage: 'downloading' })];
		const live = [
			step({ node: 'tyo', outcome: 'succeeded', id: 4 }),
			step({ node: 'gvx', stage: 'starting', id: 7 }),
			step({ node: 'gvx', stage: 'loading', id: 6 }),
		];
		const now = current(seed, live);
		expect(now.running).toEqual([{ run: 1, steps: [live[1]] }]);
		expect(now.failed).toEqual([]);
	});

	it('orders runs newest first and failures by when they ended, keeping the latest few', () => {
		const failed = (run: number, at: string) =>
			step({ run, outcome: 'failed', started_at: at, finished_at: at });
		const now = current(
			[
				step({ run: 1, started_at: '2026-10-06T08:00:00Z' }),
				step({ run: 2, started_at: '2026-10-06T09:00:00Z' }),
				failed(3, '2026-10-05T10:00:00Z'),
				failed(4, '2026-10-06T10:00:00Z'),
				failed(5, '2026-10-04T10:00:00Z'),
			],
			[],
			2,
		);
		expect(now.running.map((one) => one.run)).toEqual([2, 1]);
		expect(now.failed.map((one) => one.run)).toEqual([4, 3]);
	});
});
