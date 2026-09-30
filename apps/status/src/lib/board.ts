/**
 * What the page concludes from the three views: each check's state, its uptime bar, and the one
 * line at the top. Pure, so the server's first screen and the browser's polling agree, and so the
 * rules are tested without a database. See spec/architecture/probe.md, "The page: one app, three
 * doors".
 */
import type { StatusCheckRow, StatusNowRow } from '@canmi/status-schema';
import type { HistoryRow } from './rows.ts';

const MINUTE = 60_000;

/** The bar covers a day, in half-hour segments: 48 stays legible on a phone. */
export const WINDOW_MS = 24 * 60 * MINUTE;
export const SEGMENT_MS = 30 * MINUTE;
export const SEGMENT_COUNT = WINDOW_MS / SEGMENT_MS;
/** The rollup grain a segment is, and the finer one filling segments not rolled up yet. */
export const SEGMENT_GRAIN = '30m';
export const TAIL_GRAIN = '5m';
export const TAIL_MS = 5 * MINUTE;
/**
 * Counts folded in from broadcasts, per five minutes, standing in for a `5m` row the page has not
 * read yet: a bucket the history view has answered for is taken from it instead.
 */
export const LIVE_GRAIN = 'live';

/**
 * A round older than this many of its intervals is the probe silent, not the check's state. The
 * slack covers the probe writing, and so broadcasting, in ten-second batches.
 */
export const SILENT_ROUNDS = 3;
export const SILENT_SLACK_MS = 20_000;

export const KINDS = ['health', 'api', 'dns', 'page'] as const;
export type Kind = (typeof KINDS)[number];

export type State = 'up' | 'down' | 'silent' | 'unknown';
export type SegmentState = 'up' | 'down' | 'partial' | 'none';

export interface Segment {
	start: number;
	passed: number;
	failed: number;
	state: SegmentState;
}

export function key(checkId: string, place: string): string {
	return `${checkId}\u0000${place}`;
}

/** The first segment's start and the open segment's start, both aligned to the grain. */
export function windowAt(clock: number): { start: number; open: number } {
	const open = Math.floor(clock / SEGMENT_MS) * SEGMENT_MS;
	return { start: open - (SEGMENT_COUNT - 1) * SEGMENT_MS, open };
}

/**
 * Where each grain's rows begin: rolled-up segments over the whole window, and the finer grain
 * from the segment before the open one, since a half-hour settles minutes after it closes.
 */
export function historyFloor(clock: number): { segment: Date; tail: Date } {
	const { start, open } = windowAt(clock);
	return { segment: new Date(start), tail: new Date(open - SEGMENT_MS) };
}

export function isSilent(row: StatusNowRow, clock: number): boolean {
	const limit = SILENT_ROUNDS * row.intervalSeconds * 1000 + SILENT_SLACK_MS;
	return clock - row.at.getTime() > limit;
}

export function stateOf(row: StatusNowRow | undefined, clock: number): State {
	if (!row) return 'unknown';
	if (isSilent(row, clock)) return 'silent';
	return row.ok ? 'up' : 'down';
}

function segmentState(passed: number, failed: number): SegmentState {
	if (passed + failed === 0) return 'none';
	if (failed === 0) return 'up';
	return passed === 0 ? 'down' : 'partial';
}

/**
 * One check's bar: a rolled-up half-hour where there is one, else the five-minute rows in it, each
 * five minutes read from the history view where it has answered and from broadcasts where not.
 */
export function segmentsOf(rows: readonly HistoryRow[], clock: number): Segment[] {
	const { start } = windowAt(clock);
	const rolled = new Map<number, HistoryRow>();
	const read = new Map<number, HistoryRow>();
	const heard = new Map<number, HistoryRow>();
	for (const row of rows) {
		const at = row.bucketStart.getTime();
		if (row.grain === SEGMENT_GRAIN) rolled.set(at, row);
		else if (row.grain === TAIL_GRAIN) read.set(at, row);
		else if (row.grain === LIVE_GRAIN) heard.set(at, row);
	}
	for (const [at, row] of heard) if (!read.has(at)) read.set(at, row);
	const tail = new Map<number, { passed: number; failed: number }>();
	for (const [at, row] of read) {
		const index = Math.floor((at - start) / SEGMENT_MS);
		if (index < 0 || index >= SEGMENT_COUNT) continue;
		const segment = start + index * SEGMENT_MS;
		const sum = tail.get(segment) ?? { passed: 0, failed: 0 };
		sum.passed += row.passed;
		sum.failed += row.failed;
		tail.set(segment, sum);
	}
	return Array.from({ length: SEGMENT_COUNT }, (_, index) => {
		const segment = start + index * SEGMENT_MS;
		const counts = rolled.get(segment) ?? tail.get(segment) ?? { passed: 0, failed: 0 };
		return {
			start: segment,
			passed: counts.passed,
			failed: counts.failed,
			state: segmentState(counts.passed, counts.failed),
		};
	});
}

