/**
 * What a bar spans, chosen by one switch over the page. See spec/architecture/probe.md, "One switch
 * over the page sets what a bar is: a day, fifteen minutes, or a minute".
 */
import { DAYS, LIVE_GRAIN, type Segment } from './board.ts';
import type { HistoryRow } from './rows.ts';

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

export const RANGES = ['days', 'hours', 'minutes'] as const;
export type Range = (typeof RANGES)[number];

/** A bar's length, and for the two finer ranges the rollup grain read to fill it. */
export const SPAN: Record<Range, { unit: number; grain: string | null; label: string }> = {
	days: { unit: DAY, grain: null, label: 'Days' },
	hours: { unit: 15 * MINUTE, grain: '5m', label: 'Hours' },
	minutes: { unit: MINUTE, grain: '1m', label: 'Minutes' },
};

const GRAIN_MS: Record<string, number> = { '5m': 5 * MINUTE, '1m': MINUTE };
/** A round as the history view names it, kept ten minutes. */
export const RAW_GRAIN = 'raw';
const RAW_KEPT_MS = 10 * MINUTE;

export function readRange(value: string | null): Range {
	return (RANGES as readonly string[]).includes(value ?? '') ? (value as Range) : 'days';
}

/** The earliest bucket start a finer range reads, for `DAYS` bars ending at the open one. */
/** Where raw rounds are read from: the last ten minutes, or the range's start if later. */
export function rawFloor(range: Range, clock: number): number {
	return Math.max(rangeFloor(range, clock), clock - RAW_KEPT_MS);
}

export function rangeFloor(range: Range, clock: number): number {
	const { unit } = SPAN[range];
	return Math.floor(clock / unit) * unit - (DAYS - 1) * unit;
}

/**
 * `DAYS` bars of a finer range, oldest first. Each rollup bucket read counts whole; a minute inside
 * one not yet rolled up counts its raw rounds or what the broadcasts carried, whichever holds more
 * -- one source a minute, never two.
 */
export function barsOf(range: Range, rows: readonly HistoryRow[], clock: number): Segment[] {
	const { unit, grain } = SPAN[range];
	const size = GRAIN_MS[grain ?? ''] ?? unit;
	const first = rangeFloor(range, clock);
	const sums = new Map<number, { passed: number; failed: number }>();
	const add = (at: number, passed: number, failed: number) => {
		const bar = Math.floor(at / unit) * unit;
		if (bar < first) return;
		const sum = sums.get(bar) ?? { passed: 0, failed: 0 };
		sum.passed += passed;
		sum.failed += failed;
		sums.set(bar, sum);
	};
	const read = new Set<number>();
	for (const row of rows) {
		if (row.grain !== grain) continue;
		read.add(row.bucketStart.getTime());
		add(row.bucketStart.getTime(), row.passed, row.failed);
	}
	const raw = new Map<number, { passed: number; failed: number }>();
	const live = new Map<number, { passed: number; failed: number }>();
	for (const row of rows) {
		const source = row.grain === RAW_GRAIN ? raw : row.grain === LIVE_GRAIN ? live : undefined;
		if (!source) continue;
		const at = row.bucketStart.getTime();
		if (read.has(Math.floor(at / size) * size)) continue;
		const minute = Math.floor(at / MINUTE) * MINUTE;
		const sum = source.get(minute) ?? { passed: 0, failed: 0 };
		sum.passed += row.passed;
		sum.failed += row.failed;
		source.set(minute, sum);
	}
	// The open minute is in both, raw as of the last read and live since: the fuller one stands.
	for (const [minute, sum] of live) {
		const read = raw.get(minute);
		if (!read || sum.passed + sum.failed > read.passed + read.failed) raw.set(minute, sum);
	}
	for (const [minute, sum] of raw) add(minute, sum.passed, sum.failed);
	return Array.from({ length: DAYS }, (_, index) => {
		const start = first + index * unit;
		const { passed, failed } = sums.get(start) ?? { passed: 0, failed: 0 };
		const state =
			passed + failed === 0 ? 'none' : failed === 0 ? 'up' : passed === 0 ? 'down' : 'partial';
		return { start, passed, failed, state };
	});
}

/** The words under a row: how far back the first shown bar is, for `count` bars. */
export function sinceLabel(range: Range, count: number): string {
	const minutes = (count * SPAN[range].unit) / MINUTE;
	if (range === 'days') return `${count} days ago`;
	if (range === 'minutes') return `${minutes} minutes ago`;
	return `${minutes / 60} hours ago`;
}
