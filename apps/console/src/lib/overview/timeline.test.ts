import { describe, expect, it } from 'vitest';
import type { Step } from './moving.ts';
import { DAY, marks } from './timeline.ts';

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

describe('timeline', () => {
	it('places a step by its start and end as shares of the day', () => {
		const [mark] = marks([step({})], NOW);
		expect(mark?.from).toBeCloseTo(18 / 24);
		expect(mark?.to).toBeCloseTo((24 - 5.99) / 24);
	});

	it('runs a step that goes to now, and draws no skip', () => {
		const drawn = marks(
			[step({ outcome: 'running', finished_at: undefined }), step({ outcome: 'skipped' })],
			NOW,
		);
		expect(drawn).toHaveLength(1);
		expect(drawn[0]).toMatchObject({ outcome: 'running', to: 1 });
	});

	it('leaves out what ended before the day, and clamps what started before it', () => {
		const drawn = marks(
			[
				step({ started_at: at(30), finished_at: at(29) }),
				step({ started_at: at(25), finished_at: at(23), app: 'geo' }),
			],
			NOW,
			DAY,
		);
		expect(drawn.map((one) => [one.app, one.from])).toEqual([['geo', 0]]);
	});

	it('orders the oldest first, so the newest is drawn over it', () => {
		const drawn = marks(
			[step({ started_at: at(1) }), step({ started_at: at(9), app: 'geo' })],
			NOW,
		);
		expect(drawn.map((one) => one.app)).toEqual(['geo', 'relay']);
	});
});
