/**
 * What the charts above the log count, from the events loaded for them: events per hour per node
 * over the last day, and outcomes per day over the last week, days as the reader's zone cuts them.
 */
import { offset, type Zone } from '#lib/chart/series.ts';
import type { FleetEvent } from '#lib/server/fleet.ts';

const HOUR = 3600;
const DAY = 86_400;

/** The outcomes drawn, in their fixed order. */
export const OUTCOMES = ['succeeded', 'failed', 'skipped', 'running'] as const;

export interface Hours {
	/** Each column's start in seconds, oldest first; the last is the hour `now` falls in. */
	times: number[];
	/** One array of counts per node, in `nodes` order. */
	values: number[][];
}

/** Events per hour per node over the 24 hours ending with the hour `now` falls in. */
export function hours(events: FleetEvent[], nodes: readonly string[], now: number): Hours {
	const last = Math.floor(now / 1000 / HOUR) * HOUR;
	const times = Array.from({ length: 24 }, (_, at) => last - (23 - at) * HOUR);
	const values = nodes.map(() => times.map(() => 0));
	for (const event of events) {
		const at = Math.floor(Date.parse(event.started_at) / 1000 / HOUR) * HOUR;
		const column = times.indexOf(at);
		const row = nodes.indexOf(event.node);
		const held = values[row];
		if (column !== -1 && held) held[column] = (held[column] ?? 0) + 1;
	}
	return { times, values };
}

export interface Days {
	/** Each day's start in seconds in `zone`, oldest first; the last is today. */
	times: number[];
	/** Per outcome in `OUTCOMES` order, a count per day. */
	values: number[][];
}

/** The start in seconds of the day `at` falls in, by `zone`'s clock. */
function dayOf(at: number, zone: Zone): number {
	const shift = offset(at, zone);
	return Math.floor((at + shift) / DAY) * DAY - shift;
}

/** Outcomes per day over the 7 days ending today; an outcome host adds later is not drawn. */
export function days(events: FleetEvent[], now: number, zone: Zone): Days {
	const today = dayOf(now / 1000, zone);
	const times = Array.from({ length: 7 }, (_, at) => dayOf(today - (6 - at) * DAY + DAY / 2, zone));
	const values = OUTCOMES.map(() => times.map(() => 0));
	for (const event of events) {
		const column = times.indexOf(dayOf(Date.parse(event.started_at) / 1000, zone));
		const row = OUTCOMES.indexOf(event.outcome as (typeof OUTCOMES)[number]);
		const held = values[row];
		if (column !== -1 && held) held[column] = (held[column] ?? 0) + 1;
	}
	return { times, values };
}
