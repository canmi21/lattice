/**
 * Where marks go, computed before anything is drawn. Every position is a percentage of the plot or
 * a fixed pixel length, never a measured one, so the server's render is the browser's.
 */
import { bisector } from 'd3-array';
import { scaleBand } from 'd3-scale';
import { stack, stackOffsetExpand, stackOffsetNone } from 'd3-shape';

/** The surface left between two fills that touch: stacked segments, adjacent bars. */
export const GAP = 2;
/** The thickest a bar is drawn; a wider band leaves the rest as air. */
export const THICK = 24;
/** The smallest a pointer or a finger is asked to hit. */
export const TARGET = 24;

/** A category's band across the plot, in percent. */
export interface Band {
	key: string;
	start: number;
	width: number;
	center: number;
}

export function bands(keys: string[], padding = 0.25): Band[] {
	const scale = scaleBand<string>()
		.domain(keys)
		.range([0, 100])
		.paddingInner(padding)
		.paddingOuter(padding / 2);
	return keys.map((key) => {
		const start = scale(key) ?? 0;
		const width = scale.bandwidth();
		return { key, start, width, center: start + width / 2 };
	});
}

/**
 * The CSS width of each of `count` bars side by side in a band `band` percent wide: never over
 * THICK, and GAP apart. A plot sets it as `--bar`, which `barLeft` reads.
 */
export function barWidth(band: number, count: number): string {
	return `min(${THICK}px, calc((${band}% - ${(count - 1) * GAP}px) / ${count}))`;
}

/** Where bar `index` of `count` starts, the group centered on its band. */
export function barLeft(center: number, index: number, count: number): string {
	const group = `(${count} * var(--bar) + ${(count - 1) * GAP}px)`;
	return `calc(${center}% - ${group} / 2 + ${index} * (var(--bar) + ${GAP}px))`;
}

/** One series' part of a category's stack, in the value's own units, or shares when expanded. */
export interface Segment {
	key: string;
	value: number;
	start: number;
	end: number;
}

export interface Stacked {
	category: string;
	total: number;
	segments: Segment[];
}

/**
 * Each category's stack, bottom to top in the series' order. A value that is not a positive
 * number counts as nothing and draws no segment, so the gaps fall only between what is drawn.
 */
export function stackRows(
	categories: string[],
	series: { key: string; values: number[] }[],
	expand = false,
): Stacked[] {
	const rows = categories.map((_, index) =>
		Object.fromEntries(series.map((one) => [one.key, positive(one.values[index])])),
	);
	const layers = stack<Record<string, number>>()
		.keys(series.map((one) => one.key))
		.offset(expand ? stackOffsetExpand : stackOffsetNone)(rows);
	return categories.map((category, index) => {
		const row = rows[index] ?? {};
		const segments = layers.flatMap((layer) => {
			const value = row[layer.key] ?? 0;
			const [start = 0, end = 0] = layer[index] ?? [];
			// An all-zero row expands to NaN; it has nothing to draw either way.
			if (value === 0 || !Number.isFinite(start) || !Number.isFinite(end)) return [];
			return [{ key: layer.key, value, start, end }];
		});
		const total = Object.values(row).reduce((sum, value) => sum + value, 0);
		return { category, total, segments };
	});
}

function positive(value: number | undefined): number {
	return value !== undefined && Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * The pixels a fill gives up at each end so that `count` touching fills stand GAP apart: half a
 * gap toward each neighbor, nothing at the outer ends.
 */
export function inset(index: number, count: number): { before: number; after: number } {
	return { before: index > 0 ? GAP / 2 : 0, after: index < count - 1 ? GAP / 2 : 0 };
}

/**
 * A fill from `start` to `end` percent, less its inset, as a CSS offset and length; never shorter
 * than `least` pixels, so a fill too brief to see is still there to point at.
 */
export function span(
	start: number,
	end: number,
	index: number,
	count: number,
	least = 0,
): { offset: string; length: string } {
	const { before, after } = inset(index, count);
	return {
		offset: `calc(${start}% + ${before}px)`,
		length: `max(${least}px, calc(${end - start}% - ${before + after}px))`,
	};
}

/** Which of `steps` a value falls in across `low` to `high`; undefined for no value. */
export function rampStep(
	value: number,
	low: number,
	high: number,
	steps: number,
): number | undefined {
	if (!Number.isFinite(value)) return undefined;
	if (high <= low) return steps - 1;
	const share = (value - low) / (high - low);
	return Math.min(steps - 1, Math.max(0, Math.floor(share * steps)));
}

/**
 * A sequential step of one hue: the hue mixed into the surface, faintest for the least. On a dark
 * surface the least is nearest the surface, so the ramp runs surface to full hue.
 */
export function rampColor(hue: string, step: number, steps: number): string {
	const share = steps <= 1 ? 100 : Math.round(20 + (80 * step) / (steps - 1));
	return `color-mix(in oklab, ${hue} ${share}%, var(--color-surface))`;
}

const center = bisector((at: number) => at).center;

/** The index of the moment in `sorted` nearest `at`; undefined when there is none. */
export function nearestIndex(sorted: number[], at: number): number | undefined {
	return sorted.length ? center(sorted, at) : undefined;
}

/**
 * At most `most` parts of a whole, in their own order: past that the smallest fold into one
 * `Other`, in the quiet hue, since a seventh slice is past what an eye compares.
 */
export function fold<Part extends { key: string; label: string; color: string; value: number }>(
	parts: Part[],
	most = 6,
): (Part | { key: string; label: string; color: string; value: number })[] {
	const drawn = parts.filter((part) => Number.isFinite(part.value) && part.value > 0);
	if (drawn.length <= most) return drawn;
	const kept = new Set(
		drawn
			.toSorted((a, b) => b.value - a.value)
			.slice(0, most - 1)
			.map((part) => part.key),
	);
	const rest = drawn.filter((part) => !kept.has(part.key));
	const other = rest.reduce((sum, part) => sum + part.value, 0);
	return [
		...drawn.filter((part) => kept.has(part.key)),
		{ key: 'other', label: 'Other', color: 'var(--color-text-faint)', value: other },
	];
}
