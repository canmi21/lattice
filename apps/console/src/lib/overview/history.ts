/**
 * The overview's timeline by what it is asked about: the deploys a node ran, whether its services
 * kept running, and whether it was heard -- each slot's verdict in one of five steps, and the
 * overview of all three the worst of them. History is asked once a span at its finest slot, and
 * gathered here into however many slots the row has room for. See spec/console/overview.md, "A
 * line is any of three things, or the worst of them".
 */
import type { History, Slot } from '../wire.ts';
import { type Outcome, type Span, SPANS, finestOf } from './timeline.ts';

export const DIMENSIONS = [
	{ key: 'overview', title: 'Overview', label: 'Overview' },
	{ key: 'services', title: 'Services', label: 'Services' },
	{ key: 'deploys', title: 'Deploys', label: 'Deploys' },
	{ key: 'connectivity', title: 'Connectivity', label: 'Connectivity' },
] as const;

export type Dimension = (typeof DIMENSIONS)[number]['key'];

/** A slot's verdict, mildest first: nothing to say, fine, planned, degraded, down. */
export const VERDICTS = ['none', 'fine', 'planned', 'degraded', 'down'] as const;
export type Verdict = (typeof VERDICTS)[number];

export const worse = (a: Verdict, b: Verdict): Verdict =>
	VERDICTS.indexOf(a) >= VERDICTS.indexOf(b) ? a : b;

/** Rounds an app may miss in a slot and still read as up: a blip, under ten seconds. */
const BLIP = 3;
/** The share of a slot's rounds an app was down for that makes the slot down rather than dipped. */
const OUTAGE = 0.5;
/** Minutes unheard, unannounced, that make a slot down rather than shaky. */
const LOST = 3;

/** A deploy's outcome as a verdict: going is planned, partly failed degraded, failed down. */
export function deployed(outcome: Outcome | undefined): Verdict {
	if (outcome === undefined) return 'none';
	if (outcome === 'running') return 'planned';
	if (outcome === 'mixed') return 'degraded';
	return outcome === 'failed' ? 'down' : 'fine';
}

/** The worst any app, or `app` alone, was down in `slot`; nothing where the node was not read. */
export function served(slot: Slot | undefined, app?: string): Verdict {
	if (!slot?.due || !slot.beats) return 'none';
	const down =
		app === undefined ? Math.max(0, ...Object.values(slot.down ?? {})) : (slot.down?.[app] ?? 0);
	if (down < BLIP) return 'fine';
	return down < OUTAGE * slot.due ? 'degraded' : 'down';
}

/** Whether the node was heard through `slot`: unheard and unannounced is the trouble. */
export function heard(slot: Slot | undefined): Verdict {
	if (!slot?.due) return 'none';
	const unannounced = (slot.missing ?? 0) - (slot.announced ?? 0);
	if (unannounced >= LOST) return 'down';
	if (unannounced > 0) return 'degraded';
	return slot.announced || slot.leaving ? 'planned' : 'fine';
}

/** Slots of one node summed into one: counts added, round trips their mean and their worst. */
export function merged(slots: readonly Slot[]): Slot | undefined {
	const [first] = slots;
	if (!first) return undefined;
	const sum = (pick: (one: Slot) => number | undefined) =>
		slots.reduce((total, one) => total + (pick(one) ?? 0), 0) || undefined;
	const down: Record<string, number> = {};
	const trips: Record<string, { mean: number; worst: number; count: number }> = {};
	const runs: Record<string, number> = {};
	for (const one of slots) {
		for (const [app, rounds] of Object.entries(one.down ?? {}))
			down[app] = (down[app] ?? 0) + rounds;
		for (const [peer, trip] of Object.entries(one.round_trip ?? {})) {
			const held = trips[peer] ?? { mean: 0, worst: 0, count: 0 };
			trips[peer] = {
				mean: held.mean + trip.mean,
				worst: Math.max(held.worst, trip.worst),
				count: held.count + 1,
			};
		}
		for (const [outcome, count] of Object.entries(one.runs ?? {})) {
			runs[outcome] = (runs[outcome] ?? 0) + (count ?? 0);
		}
	}
	return {
		at: first.at,
		beats: sum((one) => one.beats),
		due: sum((one) => one.due),
		missing: sum((one) => one.missing),
		announced: sum((one) => one.announced),
		leaving: sum((one) => one.leaving),
		...(Object.keys(down).length ? { down } : {}),
		...(Object.keys(trips).length
			? {
					round_trip: Object.fromEntries(
						Object.entries(trips).map(([peer, { mean, worst, count }]) => [
							peer,
							{ mean: mean / count, worst },
						]),
					),
				}
			: {}),
		...(Object.keys(runs).length ? { runs } : {}),
	};
}

