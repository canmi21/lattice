import { describe, expect, it } from 'vitest';
import type { Step } from './moving.ts';
import {
	DAY,
	GAP,
	SHADES,
	SLOT,
	WEEK,
	type Cell,
	cells,
	fit,
	marks,
	shades,
	slots,
	slotsIn,
} from './timeline.ts';

const NOW = Date.parse('2026-10-09T12:00:00Z');
const at = (hoursAgo: number) => new Date(NOW - hoursAgo * 3_600_000).toISOString();
const step = (over: Partial<Step>): Step => ({
	source: 'run',
	run: 7,
	action: 'deploy',
	node: 'tyo',
	app: 'relay',
	outcome: 'succeeded',
	started_at: at(6),
	finished_at: at(5.99),
	...over,
});

/** A slot of `runs` runs of one outcome. */
const slot = (runs: number, outcome: Cell['outcome'] = 'succeeded'): Cell => ({
	key: `${runs} ${outcome}`,
	node: 'tyo',
	index: runs,
	of: 168,
	outcome,
	marks: Array.from({ length: runs }, () => marks([step({})], NOW)[0]!),
});

describe('timeline', () => {
	it('places a run by its start and end as shares of the day', () => {
		const [mark] = marks([step({})], NOW);
		expect(mark?.from).toBeCloseTo(18 / 24);
		expect(mark?.to).toBeCloseTo((24 - 5.99) / 24);
	});

	it('draws one mark a run a node, however many apps, the worst of them', () => {
		const drawn = marks(
			[
				step({ app: 'relay' }),
				step({
					app: 'geo',
					outcome: 'failed',
					detail: 'gone',
					started_at: at(5.9),
					finished_at: at(5.8),
				}),
				step({ node: 'nrt' }),
			],
			NOW,
		);
		expect(drawn).toHaveLength(2);
		expect(drawn.find((one) => one.node === 'tyo')).toMatchObject({
			apps: ['relay', 'geo'],
			outcome: 'mixed',
			detail: 'gone',
		});
	});

	it('runs a mark that goes to now, and draws no skip', () => {
		const drawn = marks(
			[
				step({ outcome: 'running', finished_at: undefined }),
				step({ outcome: 'skipped', node: 'gvx' }),
			],
			NOW,
		);
		expect(drawn).toHaveLength(1);
		expect(drawn[0]).toMatchObject({ outcome: 'running', to: 1 });
	});

	it('leaves out what ended before the span, and clamps what started before it', () => {
		const drawn = marks(
			[
				step({ started_at: at(30), finished_at: at(29) }),
				step({ run: 8, started_at: at(25), finished_at: at(23) }),
			],
			NOW,
			DAY,
		);
		expect(drawn.map((one) => [one.run, one.from])).toEqual([[8, 0]]);
	});

	it('gathers a week into an hour a cell, mixed where one run failed and one did not', () => {
		const drawn = marks(
			[
				step({ run: 1, started_at: at(10), finished_at: at(9.99) }),
				step({ run: 2, started_at: at(9.8), outcome: 'failed' }),
			],
			NOW,
			WEEK,
		);
		const gathered = cells(drawn, 168);
		expect(gathered).toHaveLength(1);
		expect(gathered[0]).toMatchObject({ outcome: 'mixed', index: 158 });
		expect(gathered[0]?.marks).toHaveLength(2);
	});

	it('lays a line out as every slot of its span, the middle length before the width is known', () => {
		expect(slotsIn('24h')).toBe(72);
		expect(slotsIn('7d')).toBe(56);
		const drawn = marks([step({ started_at: at(1), finished_at: at(0.99) })], NOW, DAY);
		const line = slots(drawn, 96);
		expect(line).toHaveLength(96);
		expect(line.filter(Boolean)).toHaveLength(1);
		expect(line[92]?.outcome).toBe('succeeded');
	});

	it('fits the finest count of slots the width holds, stretching the gap and then the slots', () => {
		const roomy = fit('7d', 1400);
		expect(roomy.of).toBe(336);
		const narrow = fit('7d', 600);
		expect(narrow.of).toBe(84);
		for (const one of [roomy, narrow, fit('24h', 700), fit('24h', 300), fit('1y', 900)]) {
			expect(one.gap).toBeGreaterThanOrEqual(GAP.min);
			expect(one.gap).toBeLessThanOrEqual(GAP.max);
			expect(one.slot).toBeGreaterThanOrEqual(SLOT.min);
			expect(one.slot).toBeLessThanOrEqual(SLOT.max);
		}
		expect(narrow.of * narrow.slot + (narrow.of - 1) * narrow.gap).toBeLessThanOrEqual(600.001);
	});

	it('shades a slot by its rank among its outcome, so one busy hour does not pale the rest', () => {
		const row = [slot(1), slot(2), slot(3), slot(40), undefined, slot(1, 'failed')];
		const shaded = shades(row);
		expect(shaded.get(row[3] as Cell)).toBe(SHADES);
		expect(shaded.get(row[2] as Cell)).toBeGreaterThan(5);
		expect(shaded.get(row[0] as Cell)).toBeLessThan(shaded.get(row[1] as Cell) ?? 0);
		// A lone failure is the darkest of the failures, ranked apart from the done.
		expect(shaded.get(row[5] as Cell)).toBe(SHADES);
	});
});
