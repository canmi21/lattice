import type { StatusCheckRow, StatusNowRow } from '@canmi/status-schema';
import { describe, expect, it } from 'vitest';
import { historyFloor, LIVE_GRAIN, mergeHistory, segmentsOf, TAIL_MS, windowAt } from './board.ts';
import { foldHistory, foldNow } from './fold.ts';
import { type Heard, type HistoryRow, readBroadcast } from './rows.ts';

const CLOCK = Date.UTC(2026, 8, 29, 12, 10);
const { open } = windowAt(CLOCK);

const check: StatusCheckRow = {
	id: 'health.geo',
	kind: 'health',
	target: 'API_PRIVATE/geo/health',
	place: 'home',
	intervalSeconds: 1,
	updatedAt: new Date(CLOCK),
};

function heard(at: number, passed = 10, failed = 0, checkId = check.id): Heard {
	return {
		checkId,
		place: 'home',
		at: new Date(at),
		ok: failed === 0,
		durationMs: 12,
		detail: failed === 0 ? null : 'status 502',
		passed,
		failed,
	};
}

function held(at: number, ok = true): StatusNowRow {
	return {
		checkId: check.id,
		place: 'home',
		kind: check.kind,
		target: check.target,
		intervalSeconds: check.intervalSeconds,
		at: new Date(at),
		ok,
		durationMs: 30,
		detail: null,
	};
}

function bucket(grain: string, at: number, passed: number, failed = 0): HistoryRow {
	return { checkId: check.id, place: 'home', grain, bucketStart: new Date(at), passed, failed };
}

describe('a broadcast read off the wire', () => {
	it('reads each entry as the row it names, with its times as dates', () => {
		const payload = {
			results: [
				{
					check_id: 'health.geo',
					place: 'home',
					at: '2026-09-29T12:09:58.123456+00:00',
					ok: false,
					duration_ms: 90,
					detail: 'status 502',
					passed: 9,
					failed: 1,
				},
			],
		};
		expect(readBroadcast(payload)).toEqual([
			{
				checkId: 'health.geo',
				place: 'home',
				at: new Date('2026-09-29T12:09:58.123Z'),
				ok: false,
				durationMs: 90,
				detail: 'status 502',
				passed: 9,
				failed: 1,
			},
		]);
	});

	it('hears nothing in a payload of another shape', () => {
		expect(readBroadcast(null)).toEqual([]);
		expect(readBroadcast({ results: 'no' })).toEqual([]);
	});
});

describe('the latest rounds, told', () => {
	it('takes a heard round over an older one, with the check filling in what it is', () => {
		const folded = foldNow([held(CLOCK - 20_000)], [heard(CLOCK - 1_000, 9, 1)], [check]);
		expect(folded.unknown).toBe(false);
		expect(folded.now).toEqual([
			{ ...held(CLOCK - 1_000, false), durationMs: 12, detail: 'status 502' },
		]);
	});

	it('keeps a newer round than the one heard', () => {
		const newer = held(CLOCK);
		expect(foldNow([newer], [heard(CLOCK - 1_000)], [check]).now).toEqual([newer]);
	});

	it('adds a check heard for the first time, when it is declared', () => {
		expect(foldNow([], [heard(CLOCK)], [check]).now).toHaveLength(1);
	});

	it('leaves out a check it has not been told is declared, and says so', () => {
		const folded = foldNow([held(CLOCK - 1_000)], [heard(CLOCK, 1, 0, 'dns.new')], [check]);
		expect(folded).toEqual({ now: [held(CLOCK - 1_000)], unknown: true });
	});
});

describe('the open half-hour, told', () => {
	it('adds each batch to the five minutes its latest round falls in', () => {
		const at = open + 2 * TAIL_MS + 30_000;
		let history: HistoryRow[] = [];
		history = foldHistory(history, [heard(at, 10)], CLOCK);
		history = foldHistory(history, [heard(at + 10_000, 8, 2)], CLOCK);
		expect(history).toEqual([bucket(LIVE_GRAIN, open + 2 * TAIL_MS, 18, 2)]);
	});

	it('fills the open segment on the bar alongside the five-minute rows read', () => {
		const history = foldHistory([bucket('5m', open, 300)], [heard(open + TAIL_MS, 10, 5)], CLOCK);
		expect(segmentsOf(history, CLOCK).at(-1)).toMatchObject({
			passed: 310,
			failed: 5,
			state: 'partial',
		});
	});

	it('gives way to the five-minute row once the history view has answered for it', () => {
		const history = foldHistory([], [heard(open, 10, 5)], CLOCK);
		const read = mergeHistory(history, [bucket('5m', open, 290, 10)], CLOCK);
		expect(segmentsOf(read, CLOCK).at(-1)).toMatchObject({ passed: 290, failed: 10 });
	});

	it('gives way to the rolled-up half-hour too', () => {
		const history = foldHistory([bucket('30m', open, 1800)], [heard(open, 10, 5)], CLOCK);
		expect(segmentsOf(history, CLOCK).at(-1)).toMatchObject({ passed: 1800, failed: 0 });
	});

	it('ignores a round older than the history it would count in, and ages out with it', () => {
		const floor = historyFloor(CLOCK).tail.getTime();
		expect(foldHistory([], [heard(floor - 1)], CLOCK)).toEqual([]);
		const history = foldHistory([], [heard(floor)], CLOCK);
		expect(mergeHistory(history, [], CLOCK + 2 * 30 * 60_000)).toEqual([]);
	});
});
