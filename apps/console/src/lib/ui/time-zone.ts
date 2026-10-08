/**
 * The zone every moment on the page is written in, set once by the layout from what the server
 * was told and read by each chart, so the server's first paint and the browser's agree. Without
 * one, or with a name no zone database knows, moments are written in UTC.
 */
import { getContext, setContext } from 'svelte';
import { UTC } from '../chart/series.ts';

const KEY = Symbol('time zone');

/** `zone` when it names a zone this runtime can write in, UTC otherwise. */
export function known(zone: string | undefined): string {
	if (!zone) return UTC;
	try {
		new Intl.DateTimeFormat('en-US', { timeZone: zone });
		return zone;
	} catch {
		return UTC;
	}
}

export function setTimeZone(zone: string | undefined): string {
	return setContext(KEY, known(zone));
}

export function timeZone(): string {
	return getContext<string | undefined>(KEY) ?? UTC;
}

/**
 * `zone`'s offset from UTC at `at`, always `UTC` and a sign: `UTC-4`, `UTC+5:30`, UTC itself
 * `UTC+0`. Intl's `GMT-4`, and its bare `GMT`, are rewritten so every zone reads one way.
 */
export function offsetOf(zone: string, at: number = Date.now()): string {
	const name = new Intl.DateTimeFormat('en-US', { timeZoneName: 'shortOffset', timeZone: zone })
		.formatToParts(at)
		.find((part) => part.type === 'timeZoneName')?.value;
	const offset = name?.replace(/^GMT/, '') ?? '';
	return `UTC${offset === '' ? '+0' : offset}`;
}

/** Exported for a test to render a chart as though the layout had set `zone`. */
export function zoned(zone: string): Map<symbol, string> {
	return new Map([[KEY, known(zone)]]);
}
