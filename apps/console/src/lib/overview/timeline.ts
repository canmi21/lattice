/**
 * The overview's week as a row of slots a node, a status page's: each run that did something on a
 * node in the span is one mark however many of its apps it placed there, and the marks are
 * gathered into the slot each started in, an hour over a week and a quarter over a day; a slot
 * with none is empty. A skip draws nothing. See spec/console/overview.md, "The week is a line a
 * node".
 */
import type { Step } from './moving.ts';

export const DAY = 86_400_000;
export const WEEK = 7 * DAY;
export const HOUR = 3_600_000;
/** How many slots a span may be drawn in, the finest first: each a whole number of minutes. */
const COUNTS = {
	day: [144, 96, 72, 48, 24],
	week: [336, 168, 84, 56, 42, 28],
} as const;

/** A slot's width and the gap between two, each in pixels, as far as each may stretch. */
export const SLOT = { min: 3, max: 8 } as const;
export const GAP = { min: 1, max: 3 } as const;

/** How many slots `span` is drawn in before its width is known: an hour each, or a quarter. */
export const slotsIn = (span: number): number => (span > DAY ? 168 : 96);

/**
 * The slots `span` is drawn in across `width` pixels: the finest count whose slots, at their
 * narrowest and closest, still fit, then a width and a gap within their bounds that fill it -- the
 * slots widening first, and the gap after them. Where even the coarsest count does not fit at its
 * narrowest, that count, overflowing; where the finest stops short at its widest, that count,
 * short of the edge.
 */
export function fit(span: number, width: number): { of: number; slot: number; gap: number } {
	const counts = span > DAY ? COUNTS.week : COUNTS.day;
	const of =
		counts.find((count) => count * SLOT.min + (count - 1) * GAP.min <= width) ?? counts.at(-1) ?? 1;
	// The slots as wide as the row allows at the closest gap, then the gap as wide as what is left.
	const slot = Math.max(SLOT.min, Math.min(SLOT.max, (width - (of - 1) * GAP.min) / of));
	const gap = Math.max(GAP.min, Math.min(GAP.max, (width - of * slot) / Math.max(1, of - 1)));
	return { of, slot, gap };
}

/** What became of a run on a node, or of a slot's runs: `mixed` where some failed, some not. */
export type Outcome = 'running' | 'failed' | 'mixed' | 'succeeded';

export interface Mark {
	key: string;
	node: string;
	/** What it placed on the node, in the order its steps came. */
	apps: string[];
	run?: number;
	outcome: Outcome;
	/** Where it starts on the line, 0 the span's start and 1 now. */
	from: number;
	/** Where it ends: its last finish, or now while any of it goes. */
	to: number;
	started_at: string;
	finished_at?: string;
	detail?: string;
}

/**
 * What `outcomes` come to together: going while any goes, failed where all that ended failed,
 * done where none did, and mixed where some of each.
 */
function together(outcomes: readonly Outcome[]): Outcome {
	if (outcomes.includes('running')) return 'running';
	const failed = outcomes.some((one) => one === 'failed' || one === 'mixed');
	const done = outcomes.some((one) => one === 'succeeded' || one === 'mixed');
	if (failed && done) return 'mixed';
	return failed ? 'failed' : 'succeeded';
}

const outcomeOf = (step: Step): Outcome =>
	step.outcome === 'running' || step.outcome === 'failed' ? step.outcome : 'succeeded';

const share = (at: number, start: number, span: number) =>
	Math.min(1, Math.max(0, (at - start) / span));

/** `steps` as a mark a run a node over the `span` ending at `now`, oldest first. */
export function marks(steps: readonly Step[], now: number, span = DAY): Mark[] {
	const start = now - span;
	const gathered = new Map<string, Step[]>();
	for (const step of steps) {
		if (step.outcome === 'skipped') continue;
		// What no run started is its own mark, by its app and its moment.
		const key =
			step.run === undefined
				? `${step.source} ${step.node} ${step.app} ${step.started_at}`
				: `run ${step.run} ${step.node}`;
		gathered.set(key, [...(gathered.get(key) ?? []), step]);
	}
	return [...gathered]
		.flatMap(([key, group]): Mark[] => {
			const outcome = together(group.map(outcomeOf));
			const began = Math.min(...group.map((one) => Date.parse(one.started_at)));
			const finishes = group.map((one) => Date.parse(one.finished_at ?? one.started_at));
			const ended = outcome === 'running' ? now : Math.max(...finishes);
			if (Number.isNaN(began) || ended < start || began > now) return [];
			const first = group[0] as Step;
			const failed = group.find((one) => one.outcome === 'failed');
			return [
				{
					key,
					node: first.node,
					apps: [...new Set(group.map((one) => one.app))],
					...(first.run === undefined ? {} : { run: first.run }),
					outcome,
					from: share(began, start, span),
					to: share(ended, start, span),
					started_at: new Date(began).toISOString(),
					...(outcome === 'running' ? {} : { finished_at: new Date(ended).toISOString() }),
					...(failed?.detail ? { detail: failed.detail } : {}),
				},
			];
		})
		.toSorted((a, b) => a.from - b.from);
}

/** An hour of one node's line, and the marks that started in it. */
export interface Cell {
	key: string;
	node: string;
	/** Which of the span's cells, from 0 at its start. */
	index: number;
	/** Out of how many the span holds. */
	of: number;
	outcome: Outcome;
	marks: Mark[];
}

/** `drawn` gathered into the `of` cells of their span, a cell by where each mark starts. */
export function cells(drawn: readonly Mark[], of: number): Cell[] {
	const gathered = new Map<string, Mark[]>();
	for (const mark of drawn) {
		const index = Math.min(of - 1, Math.floor(mark.from * of));
		const key = `${mark.node} ${index}`;
		gathered.set(key, [...(gathered.get(key) ?? []), mark]);
	}
	return [...gathered].map(([key, its]) => ({
		key,
		node: (its[0] as Mark).node,
		index: Math.min(of - 1, Math.floor((its[0] as Mark).from * of)),
		of,
		outcome: together(its.map((one) => one.outcome)),
		marks: its,
	}));
}

/** Every one of the `of` slots of a line drawn from `drawn`, oldest first, one with none empty. */
export function slots(drawn: readonly Mark[], of: number): (Cell | undefined)[] {
	const filled = new Map(cells(drawn, of).map((cell) => [cell.index, cell]));
	return Array.from({ length: of }, (_, index) => filled.get(index));
}

/** How many shades a slot's color comes in, its runs' count ranked among the others'. */
export const SHADES = 10;

/**
 * Each filled slot's shade, 1 to `SHADES`, by where its count of runs ranks among the slots of the
 * same outcome: the share of them holding as many or fewer, taken in tenths. Ranked rather than
 * measured against the busiest, so one hour of forty deploys is the darkest without washing every
 * other out to the palest; and equal counts share a shade. See spec/console/overview.md, "The
 * week is a line a node".
 */
export function shades(row: readonly (Cell | undefined)[]): Map<Cell, number> {
	const filled = row.filter((one): one is Cell => one !== undefined);
	const shaded = new Map<Cell, number>();
	for (const outcome of new Set(filled.map((one) => one.outcome))) {
		const counts = filled
			.filter((one) => one.outcome === outcome)
			.map((one) => one.marks.length)
			.toSorted((a, b) => a - b);
		for (const one of filled.filter((cell) => cell.outcome === outcome)) {
			const atMost = counts.filter((count) => count <= one.marks.length).length;
			shaded.set(one, Math.max(1, Math.ceil((SHADES * atMost) / counts.length)));
		}
	}
	return shaded;
}
