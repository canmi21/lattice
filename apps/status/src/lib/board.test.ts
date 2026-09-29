import type { StatusCheckRow, StatusNowRow } from '@canmi/status-schema';
import { describe, expect, it } from 'vitest';
import {
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
import type { HistoryRow } from './rows.ts';

const CLOCK = Date.UTC(2026, 8, 29, 12, 10);

function round(at: number, ok = true, intervalSeconds = 5): StatusNowRow {
	return {
		checkId: 'health.geo',
		place: 'home',
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

describe('history kept between polls', () => {
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
