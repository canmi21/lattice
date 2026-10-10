/**
 * The overview's week as a row of slots a node, a status page's: each run that did something on a
 * node in the span is one mark however many of its apps it placed there, and the marks are
 * gathered into the slot each started in, an hour over a week and a quarter over a day; a slot
 * with none is empty. A skip draws nothing. See spec/console/overview.md, "The week is a line a
 * node".
 */
import { type Fitted, fitted } from './early-draw.js';
import type { Trace } from './moving.ts';

export const DAY = 86_400_000;
export const WEEK = 7 * DAY;
export const HOUR = 3_600_000;
const MINUTE = 60_000;

/** The spans the timeline is read over, the shortest first, and what each is called. */
export const SPANS = [
	{ key: '1h', title: 'Last hour', span: HOUR },
	{ key: '6h', title: 'Last 6 hours', span: 6 * HOUR },
	{ key: '12h', title: 'Last 12 hours', span: 12 * HOUR },
	{ key: '24h', title: 'Last 24 hours', span: DAY },
	{ key: '3d', title: 'Last 3 days', span: 3 * DAY },
	{ key: '7d', title: 'Last 7 days', span: 7 * DAY },
	{ key: '30d', title: 'Last 30 days', span: 30 * DAY },
	{ key: '90d', title: 'Last 3 months', span: 90 * DAY },
	{ key: '180d', title: 'Last 6 months', span: 180 * DAY },
	{ key: '1y', title: 'Last year', span: 365 * DAY },
] as const;

export type Span = (typeof SPANS)[number]['key'];

/**
 * The spans as the menu groups them, a unit each, every option said in its group's unit: 24
 * hours stands in the hours and again as a day in the days, the card titled as it was chosen.
 */
export const SPAN_GROUPS = [
	{
		name: 'Hours',
		options: [
			{ key: '1h', title: 'Last hour', label: '1 hour' },
			{ key: '6h', title: 'Last 6 hours', label: '6 hours' },
			{ key: '12h', title: 'Last 12 hours', label: '12 hours' },
			{ key: '24h', title: 'Last 24 hours', label: '24 hours' },
		],
	},
	{
		name: 'Days',
		options: [
			{ key: '24h', title: 'Last day', label: '1 day' },
			{ key: '3d', title: 'Last 3 days', label: '3 days' },
			{ key: '7d', title: 'Last 7 days', label: '7 days' },
			{ key: '30d', title: 'Last 30 days', label: '30 days' },
		],
	},
	{
		name: 'Months',
		options: [
			{ key: '90d', title: 'Last 3 months', label: '3 months' },
			{ key: '180d', title: 'Last 6 months', label: '6 months' },
			{ key: '1y', title: 'Last 12 months', label: '12 months' },
		],
	},
] as const satisfies readonly {
	name: string;
	options: readonly { key: Span; title: string; label: string }[];
}[];

/**
 * How long a slot may be over each span, the finest first: a slot's length is a whole number of
 * minutes, hours or days, so its hover reads as a time a person says, and each is one the relays'
 * `/history` answers for its span -- whole hours past two days, whole days past 30 -- the finest
 * being the one asked for. Platform's spec/architecture/relay.md, "Each node's minutes, kept for
 * a year".
 */
const LENGTHS: Readonly<Record<Span, readonly number[]>> = {
	'1h': [MINUTE, 2 * MINUTE, 3 * MINUTE, 5 * MINUTE],
	'6h': [MINUTE, 2 * MINUTE, 3 * MINUTE, 5 * MINUTE, 10 * MINUTE, 15 * MINUTE],
	'12h': [2 * MINUTE, 3 * MINUTE, 5 * MINUTE, 10 * MINUTE, 15 * MINUTE, 30 * MINUTE],
	'24h': [5 * MINUTE, 10 * MINUTE, 15 * MINUTE, 20 * MINUTE, 30 * MINUTE, HOUR],
	'3d': [HOUR, 2 * HOUR, 3 * HOUR],
	'7d': [HOUR, 2 * HOUR, 3 * HOUR, 4 * HOUR, 6 * HOUR],
	'30d': [HOUR, 2 * HOUR, 3 * HOUR, 4 * HOUR, 6 * HOUR, 12 * HOUR, DAY],
	'90d': [DAY, 2 * DAY, 3 * DAY],
	'180d': [DAY, 2 * DAY, 3 * DAY, 5 * DAY],
	'1y': [DAY, 2 * DAY, 3 * DAY, 5 * DAY, 7 * DAY],
};

/**
 * Where a row of `of` slots of `length` milliseconds stands, so each slot begins on a time the
 * reader's clock says whole -- 9 PM, Oct 9 -- rather than wherever `now` happened to cut: the last
 * slot holds `now` and ends on the next whole `length` in a zone `offset` from UTC.
 */
export function aligned(
	now: number,
	length: number,
	of: number,
	offset: number,
): { start: number; end: number } {
	const end = Math.floor((now + offset) / length) * length - offset + length;
	return { start: end - of * length, end };
}

/** The finest slot `key`'s span is drawn in, which is what its history is asked at. */
export const finestOf = (key: Span): number => LENGTHS[key][0] ?? HOUR;

const spanOf = (key: Span): number => SPANS.find((one) => one.key === key)?.span ?? DAY;

/** A slot's width and the gap between two, each in pixels, as far as each may stretch. */
export const SLOT = { min: 3, max: 8 } as const;
export const GAP = { min: 1, max: 3 } as const;

/** How many slots `key` is drawn in before its width is known: the middle of its lengths. */
export function slotsIn(key: Span): number {
	const lengths = LENGTHS[key];
	return Math.round(spanOf(key) / (lengths[Math.floor(lengths.length / 2)] ?? HOUR));
}

/**
 * The slots `key`'s span is drawn in across `width` pixels: the finest count whose slots, at their
 * narrowest and closest, still fit, then a width and a gap within their bounds that fill it -- the
 * slots widening first, and the gap after them. Where even the coarsest count does not fit at its
 * narrowest, that count, overflowing; where the finest stops short at its widest, that count,
 * short of the edge.
 */
export function fit(key: Span, width: number): Fitted {
	return fitted(countsOf(key), width, { slot: SLOT, gap: GAP });
}

export type { Fitted };

/** The counts `key`'s span may be drawn in, finest first. */
export const countsOf = (key: Span): number[] =>
	LENGTHS[key].map((length) => Math.round(spanOf(key) / length));

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

const outcomeOf = (step: Trace): Outcome =>
	step.outcome === 'running' || step.outcome === 'failed' ? step.outcome : 'succeeded';

const share = (at: number, start: number, span: number) =>
	Math.min(1, Math.max(0, (at - start) / span));

/** `steps` as a mark a run a node over the `span` ending at `now`, oldest first. */
export function marks(steps: readonly Trace[], now: number, span = DAY): Mark[] {
	const start = now - span;
	const gathered = new Map<string, Trace[]>();
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
			const first = group[0] as Trace;
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
