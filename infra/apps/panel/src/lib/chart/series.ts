/**
 * What a chart draws, and the arithmetic it needs before drawing: where a series has a gap, and
 * how a moment is labelled for the span on screen. Drawing is `area-chart.svelte`'s; d3 only
 * computes, and Svelte renders.
 */

/** One point: a moment in seconds, its value, and the range the value summarizes, if any. */
export interface Datum {
	at: number;
	value: number;
	minimum?: number;
	maximum?: number;
}

/** A series and how it is shown. `color` is any CSS color, a Nord variable usually. */
export interface Line {
	key: string;
	label: string;
	color: string;
	points: Datum[];
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

const clock = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' });
const seconds = new Intl.DateTimeFormat(undefined, {
	hour: '2-digit',
	minute: '2-digit',
	second: '2-digit',
});
const day = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
const full = new Intl.DateTimeFormat(undefined, {
	month: 'short',
	day: 'numeric',
	hour: '2-digit',
	minute: '2-digit',
	second: '2-digit',
});

/** How a tick names its moment, given how much time the axis spans. */
export function tickLabel(span: number): (moment: Date) => string {
	if (span <= 180) return (moment) => seconds.format(moment);
	if (span <= 2 * 86400) return (moment) => clock.format(moment);
	return (moment) => day.format(moment);
}

/** A moment in full, for the tooltip. */
export function moment(at: number): string {
	return full.format(new Date(at * 1000));
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