/** Passed over asked across the bar, or null when nothing was asked in the window. */
export function uptimeOf(segments: readonly Segment[]): number | null {
	let passed = 0;
	let total = 0;
	for (const segment of segments) {
		passed += segment.passed;
		total += segment.passed + segment.failed;
	}
	return total === 0 ? null : passed / total;
}

/** New rows over old, keyed by what a row is, and nothing older than the window keeps. */
export function mergeHistory(
	held: readonly HistoryRow[],
	fresh: readonly HistoryRow[],
	clock: number,
): HistoryRow[] {
	const floor = historyFloor(clock);
	const byKey = new Map<string, HistoryRow>();
	for (const row of [...held, ...fresh]) {
		const since = row.grain === SEGMENT_GRAIN ? floor.segment : floor.tail;
		if (row.bucketStart < since) continue;
		byKey.set(
			`${key(row.checkId, row.place)}\u0000${row.grain}\u0000${row.bucketStart.getTime()}`,
			row,
		);
	}
	return [...byKey.values()];
}

/**
 * The newest bucket held of each grain, from which the next poll asks for what is newer. Holding
 * none, it is a moment before the floor, so the floor's own bucket is still asked for.
 */
export function historyCursor(
	held: readonly HistoryRow[],
	clock: number,
): { segment: Date; tail: Date } {
	const floor = historyFloor(clock);
	const cursor = {
		segment: new Date(floor.segment.getTime() - 1),
		tail: new Date(floor.tail.getTime() - 1),
	};
	for (const row of held) {
		if (row.grain === SEGMENT_GRAIN && row.bucketStart > cursor.segment) {
			cursor.segment = row.bucketStart;
		} else if (row.grain === TAIL_GRAIN && row.bucketStart > cursor.tail) {
			cursor.tail = row.bucketStart;
		}
	}
	return cursor;
}

export type Overall =
	| { state: 'up'; total: number }
	| { state: 'down'; failing: number; total: number }
	| { state: 'partial'; silent: number; total: number }
	| { state: 'silent'; lastHeard: Date | null }
	| { state: 'empty' };

export function overallOf(
	checks: readonly StatusCheckRow[],
	now: ReadonlyMap<string, StatusNowRow>,
	clock: number,
): Overall {
	if (checks.length === 0) return { state: 'empty' };
	let failing = 0;
	let silent = 0;
	let lastHeard: Date | null = null;
	for (const check of checks) {
		const row = now.get(key(check.id, check.place));
		if (row && (!lastHeard || row.at > lastHeard)) lastHeard = row.at;
		const state = stateOf(row, clock);
		if (state === 'down') failing += 1;
		else if (state !== 'up') silent += 1;
	}
	const total = checks.length;
	if (silent === total) return { state: 'silent', lastHeard };
	if (failing > 0) return { state: 'down', failing, total };
	if (silent > 0) return { state: 'partial', silent, total };
	return { state: 'up', total };
}

/** Checks by kind, in the order the page lists them; a kind the page does not know goes last. */
export function byKind(checks: readonly StatusCheckRow[]): [string, StatusCheckRow[]][] {
	const groups = new Map<string, StatusCheckRow[]>(KINDS.map((kind) => [kind, []]));
	for (const check of checks) {
		const group = groups.get(check.kind) ?? [];
		group.push(check);
		groups.set(check.kind, group);
	}
	return [...groups].filter(([, group]) => group.length > 0);
}

/** How many days a check's bar covers, one bar a day, oldest first. */
export const DAYS = 90;
const DAY_MS = 24 * 60 * MINUTE;

/** A day's counts, keyed by the UTC midnight it starts at. */
export interface DayCounts {
	day: number;
	passed: number;
	failed: number;
}

/**
 * The last `DAYS` UTC days, oldest first: past days from `days`, today from `today` -- the 24-hour
 * history already holds all of it -- and a day with neither empty.
 */
export function daysOf(
	days: readonly DayCounts[],
	today: { passed: number; failed: number },
	clock: number,
): Segment[] {
	const midnight = Math.floor(clock / DAY_MS) * DAY_MS;
	const byDay = new Map(days.map((row) => [row.day, row]));
	return Array.from({ length: DAYS }, (_, index) => {
		const day = midnight - (DAYS - 1 - index) * DAY_MS;
		const { passed, failed } = day === midnight ? today : (byDay.get(day) ?? { passed: 0, failed: 0 });
		return { start: day, passed, failed, state: segmentState(passed, failed) };
	});
}

/** What the 24-hour segments hold since today's UTC midnight. */
export function todayOf(segments: readonly Segment[], clock: number): { passed: number; failed: number } {
	const midnight = Math.floor(clock / DAY_MS) * DAY_MS;
	let passed = 0;
	let failed = 0;
	for (const segment of segments) {
		if (segment.start < midnight) continue;
		passed += segment.passed;
		failed += segment.failed;
	}
	return { passed, failed };
}
