/**
 * What a broadcast changes: each check's latest round, and the counts in the five minutes it
 * falls in. Pure, beside board.ts, so what the page is told is tested without a socket. See
 * spec/architecture/probe.md, "The page reads PostgREST with the anon key, from views alone, once;
 * after that it is told".
 */
import type { StatusCheckRow, StatusNowRow } from '@monoflake/status-schema';
import { historyFloor, key, LIVE_GRAIN, LIVE_MS } from './board.ts';
import type { Heard, HistoryRow } from './rows.ts';

/**
 * Each heard round over the one held for its check, unless the held one is newer. A check the page
 * has not been told is declared is left out and reported, so the declared checks can be asked for.
 */
export function foldNow(
	held: readonly StatusNowRow[],
	heard: readonly Heard[],
	checks: readonly StatusCheckRow[],
): { now: StatusNowRow[]; unknown: boolean } {
	const declared = new Map(checks.map((check) => [key(check.id, check.place), check]));
	const byKey = new Map(held.map((row) => [key(row.checkId, row.place), row]));
	let unknown = false;
	for (const round of heard) {
		const at = key(round.checkId, round.place);
		const check = declared.get(at);
		if (!check) {
			unknown = true;
			continue;
		}
		const last = byKey.get(at);
		if (last && last.at > round.at) continue;
		byKey.set(at, {
			checkId: round.checkId,
			place: round.place,
			name: check.name,
			kind: check.kind,
			target: check.target,
			intervalSeconds: check.intervalSeconds,
			at: round.at,
			ok: round.ok,
			durationMs: round.durationMs,
			detail: round.detail,
		});
	}
	return { now: [...byKey.values()], unknown };
}

function liveKey(checkId: string, place: string, at: number): string {
	return `${key(checkId, place)}\u0000${at}`;
}

/**
 * Adds each heard batch's counts to its check's `live` row for the minute its latest round falls
 * in. A batch spans ten seconds, so the few rounds of one that crossed into the next minute are
 * counted in it -- the price of a broadcast carrying counts rather than every round.
 */
export function foldHistory(
	held: readonly HistoryRow[],
	heard: readonly Heard[],
	clock: number,
): HistoryRow[] {
	const floor = historyFloor(clock).tail.getTime();
	const live = new Map<string, HistoryRow>();
	const rest: HistoryRow[] = [];
	for (const row of held) {
		if (row.grain === LIVE_GRAIN) {
			live.set(liveKey(row.checkId, row.place, row.bucketStart.getTime()), row);
		} else {
			rest.push(row);
		}
	}
	for (const round of heard) {
		const bucket = Math.floor(round.at.getTime() / LIVE_MS) * LIVE_MS;
		if (bucket < floor) continue;
		const at = liveKey(round.checkId, round.place, bucket);
		const last = live.get(at);
		live.set(at, {
			checkId: round.checkId,
			place: round.place,
			grain: LIVE_GRAIN,
			bucketStart: new Date(bucket),
			passed: (last?.passed ?? 0) + round.passed,
			failed: (last?.failed ?? 0) + round.failed,
		});
	}
	return [...rest, ...live.values()];
}
