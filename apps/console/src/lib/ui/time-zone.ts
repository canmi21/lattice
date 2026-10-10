/**
 * The zone every moment on the page is written in, set once by the layout from what the server
 * was told and read by each chart, so the server's first paint and the browser's agree. The server
 * reads the `timezone` cookie, the browser's own zone name, and Cloudflare's guess where there is
 * none; the browser corrects both after it wakes. See spec/console/state.md, "Kept, and where".
 */
import { getContext, setContext } from 'svelte';
import { UTC, type Zone } from '../chart/series.ts';
import { ATTRIBUTES } from './preference.ts';

const KEY = Symbol('time zone');

/** The cookie holding the reader's zone by its IANA name: `America/New_York`, `Asia/Kolkata`. */
export const COOKIE = 'timezone';

/** `name` when it names a zone this runtime can write in, nothing otherwise. */
export function known(name: string | undefined): string | undefined {
	if (!name) return undefined;
	try {
		new Intl.DateTimeFormat('en-US', { timeZone: name });
		return name;
	} catch {
		return undefined;
	}
}

/** The zone the server draws with: the cookie's, else the one Cloudflare names, else UTC. */
export function served(
	cookies: { get(name: string): string | undefined },
	cf: { timezone?: string } | undefined,
): Zone {
	const name = known(cookies.get(COOKIE)) ?? known(cf?.timezone);
	return name ? { name } : UTC;
}

/**
 * From the browser, once it wakes: keeps its own zone in the cookie where the cookie says
 * otherwise, and moves `zone` onto it, so a first visit drawn on a guess is put right here.
 */
export function settle(zone: { name: string }): void {
	const name = known(Intl.DateTimeFormat().resolvedOptions().timeZone);
	if (!name) return;
	const held = new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]*)`).exec(document.cookie)?.[1];
	// A zone's name is letters, digits, `/`, `_`, `-` and `+`, all a cookie may hold as they are.
	if (held !== name) document.cookie = `${COOKIE}=${name}${ATTRIBUTES}`;
	if (zone.name !== name) zone.name = name;
}

/** Sets `zone` for every chart and time below; the layout's own, which `settle` may correct. */
export function setTimeZone(zone: Zone): Zone {
	return setContext(KEY, zone);
}

export function timeZone(): Zone {
	return getContext<Zone | undefined>(KEY) ?? UTC;
}

/**
 * `zone`'s offset from UTC at `at`, always `UTC` and a sign: `UTC-4`, `UTC+5:30`, UTC itself
 * `UTC+0`. Intl's `GMT-4`, and its bare `GMT`, are rewritten so every zone reads one way.
 */
export function offsetOf(zone: Zone, at: number = Date.now()): string {
	const name = new Intl.DateTimeFormat('en-US', {
		timeZoneName: 'shortOffset',
		timeZone: zone.name,
	})
		.formatToParts(at)
		.find((part) => part.type === 'timeZoneName')?.value;
	const offset = name?.replace(/^GMT/, '') ?? '';
	return `UTC${offset === '' ? '+0' : offset}`;
}

/** `zone`'s offset from UTC at `at`, in milliseconds: `UTC-4` is `-14_400_000`. */
export function offsetIn(zone: Zone, at: number = Date.now()): number {
	const [, sign, hours, minutes] = /^UTC([+-])(\d+)(?::(\d+))?$/.exec(offsetOf(zone, at)) ?? [];
	const size = (Number(hours ?? 0) * 60 + Number(minutes ?? 0)) * 60_000;
	return sign === '-' ? -size : size;
}

/** Exported for a test to render a chart as though the layout had set `zone`. */
export function zoned(zone: string): Map<symbol, Zone> {
	const name = known(zone);
	return new Map([[KEY, name ? { name } : UTC]]);
}
