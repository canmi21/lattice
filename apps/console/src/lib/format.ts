/**
 * Times and sizes as the console says them: relative, and in the reader's zone on hover -- the one
 * the layout set, never the runtime's own, so the server and the browser write the same text.
 */
import { moment, UTC, type Zone } from './chart/series.ts';

/** How long ago `stamp` was, as of `now`: `just now`, `12 s ago`, `4 min ago`, `3 days ago`. */
export function ago(stamp: string, now: number): string {
	const at = Date.parse(stamp);
	if (Number.isNaN(at)) return '';
	const seconds = Math.max(0, Math.round((now - at) / 1000));
	if (seconds < 5) return 'just now';
	if (seconds < 60) return `${seconds} s ago`;
	const minutes = Math.round(seconds / 60);
	if (minutes < 60) return `${minutes} min ago`;
	const hours = Math.round(minutes / 60);
	if (hours < 48) return `${hours} h ago`;
	return `${Math.round(hours / 24)} days ago`;
}

/** `stamp` in `zone`, for a title; `ui/time-zone.ts`'s `timeZone()` is the reader's. */
export function localTime(stamp: string, zone: Zone = UTC): string {
	const at = Date.parse(stamp);
	return Number.isNaN(at) ? stamp : moment(at / 1000, zone);
}

const UNITS = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];

/** Bytes in binary units, as the panel writes them. */
export function bytes(value: number): string {
	let unit = 0;
	while (Math.abs(value) >= 1024 && unit < UNITS.length - 1) {
		value /= 1024;
		unit += 1;
	}
	return `${value.toFixed(unit === 0 ? 0 : 1).replace(/\.0$/, '')} ${UNITS[unit]}`;
}

/** An image by the short of what tells it apart: a digest's first twelve, or its tag. */
export function shortImage(image: string): string {
	const digest = image.indexOf('@sha256:');
	if (digest !== -1) return image.slice(digest + 8, digest + 20);
	const colon = image.lastIndexOf(':');
	return colon === -1 ? image : image.slice(colon + 1, colon + 13);
}
