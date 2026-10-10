import { describe, expect, it } from 'vitest';
import type { FleetEvent } from '../server/fleet.ts';
import type { Node } from '../server/nodes.ts';
import { type Run, group } from '../server/runs.ts';
import { daily, within } from './daily.ts';
import {
	STAGES,
	depth,
	handCommand,
	markOf,
	matrix,
	nodeMark,
	runState,
	said,
	share,
} from './state.ts';
import { stirring } from './stir.ts';
import { FEW, STAGE_KEYS, segment, tracks } from './tracks.ts';

let ids = 0;
function at(node: Node, app: string, over: Partial<FleetEvent> = {}): FleetEvent {
	return {
		id: ++ids,
		node,
		app,
		action: 'deploy',
		source: { kind: 'run', run: 7, commit: 'abcdef123' },
		outcome: 'succeeded',
		stage: 'starting',
		started_at: '2026-10-05T10:00:00Z',
		finished_at: '2026-10-05T10:01:00Z',
		...over,
	};
}

/** Run 7: web everywhere it is placed, api on tyo only; nrt still loading web, buf skips. */
function run(): Run {
	const events = [
		at('tyo', 'web'),
		at('tyo', 'api', { outcome: 'failed', stage: 'admitting', detail: 'held' }),
		at('nrt', 'web', { outcome: 'running', stage: 'loading', finished_at: undefined }),
		at('buf', 'web', { outcome: 'skipped', stage: undefined, finished_at: undefined }),
	];
	const found = group(events).runs[0];
	if (!found) throw new Error('no run');
	return found;
}

const NONE = new Set<Node>();

describe('a node with a run', () => {
	it('is running before failed, at the least advanced stage still going', () => {
		const grouped = group([
			at('nrt', 'web', { outcome: 'running', stage: 'starting', finished_at: undefined }),
			at('nrt', 'api', { outcome: 'running', stage: 'downloading', finished_at: undefined }),
			at('nrt', 'db', { outcome: 'failed', stage: 'loading' }),
		]).runs[0] as Run;
		expect(nodeMark(grouped, 'nrt', NONE)).toEqual({
			node: 'nrt',
			mark: 'running',
			stage: 'downloading',
			placements: 3,
		});
	});

	it('is failed over succeeded, saying where it failed', () => {
		expect(nodeMark(run(), 'tyo', NONE)).toMatchObject({ mark: 'failed', stage: 'admitting' });
	});

	it('is absent where nothing was placed, unknown where the node did not answer', () => {
		expect(nodeMark(run(), 'bru', NONE).mark).toBe('absent');
		expect(nodeMark(run(), 'bru', new Set<Node>(['bru'])).mark).toBe('unknown');
		expect(nodeMark(run(), 'buf', NONE).mark).toBe('skipped');
	});
});

describe('a run', () => {
	it('is running while anything runs, then failed, then whether anything ran', () => {
		expect(runState(run())).toBe('running');
		const done = group([at('tyo', 'web'), at('gvx', 'web', { outcome: 'skipped' })]).runs[0];
		expect(done && runState(done)).toBe('succeeded');
		const skipped = group([at('gvx', 'web', { outcome: 'skipped' })]).runs[0];
		expect(skipped && runState(skipped)).toBe('skipped');
	});

	it('is a matrix of apps against every node, in the nodes given', () => {
		const rows = matrix(run(), ['tyo', 'nrt', 'bru'], new Set<Node>(['bru']));
		expect(rows.map((row) => row.map((cell) => `${cell.app}@${cell.node}:${cell.mark}`))).toEqual([
			['api@tyo:failed', 'api@nrt:absent', 'api@bru:unknown'],
			['web@tyo:succeeded', 'web@nrt:running', 'web@bru:unknown'],
		]);
		expect(rows[0]?.[0]?.placement?.detail).toBe('held');
	});
});