/**
 * `node`'s history gathered into the `of` slots of the span ending at `now`, each history slot
 * into the one the middle of its part inside the span falls in; a slot nothing fell in is
 * `undefined`.
 */
export function gathered(
	history: History | undefined,
	node: string,
	now: number,
	span: number,
	of: number,
): (Slot | undefined)[] {
	const start = now - span;
	const length = (history?.slot ?? 0) * 1000;
	const into: Slot[][] = Array.from({ length: of }, () => []);
	for (const slot of history?.nodes[node] ?? []) {
		// The middle of the part of it inside the span: the last slot runs on past now.
		const from = Math.max(Date.parse(slot.at), start);
		const middle = (from + Math.min(Date.parse(slot.at) + length, now)) / 2;
		const index = Math.floor(((middle - start) / span) * of);
		if (index >= 0 && index < of) into[index]?.push(slot);
	}
	return into.map((slots) => merged(slots));
}

/** What `/history` is asked for `key`'s span: its finest slot, the span a whole number of them. */
export function asked(key: Span): { span: number; slot: number } {
	const slot = finestOf(key) / 1000;
	const whole = (SPANS.find((one) => one.key === key)?.span ?? 0) / 1000;
	return { span: Math.ceil(whole / slot) * slot, slot };
}

/** Each dimension's word for each verdict, one word, for its legend and a slot's tip. */
export const WORDS: Readonly<Record<Dimension, Readonly<Record<Verdict, string>>>> = {
	overview: { none: 'None', fine: 'Fine', planned: 'Planned', degraded: 'Degraded', down: 'Down' },
	services: { none: 'Unread', fine: 'Up', planned: 'Planned', degraded: 'Dipped', down: 'Down' },
	deploys: { none: 'None', fine: 'Done', planned: 'Running', degraded: 'Partial', down: 'Failed' },
	connectivity: {
		none: 'Unread',
		fine: 'Heard',
		planned: 'Announced',
		degraded: 'Missed',
		down: 'Lost',
	},
};

/** The verdicts each dimension's legend names, mildest first. */
export const LEGENDS: Readonly<Record<Dimension, readonly Verdict[]>> = {
	overview: ['fine', 'planned', 'degraded', 'down'],
	services: ['fine', 'degraded', 'down'],
	deploys: ['fine', 'planned', 'degraded', 'down'],
	connectivity: ['fine', 'planned', 'degraded', 'down'],
};

/** Each app down in `slot`, or `app` alone, longest first, past a blip, in seconds down. */
export function downIn(slot: Slot | undefined, app?: string): { app: string; seconds: number }[] {
	return Object.entries(slot?.down ?? {})
		.filter(([one, rounds]) => (app === undefined || one === app) && rounds >= BLIP)
		.toSorted(([, a], [, b]) => b - a)
		.map(([one, rounds]) => ({ app: one, seconds: rounds * SECONDS_A_ROUND }));
}

const SECONDS_A_ROUND = 3;

/** How long, in its largest unit: `40s`, `3m`, `2h`. */
export const lasting = (seconds: number) =>
	seconds < 60
		? `${seconds}s`
		: seconds < 3600
			? `${Math.round(seconds / 60)}m`
			: `${Math.round(seconds / 3600)}h`;
