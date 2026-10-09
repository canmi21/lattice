import { describe, expect, it } from 'vitest';
import { EMPTY, merge, mergeCluster } from './view.ts';
import type { Held } from './wire.ts';

function held(version: number, app = 'geo'): Held {
	const deployed = { image: `${app}:1`, deployed_at: '2026-10-06T11:00:00Z' };
	return {
		version,
		heard_at: '2026-10-06T12:00:00Z',
		snapshot: {
			taken_at: '2026-10-06T12:00:00Z',
			events: [],
			apps: [{ name: app, ...deployed, running: true, held: false }],
		},
	};
}

describe('merge', () => {
	it('takes a newer version of a node and drops an older one arriving late', () => {
		const first = merge(EMPTY, { type: 'node', node: 'tyo', state: held(200) });
		const late = merge(first, { type: 'node', node: 'tyo', state: held(100, 'apt') });
		expect(late.nodes.tyo?.version).toBe(200);
		expect(late.nodes.tyo?.snapshot?.apps[0]?.name).toBe('geo');
		const newer = merge(late, { type: 'node', node: 'tyo', state: held(300, 'apt') });
		expect(newer.nodes.tyo?.snapshot?.apps[0]?.name).toBe('apt');
	});

	it('leaves the view as it was when nothing offered is newer, so nothing repaints', () => {
		const view = merge(EMPTY, { type: 'node', node: 'tyo', state: held(200) });
		expect(merge(view, { type: 'node', node: 'tyo', state: held(200) })).toBe(view);
	});

	it('takes the same version again where its state moved, as time alone moves it', () => {
		const view = merge(EMPTY, {
			type: 'node',
			node: 'tyo',
			state: { ...held(200), state: 'live' },
		});
		const late = merge(view, { type: 'node', node: 'tyo', state: { ...held(200), state: 'late' } });
		expect(late.nodes.tyo?.state).toBe('late');
		expect(merge(late, { type: 'node', node: 'tyo', state: { ...held(200), state: 'late' } })).toBe(
			late,
		);
		expect(
			merge(late, { type: 'node', node: 'tyo', state: { ...held(100), state: 'live' } }).nodes.tyo
				?.state,
		).toBe('late');
	});

	it('takes a peer its relay has not heard as its state alone, keeping what was held of it', () => {
		const waiting = merge(EMPTY, { type: 'node', node: 'rdu', state: { state: 'waiting' } });
		expect(waiting.nodes.rdu).toEqual({ state: 'waiting' });
		const heard = merge(waiting, { type: 'node', node: 'rdu', state: held(100) });
		expect(heard.nodes.rdu?.version).toBe(100);
		// A relay just started has not heard it yet: the snapshot stays, under the relay's word.
		const again = merge(heard, { type: 'node', node: 'rdu', state: { state: 'waiting' } });
		expect(again.nodes.rdu?.version).toBe(100);
		expect(again.nodes.rdu?.state).toBe('waiting');
		expect(merge(again, { type: 'node', node: 'rdu', state: { state: 'waiting' } })).toBe(again);
	});

	it('takes from a cluster only what it holds newer, and keeps nodes it does not name', () => {
		let view = merge(EMPTY, { type: 'node', node: 'tyo', state: held(500) });
		view = merge(view, { type: 'node', node: 'rdu', state: held(100) });
		// A relay that fell behind on tyo and has not heard of rdu at all, as after a reconnect.
		view = merge(view, {
			type: 'cluster',
			version: 1,
			node: 'gvx',
			nodes: { tyo: held(400, 'apt'), gvx: held(50) },
		});
		expect(view.nodes.tyo?.version).toBe(500);
		expect(view.nodes.rdu?.version).toBe(100);
		expect(view.nodes.gvx?.version).toBe(50);
		expect(view.via).toBe('gvx');
	});

	it('reads no cluster of another contract, and says so', () => {
		const view = mergeCluster(EMPTY, { version: 2, node: 'tyo', nodes: { tyo: held(1) } });
		expect(view.nodes).toEqual({});
		expect(view.refused).toBe(2);
		expect(mergeCluster(view, { version: 1, node: 'tyo', nodes: {} }).refused).toBeUndefined();
	});
});