describe('words', () => {
	it('names a deploy by its stage, a failure by where, and an outcome host added as unknown', () => {
		expect(said('running', 'loading')).toBe('Loading');
		expect(said('failed', 'starting')).toBe('Failed starting');
		expect(said('absent')).toBe('Not placed');
		expect(markOf('vanished')).toBe('unknown');
		expect([depth('downloading'), depth('starting'), depth(undefined)]).toEqual([1, 4, 0]);
	});

	it('orders the stages a deploy beside its predecessor goes on to after the four every one passes', () => {
		expect(STAGES).toEqual([
			'downloading',
			'admitting',
			'loading',
			'starting',
			'checking',
			'switching',
			'draining',
		]);
		expect([depth('checking'), depth('switching'), depth('draining'), depth('later')]).toEqual([
			5, 6, 7, 0,
		]);
		expect([share('downloading'), share('draining'), share(undefined)]).toEqual([1 / 7, 1, 0]);
		expect(share('switching')).toBeGreaterThan(share('starting'));
		expect(said('running', 'switching')).toBe('Switching');
		expect(said('failed', 'checking')).toBe('Failed checking');
		expect(STAGE_KEYS.map((key) => key.label)).toEqual([
			'Downloading',
			'Admitting',
			'Loading',
			'Starting',
			'Checking',
			'Switching',
			'Draining',
		]);
		expect(new Set(STAGE_KEYS.map((key) => key.color)).size).toBe(STAGES.length);
	});

	it('says a skip left for the operator is waiting for them, and keeps the command', () => {
		const command = 'mise run node deploy tyo --run 41 --repository platform --app database';
		expect(handCommand('skipped', command)).toBe(command);
		expect(handCommand('skipped', 'architecture not built')).toBeUndefined();
		expect(handCommand('failed', command)).toBeUndefined();
		expect(said('skipped', undefined, command)).toBe('By hand');
		expect(said('skipped', undefined, 'placements exclude this node')).toBe('Skipped');
		expect(said('skipped')).toBe('Skipped');
	});
});

describe('the timeline', () => {
	it('draws a placement over its whole span in the stage it reached, and no skip', () => {
		const drawn = tracks(run(), ['tyo', 'nrt', 'buf']);
		expect(drawn.map((track) => track.label)).toEqual([
			'Tokyo (tyo) · api',
			'Tokyo (tyo) · web',
			'Tokyo (nrt) · web',
		]);
		const start = Date.parse('2026-10-05T10:00:00Z') / 1000;
		expect(drawn[0]?.stages).toEqual([
			{ stage: 'admitting', start, end: start + 60, failed: true },
		]);
		expect(drawn[2]?.stages[0]).toMatchObject({ stage: 'loading', end: undefined });
	});

	it('draws a deploy beside its predecessor in the stage it ended at, draining', () => {
		const beside = { ...run().placements[0]!, outcome: 'succeeded', stage: 'draining' };
		expect(segment(beside)).toMatchObject({ stage: 'draining', failed: false });
	});

	it('gives a success with no stage the last one, and a track per node when many', () => {
		expect(
			segment({ ...run().placements[0]!, outcome: 'succeeded', stage: undefined })?.stage,
		).toBe('starting');
		const many = group(
			Array.from({ length: FEW + 1 }, (_, index) => at(index % 2 ? 'tyo' : 'gvx', `app${index}`)),
		).runs[0] as Run;
		expect(tracks(many, ['tyo', 'gvx']).map((track) => track.key)).toEqual(['tyo', 'gvx']);
	});
});

describe('runs per day', () => {
	it('counts each run on its day in the zone, by state, with empty days kept', () => {
		const now = Date.parse('2026-10-06T12:00:00Z');
		const { categories, series } = daily([run()], now, 3, { name: 'UTC' });
		expect(categories).toEqual(['Oct 4', 'Oct 5', 'Oct 6']);
		expect(series.find((one) => one.key === 'running')?.values).toEqual([0, 1, 0]);
		// 02:00 UTC on the 5th is still the 4th in Honolulu.
		const early = group([at('tyo', 'web', { started_at: '2026-10-05T02:00:00Z' })]).runs as Run[];
		const west = daily(early, now, 3, { name: 'Pacific/Honolulu' });
		expect(west.categories).toEqual(['Oct 4', 'Oct 5', 'Oct 6']);
		expect(west.series.find((one) => one.key === 'succeeded')?.values).toEqual([1, 0, 0]);
		expect(within([run()], now, 24)).toBe(0);
		expect(within([run()], now, 48)).toBe(1);
	});
});

describe('the live store', () => {
	const held = (events: FleetEvent[]) => ({
		tyo: { version: 1, heard_at: '', snapshot: { taken_at: '', events, apps: [] } },
	});

	it('stirs on a run deploying or one newer than the page holds, and only that run if asked', () => {
		expect(stirring(held([at('tyo', 'web')]), 7)).toBe(false);
		expect(stirring(held([at('tyo', 'web')]), 6)).toBe(true);
		const going = held([at('tyo', 'web', { outcome: 'running', source: { kind: 'run', run: 5 } })]);
		expect(stirring(going, 7)).toBe(true);
		expect(stirring(going, 7, 7)).toBe(false);
		expect(stirring(held([at('tyo', 'web', { source: { kind: 'upload' } })]), undefined)).toBe(
			false,
		);
	});
});
