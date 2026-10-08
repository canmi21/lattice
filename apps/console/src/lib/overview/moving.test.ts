import { describe, expect, it } from 'vitest';
import type { FleetEvent } from '../server/fleet.ts';
import type { Run } from '../server/runs.ts';
import type { Event, Held } from '../wire.ts';
import { current, fromHistory, fromLive, type Step, what } from './moving.ts';

const step = (over: Partial<Step>): Step => ({
	run: 1,
	source: 'run',
	action: 'deploy',
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

const apartEvent = (over: Partial<FleetEvent>): FleetEvent => ({
	id: 1,
	node: 'tyo',
	app: 'tunnel',
	action: 'redeploy',
	source: { kind: 'panel' },
	outcome: 'succeeded',
	started_at: '2026-10-07T22:00:00Z',
	...over,
});

/** keeper's row for an act on host: one finished row, never running. */
const keeper = (outcome: string, detail: string, id: number) => ({
	id,
	app: 'host',
	action: 'redeploy',
	source: { kind: 'keeper' },
	outcome,
	stage: 'starting',
	image: outcome === 'failed' ? (null as unknown as undefined) : 'sha256:a',
	detail,
	started_at: '2026-10-08T03:00:00Z',
	finished_at: '2026-10-08T03:00:09Z',
});

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
		const seed = fromHistory(runs);
		expect(seed.map((one) => [one.run, one.node, one.outcome])).toEqual([
			[9, 'tyo', 'running'],
			[8, 'buf', 'failed'],
		]);
		expect(seed[1]?.stage).toBe('loading');
	});

	it('seeds what no run started too, each app on a node at its newest event', () => {
		const seed = fromHistory(
			[],
			[
				apartEvent({ id: 1, outcome: 'failed' }),
				apartEvent({ id: 2, outcome: 'running', stage: 'starting' }),
				apartEvent({ id: 7, node: 'nrt', app: 'web', action: 'rollback', outcome: 'failed' }),
			],
		);
		expect(seed.map((one) => [one.run, one.source, one.node, one.app, one.outcome])).toEqual([
			[undefined, 'panel', 'tyo', 'tunnel', 'running'],
			[undefined, 'panel', 'nrt', 'web', 'failed'],
		]);
	});

	it('reads every event a snapshot holds, a run or not', () => {
		const live = fromLive({
			tyo: held([{}, { source: { kind: 'upload' } }]),
			gvx: held([{ outcome: 'failed', stage: 'starting' }]),
		});
		expect(live.map((one) => [one.node, one.run, one.source, one.outcome, one.id])).toEqual([
			['tyo', 1, 'run', 'running', 1],
			['tyo', undefined, 'upload', 'running', 2],
			['gvx', 1, 'run', 'failed', 1],
		]);
	});

	it('groups what no run started by node, beside the runs, newest first', () => {
		const apart = (over: Partial<Step>) =>
			step({ run: undefined, source: 'panel', action: 'redeploy', ...over });
		const now = current(
			[],
			[
				step({ run: 4, node: 'gvx', started_at: '2026-10-07T21:00:00Z', id: 1 }),
				apart({ node: 'nrt', app: 'tunnel', started_at: '2026-10-07T22:00:00Z', id: 5 }),
				apart({
					node: 'nrt',
					app: 'caddy',
					action: 'restart',
					started_at: '2026-10-07T22:01:00Z',
					id: 6,
				}),
				apart({ node: 'rdu', app: 'host', source: 'keeper', action: 'deploy', id: 9 }),
				apart({ node: 'tyo', app: 'geo', outcome: 'failed', finished_at: '2026-10-07T23:00:00Z' }),
			],
		);
		expect(now.running.map((group) => [group.key, group.run, group.node])).toEqual([
			['node nrt', undefined, 'nrt'],
			['run 4', 4, undefined],
			['node rdu', undefined, 'rdu'],
		]);
		expect(now.running[0]?.steps.map((one) => one.app)).toEqual(['caddy', 'tunnel']);
		expect(now.failed.map((one) => [one.node, one.app, one.source])).toEqual([
			['tyo', 'geo', 'panel'],
		]);
	});

	it('keeps a by-hand step and a run of the same app on a node apart', () => {
		const now = current(
			[step({ run: 3, id: 1 })],
			[step({ run: undefined, source: 'panel', action: 'redeploy', id: 2 })],
		);
		expect(now.running.map((group) => group.key).toSorted()).toEqual(['node tyo', 'run 3']);
	});

	it("lists keeper's finished acts on host among the failures, never as deploying", () => {
		const live = fromLive({
			rdu: held([
				keeper('succeeded', "recreated from the image it runs, on the node's .env as it now is", 1),
			]),
			nrt: held([keeper('failed', 'the new host did not answer its health check', 1)]),
		});
		const now = current([], live);
		expect(now.running).toEqual([]);
		expect(now.failed.map((one) => [one.node, one.app, one.source, what(one)])).toEqual([
			['nrt', 'host', 'keeper', 'Redeploy by keeper'],
		]);
	});

	it('says what a step no run started is', () => {
		expect(what({ action: 'redeploy', source: 'panel' })).toBe('Redeploy');
		expect(what({ action: 'rollback_with_data', source: 'panel' })).toBe('Rollback with data');
		expect(what({ action: 'deploy', source: 'upload' })).toBe('Deploy of an upload');
		expect(what({ action: 'deploy', source: 'keeper' })).toBe('Deploy by keeper');
	});

	it('lets a snapshot overtake the seed, and the newer event win within a node', () => {
		const seed = [step({ node: 'tyo' }), step({ node: 'gvx', stage: 'downloading' })];
		const live = [
			step({ node: 'tyo', outcome: 'succeeded', id: 4 }),
			step({ node: 'gvx', stage: 'starting', id: 7 }),
			step({ node: 'gvx', stage: 'loading', id: 6 }),
		];
		const now = current(seed, live);
		expect(now.running).toEqual([{ key: 'run 1', run: 1, steps: [live[1]] }]);
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
