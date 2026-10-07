/**
 * What a chart draws, and the arithmetic it needs before drawing: where a series has a gap, and
 * how a moment is labeled for the span on screen. d3 only computes, and Svelte renders. Ported
 * from infra's apps/deploy/panel/src/lib/chart/series.ts.
 */
import { scaleUtc } from 'd3-scale';
import type { Point } from '../host.ts';

/** One point: a moment in seconds, its value, and the range the value summarizes, if any. */
export interface Datum {
	at: number;
	value: number;
	minimum?: number;
	maximum?: number;
}

/**
 * A series' identity: its key, its name, and its color, which follows the series wherever it is
 * drawn -- a `--color-series-*` variable in the fixed order, never one picked by rank.
 */
export interface Key {
	key: string;
	label: string;
	color: string;
}

/** A series of moments. */
export interface Line extends Key {
	points: Datum[];
}

/** A chart's values as a table: its twin for a reader who cannot or would rather not read it. */
export interface Tabular {
	head: string[];
	rows: string[][];
	/** Which columns are figures, set right so they align. */
	numeric?: boolean[];
}

/**
 * The same points with a break wherever more than twice the usual step is missing, so a line stops
 * where the machine was off rather than drawing straight across the hours it knows nothing about.
 */
export function withGaps(points: Datum[]): Datum[] {
	if (points.length < 3) return points;
	const steps = points.slice(1).map((point, index) => point.at - points[index]!.at);
	const usual = steps.toSorted((a, b) => a - b)[Math.floor(steps.length / 2)]!;
	const broken: Datum[] = [points[0]!];
	for (const [index, point] of points.slice(1).entries()) {
		if (steps[index]! > usual * 2) broken.push({ at: point.at - usual, value: Number.NaN });
		broken.push(point);
	}
	return broken;
}

/**
 * Moments are written in one named zone and one locale, never the runtime's own: the server
 * renders the first paint and the browser takes it over, and the reader's zone, which Cloudflare
 * tells the server, is the one both can be handed. `ui/time-zone.ts` carries it to a chart.
 */
export const UTC = 'UTC';

const SHAPES = {
	seconds: { hour: '2-digit', minute: '2-digit', second: '2-digit' },
	clock: { hour: '2-digit', minute: '2-digit' },
	day: { month: 'short', day: 'numeric' },
	full: {
		month: 'short',
		day: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
	},
	parts: {
		year: 'numeric',
		month: 'numeric',
		day: 'numeric',
		hour: 'numeric',
		minute: 'numeric',
		second: 'numeric',
		hourCycle: 'h23',
	},
} satisfies Record<string, Intl.DateTimeFormatOptions>;

const made = new Map<string, Intl.DateTimeFormat>();

function writer(zone: string, shape: keyof typeof SHAPES): Intl.DateTimeFormat {
	const id = `${zone} ${shape}`;
	const known = made.get(id);
	if (known) return known;
	const fresh = new Intl.DateTimeFormat('en-US', { ...SHAPES[shape], timeZone: zone });
	made.set(id, fresh);
	return fresh;
}

/** How a tick names its moment, given how much time the axis spans. */
export function tickLabel(span: number, zone = UTC): (moment: Date) => string {
	const shape = span <= 180 ? 'seconds' : span <= 2 * 86400 ? 'clock' : 'day';
	return (when) => writer(zone, shape).format(when);
}

/** A moment in full, for the tooltip. */
export function moment(at: number, zone = UTC): string {
	return writer(zone, 'full').format(new Date(at * 1000));
}

/** How far `zone`'s clock is ahead of UTC at `at`, in seconds. */
export function offset(at: number, zone: string): number {
	const parts = Object.fromEntries(
		writer(zone, 'parts')
			.formatToParts(new Date(at * 1000))
			.map((part) => [part.type, Number(part.value)]),
	);
	const { year = 0, month = 1, day = 1, hour = 0, minute = 0, second = 0 } = parts;
	return Date.UTC(year, month - 1, day, hour, minute, second) / 1000 - Math.floor(at);
}

/**
 * About `count` ticks from `start` to `end`, in seconds, on round moments of `zone`'s clock --
 * whole hours, its midnights -- rather than of whichever zone the code happens to run in, which
 * is what d3's local ticks would fall on. The offset is taken at `start`, so a span crossing a
 * change of daylight time keeps the earlier side's.
 */
export function zonedTicks(start: number, end: number, count: number, zone = UTC): Date[] {
	const shift = offset(start, zone);
	return scaleUtc()
		.domain([new Date((start + shift) * 1000), new Date((end + shift) * 1000)])
		.ticks(count)
		.map((tick) => new Date(tick.getTime() - shift * 1000));
}

/**
 * Ticks for a quantity of bytes, round in the binary unit the top of the scale falls in: 1 MiB,
 * 2 MiB, rather than the 977 KiB a decimal step lands on.
 */
export function binaryTicks(highest: number, count = 4): number[] {
	if (highest <= 0) return [0];
	let unit = 1;
	while (highest / unit >= 1024) unit *= 1024;
	const raw = highest / unit / count;
	const magnitude = 10 ** Math.floor(Math.log10(raw));
	const step = ([1, 2, 5, 10].find((multiple) => multiple * magnitude >= raw) ?? 10) * magnitude;
	const ticks: number[] = [];
	for (let tick = 0; tick < highest / unit + step; tick += step) ticks.push(tick * unit);
	return ticks;
}

/** One metric of host's series, as a chart draws it. */
export function metric(points: Point[], name: string): Datum[] {
	return points.flatMap((point) => {
		const summary = point.values[name];
		if (summary === undefined) return [];
		const { average, minimum, maximum } = summary;
		return [{ at: point.at, value: average, minimum, maximum }];
	});
}
