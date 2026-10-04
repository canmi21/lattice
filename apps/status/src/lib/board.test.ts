import type { StatusCheckRow, StatusNowRow } from '@monoflake/probe';
import { describe, expect, it } from 'vitest';
import {
	DAYS,
	dayColor,
	daysOf,
	historyCursor,
	historyFloor,
	key,
	mergeHistory,
	overallOf,
	SEGMENT_COUNT,
	SEGMENT_MS,
	segmentsOf,
	stateOf,
	windowAt,
} from './board.ts';
import { barsOf } from './ranges.ts';
import type { HistoryRow } from './rows.ts';

const CLOCK = Date.UTC(2026, 8, 29, 12, 10);

function round(at: number, ok = true, intervalSeconds = 5): StatusNowRow {
	return {
		checkId: 'health.geo',
		place: 'home',
		name: 'Geolocation',
		kind: 'health',
		target: 'API_PRIVATE/geo/health',
		intervalSeconds,
		at: new Date(at),
		ok,
		durationMs: 12,
		detail: ok ? null : 'status 502',
	};
}

function bucket(grain: string, at: number, passed: number, failed = 0): HistoryRow {
	return { checkId: 'health.geo', place: 'home', grain, bucketStart: new Date(at), passed, failed };
}

const check: StatusCheckRow = {
	id: 'health.geo',
	name: 'Geolocation',
	kind: 'health',
	target: 'API_PRIVATE/geo/health',
	place: 'home',
	intervalSeconds: 5,
	updatedAt: new Date(CLOCK),
};

describe('a check whose probe has gone quiet', () => {
	it('shows its last failure while the round is recent', () => {
		expect(stateOf(round(CLOCK - 10_000, false), CLOCK)).toBe('down');
	});

	// Three five-second rounds plus twenty seconds of slack: a failure seen 40 s ago is not
	// the check's state any more, it is the probe not reporting.
	it('is the probe silent once a few rounds have passed, not its last state', () => {
		expect(stateOf(round(CLOCK - 40_000, false), CLOCK)).toBe('silent');
	});

	it('makes the whole page silent when every check is', () => {
		const now = new Map([[key(check.id, check.place), round(CLOCK - 120_000)]]);
		expect(overallOf([check], now, CLOCK)).toEqual({
			state: 'silent',
			lastHeard: new Date(CLOCK - 120_000),
		});
	});
});

describe('the uptime bar', () => {
	const { start, open } = windowAt(CLOCK);

	it('spans the window, ending in the open segment', () => {
		const segments = segmentsOf([], CLOCK);
		expect(segments).toHaveLength(SEGMENT_COUNT);
		expect(segments.at(-1)?.start).toBe(open);
		expect(segments[0]?.start).toBe(start);
	});

	it('takes a rolled-up half-hour over the five-minute rows inside it', () => {
		const rows = [
			bucket('30m', start, 360),
			bucket('5m', start, 1, 59),
			bucket('5m', open, 50, 10),
			bucket('5m', open + 5 * 60_000, 60),
		];
		const segments = segmentsOf(rows, CLOCK);
		expect(segments[0]).toMatchObject({ passed: 360, failed: 0, state: 'up' });
		expect(segments.at(-1)).toMatchObject({ passed: 110, failed: 10, state: 'partial' });
	});
});

describe('history kept between reads', () => {
	it('drops what fell out of the window and keeps one row per bucket', () => {
		const { start } = windowAt(CLOCK);
		const held = [bucket('30m', start - SEGMENT_MS, 1), bucket('30m', start, 1)];
		const fresh = [bucket('30m', start, 2)];
		expect(mergeHistory(held, fresh, CLOCK)).toEqual([bucket('30m', start, 2)]);
	});

	it('asks for the floor bucket too when it holds nothing yet', () => {
		const floor = historyFloor(CLOCK);
		const cursor = historyCursor([], CLOCK);
		expect(cursor.segment < floor.segment).toBe(true);
		expect(cursor.tail < floor.tail).toBe(true);
	});
});

describe('daysOf', () => {
	const midnight = Date.UTC(2026, 8, 29);
	it('draws ninety days, oldest first, today from the live counts and gaps empty', () => {
		const days = daysOf(
			[{ day: midnight - 86_400_000, passed: 10, failed: 0 }],
			{ passed: 3, failed: 1 },
			CLOCK,
		);
		expect(days).toHaveLength(DAYS);
		expect(days.at(-1)).toMatchObject({ start: midnight, passed: 3, failed: 1, state: 'partial' });
		expect(days.at(-2)).toMatchObject({ passed: 10, state: 'up' });
		expect(days[0]).toMatchObject({ start: midnight - 89 * 86_400_000, state: 'none' });
	});
});

describe('dayColor', () => {
	const day = (passed: number, failed: number) => ({
		start: 0,
		passed,
		failed,
		state: 'up' as const,
	});
	it('is green with no downtime, and nothing for a day with no rounds', () => {
		expect(dayColor(day(100, 0), 5)).toBe('var(--color-green)');
		expect(dayColor(day(0, 0), 5)).toBeNull();
	});
	it('mixes toward amber in proportion to the minutes down, up to an hour', () => {
		// 12 rounds of 5 s is one minute: a sixtieth of the way to amber.
		expect(dayColor(day(100, 12), 5)).toBe(
			'color-mix(in oklch, var(--color-amber) 1.7%, var(--color-green))',
		);
		// 360 rounds of 5 s is half an hour: halfway.
		expect(dayColor(day(100, 360), 5)).toBe(
			'color-mix(in oklch, var(--color-amber) 50%, var(--color-green))',
		);
	});
	it('mixes amber toward red past the hour, and is red past twelve', () => {
		// 6 hours down: halfway from the hour to twelve.
		expect(dayColor(day(0, 4320), 5)).toBe(
			'color-mix(in oklch, var(--color-red) 45.5%, var(--color-amber))',
		);
		expect(dayColor(day(0, 20000), 5)).toBe('var(--color-red)');
	});
});

describe('barsOf', () => {
	const at = (minute: number) => new Date(Date.UTC(2026, 8, 29, 12, minute));
	const row = (grain: string, minute: number, passed: number, failed = 0) => ({
		checkId: 'health.geo',
		place: 'home',
		grain,
		bucketStart: at(minute),
		passed,
		failed,
	});
	it('counts a rolled-up minute once, and an unrolled one from raw or live, whichever holds more', () => {
		const bars = barsOf(
			'minutes',
			[
				row('1m', 5, 12),
				row('live', 5, 3), // inside a read minute: ignored
				row('raw', 7, 1),
				row('raw', 7, 1),
				row('live', 7, 5), // more than raw's two: stands
				row('raw', 8, 1, 1),
			],
			CLOCK,
		);
		const byMinute = (minute: number) => bars.find((bar) => bar.start === at(minute).getTime());
		expect(byMinute(5)).toMatchObject({ passed: 12, failed: 0 });
		expect(byMinute(7)).toMatchObject({ passed: 5 });
		expect(byMinute(8)).toMatchObject({ passed: 1, failed: 1, state: 'partial' });
		expect(bars).toHaveLength(DAYS);
		expect(bars.at(-1)!.start).toBe(at(10).getTime());
	});
});
