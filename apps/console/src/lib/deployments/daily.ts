/**
 * Runs per day by how they ended, on the reader's own calendar, and the counts the tiles show.
 * Days are cut at midnight in `zone`, each run on the day its first placement started.
 */
import type { Bars } from '../chart/bar-chart.svelte';
import { offset, type Zone } from '../chart/series.ts';
import type { Run } from '../server/runs.ts';
import { type RunState, runState, said } from './state.ts';

const DAY = 86_400;

/** The states a day's bar stacks, in the order they stack, each in its state's tone. */
const STACKED: { state: RunState; color: string }[] = [
	{ state: 'succeeded', color: 'var(--color-good)' },
	{ state: 'failed', color: 'var(--color-danger)' },
	{ state: 'skipped', color: 'var(--color-text-faint)' },
	{ state: 'running', color: 'var(--color-busy)' },
];

const label = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

/** Whole days since the epoch on `zone`'s calendar. */
function dayOf(at: number, zone: Zone): number {
	return Math.floor((at + offset(at, zone)) / DAY);
}

/** The last `days` days to `now` in milliseconds, oldest first, as a stacked bar's input. */
export function daily(
	runs: Run[],
	now: number,
	days: number,
	zone: Zone,
): { categories: string[]; series: Bars[] } {
	const today = dayOf(now / 1000, zone);
	const first = today - days + 1;
	const counts = STACKED.map(() => Array.from({ length: days }, () => 0));
	for (const run of runs) {
		const index = dayOf(Date.parse(run.first_start) / 1000, zone) - first;
		const row = counts[STACKED.findIndex(({ state }) => state === runState(run))];
		if (row && index >= 0 && index < days) row[index] = (row[index] ?? 0) + 1;
	}
	return {
		categories: Array.from({ length: days }, (_, at) => label.format((first + at) * DAY * 1000)),
		series: STACKED.map(({ state, color }, at) => ({
			key: state,
			label: said(state),
			color,
			values: counts[at] ?? [],
		})),
	};
}

/** Runs whose first placement started in the `hours` before `now`, in milliseconds. */
export function within(runs: Run[], now: number, hours: number): number {
	return runs.filter((run) => now - Date.parse(run.first_start) < hours * 3_600_000).length;
}
