import { describe, expect, it } from 'vitest';
import type { History, Slot } from '../wire.ts';
import {
	type Verdict,
	asked,
	deployed,
	gathered,
	heard,
	merged,
	served,
	worse,
} from './history.ts';
import { DAY, HOUR } from './timeline.ts';

const MINUTE = 60_000;
const at = (ms: number) => new Date(ms).toISOString();

describe('a slot’s verdict', () => {
	it('takes services down by the share of the slot an app was down for', () => {
		const slot: Slot = { at: at(0), beats: 1200, due: 1200 };
		expect(served(slot)).toBe('fine');
		expect(served({ ...slot, down: { geo: 2 } })).toBe('fine');
		expect(served({ ...slot, down: { geo: 40 } })).toBe('degraded');
		expect(served({ ...slot, down: { geo: 600 } })).toBe('down');
		expect(served({ ...slot, down: { geo: 600, mail: 1 } }, 'mail')).toBe('fine');
		expect(served({ at: at(0) })).toBe('none');
	});

	it('takes an unheard node as lost unless it said it was leaving', () => {
		const slot: Slot = { at: at(0), beats: 1200, due: 1200 };
		expect(heard(slot)).toBe('fine');
		expect(heard({ ...slot, missing: 1 })).toBe('degraded');
		expect(heard({ ...slot, missing: 5 })).toBe('down');
		expect(heard({ ...slot, missing: 5, announced: 5, leaving: 1 })).toBe('planned');
		expect(heard({ at: at(0) })).toBe('none');
	});

	it('reads a deploy’s outcome, and the worst of several', () => {
		expect(deployed('running')).toBe('planned');
		expect(deployed('mixed')).toBe('degraded');
		expect(deployed('failed')).toBe('down');
		expect(deployed(undefined)).toBe('none');
		const verdicts: Verdict[] = ['fine', 'planned', 'down', 'degraded'];
		expect(verdicts.reduce(worse, 'none')).toBe('down');
	});
});

describe('history gathered to a row', () => {
	it('sums counts, keeps the worst round trip and averages the mean', () => {
		const one = merged([
			{
				at: at(0),
				beats: 20,
				due: 20,
				down: { geo: 3 },
				round_trip: { rdu: { mean: 0.1, worst: 0.2 } },
			},
			{
				at: at(MINUTE),
				beats: 10,
				due: 20,
				missing: 1,
				down: { geo: 2 },
				round_trip: { rdu: { mean: 0.3, worst: 0.5 } },
			},
		]);
		expect(one).toMatchObject({ beats: 30, due: 40, missing: 1, down: { geo: 5 } });
		expect(one?.round_trip?.rdu?.worst).toBe(0.5);
		expect(one?.round_trip?.rdu?.mean).toBeCloseTo(0.2);
	});

	it('puts each slot where the part of it inside the span falls, the last running past now', () => {
		const now = 10 * HOUR + 30 * MINUTE;
		const history: History = {
			version: 1,
			node: 'rdu',
			from: at(0),
			until: at(now),
			slot: 3600,
			nodes: {
				rdu: [
					{ at: at(8 * HOUR), beats: 1 },
					{ at: at(10 * HOUR), beats: 2 },
				],
			},
		};
		const row = gathered(history, 'rdu', now, 3 * HOUR, 3);
		expect(row.map((one) => one?.beats)).toEqual([undefined, 1, 2]);
	});

	it('asks a span at its finest slot, the span a whole number of them', () => {
		expect(asked('24h')).toEqual({ span: 86_400, slot: 300 });
		expect(asked('1y')).toEqual({ span: (365 * DAY) / 1000, slot: 86_400 });
	});
});
