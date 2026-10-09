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
/** How long a slot is over a span of a day or less, and over a longer one. */
export const QUARTER = HOUR / 4;

/** How many slots `span` is drawn in. */
export const slotsIn = (span: number): number => Math.round(span / (span > DAY ? HOUR : QUARTER));

export type Outcome = 'running' | 'failed' | 'succeeded';

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

/** Worst first: going, then failed, then done. */
const WORST: readonly Outcome[] = ['running', 'failed', 'succeeded'];
const worst = (outcomes: readonly Outcome[]): Outcome =>
	WORST.find((one) => outcomes.includes(one)) ?? 'succeeded';

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
			const outcome = worst(group.map(outcomeOf));
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

/** `marks` gathered into the `of` cells of their span, a cell by where each mark starts. */
export function cells(marks: readonly Mark[], of: number): Cell[] {
	const gathered = new Map<string, Mark[]>();
	for (const mark of marks) {
		const index = Math.min(of - 1, Math.floor(mark.from * of));
		const key = `${mark.node} ${index}`;
		gathered.set(key, [...(gathered.get(key) ?? []), mark]);
	}
	return [...gathered].map(([key, its]) => ({
		key,
		node: (its[0] as Mark).node,
		index: Math.min(of - 1, Math.floor((its[0] as Mark).from * of)),
		of,
		outcome: worst(its.map((one) => one.outcome)),
		marks: its,
	}));
}

/** Every one of the `of` slots of a line drawn from `marks`, oldest first, one with none empty. */
export function slots(marks: readonly Mark[], of: number): (Cell | undefined)[] {
	const filled = new Map(cells(marks, of).map((cell) => [cell.index, cell]));
	return Array.from({ length: of }, (_, index) => filled.get(index));
}
