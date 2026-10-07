import { describe, expect, it } from 'vitest';
import {
	GAP,
	THICK,
	bands,
	barLeft,
	barWidth,
	fold,
	inset,
	nearestIndex,
	rampColor,
	rampStep,
	span,
	stackRows,
} from './layout.ts';

describe('bands', () => {
	it('spreads categories across the whole plot in percent, centered in their bands', () => {
		const [first, second] = bands(['a', 'b']);
		expect(first?.start).toBeGreaterThan(0);
		expect(first?.center).toBeCloseTo((first?.start ?? 0) + (first?.width ?? 0) / 2);
		expect((second?.start ?? 0) + (second?.width ?? 0)).toBeLessThan(100);
		expect(100 - ((second?.start ?? 0) + (second?.width ?? 0))).toBeCloseTo(first?.start ?? 0);
	});
});

describe('bar width and place', () => {
	it('caps a bar at THICK and leaves GAP between each of a group', () => {
		expect(barWidth(30, 3)).toBe(`min(${THICK}px, calc((30% - ${2 * GAP}px) / 3))`);
		// The group is centered: bar 0 starts half the group's width left of the center.
		const group = `(2 * var(--bar) + ${GAP}px)`;
		expect(barLeft(50, 0, 2)).toBe(`calc(50% - ${group} / 2 + 0 * (var(--bar) + ${GAP}px))`);
	});
});

describe('stackRows', () => {
	const series = [
		{ key: 'ok', values: [3, 0, 1] },
		{ key: 'failed', values: [1, Number.NaN, 1] },
	];

	it('stacks each category in the series order, and drops what is not a positive number', () => {
		const [first, second] = stackRows(['a', 'b', 'c'], series);
		expect(first?.segments).toEqual([
			{ key: 'ok', value: 3, start: 0, end: 3 },
			{ key: 'failed', value: 1, start: 3, end: 4 },
		]);
		expect(first?.total).toBe(4);
		expect(second?.segments).toEqual([]);
	});

	it('expands every stack to the whole, and leaves an empty one empty rather than NaN', () => {
		const [first, second, third] = stackRows(['a', 'b', 'c'], series, true);
		expect(first?.segments.map((segment) => segment.end)).toEqual([0.75, 1]);
		expect(second?.segments).toEqual([]);
		expect(third?.segments.map((segment) => [segment.start, segment.end])).toEqual([
			[0, 0.5],
			[0.5, 1],
		]);
	});
});

describe('gaps between touching fills', () => {
	it('gives up half a gap toward each neighbor and nothing at the outer ends', () => {
		expect(inset(0, 1)).toEqual({ before: 0, after: 0 });
		expect(inset(0, 3)).toEqual({ before: 0, after: GAP / 2 });
		expect(inset(1, 3)).toEqual({ before: GAP / 2, after: GAP / 2 });
		expect(inset(2, 3)).toEqual({ before: GAP / 2, after: 0 });
	});

	it('so two neighbors stand exactly GAP apart, and a sliver never turns negative', () => {
		const lower = span(0, 40, 0, 2);
		const upper = span(40, 100, 1, 2);
		expect(lower.length).toBe(`max(0px, calc(40% - ${GAP / 2}px))`);
		expect(upper.offset).toBe(`calc(40% + ${GAP / 2}px)`);
		expect(span(10, 10.1, 1, 3, 2).length).toBe(`max(2px, calc(${10.1 - 10}% - ${GAP}px))`);
	});
});

describe('the sequential ramp', () => {
	it('puts the least in the first step and the most in the last, and no value in none', () => {
		expect(rampStep(0, 0, 100, 5)).toBe(0);
		expect(rampStep(19.9, 0, 100, 5)).toBe(0);
		expect(rampStep(20, 0, 100, 5)).toBe(1);
		expect(rampStep(100, 0, 100, 5)).toBe(4);
		expect(rampStep(250, 0, 100, 5)).toBe(4);
		expect(rampStep(Number.NaN, 0, 100, 5)).toBeUndefined();
		// Every value the same: the full hue, not a division by zero.
		expect(rampStep(3, 3, 3, 5)).toBe(4);
	});

	it('runs from near the surface to the full hue', () => {
		expect(rampColor('red', 0, 5)).toBe('color-mix(in oklab, red 20%, var(--color-surface))');
		expect(rampColor('red', 4, 5)).toBe('color-mix(in oklab, red 100%, var(--color-surface))');
	});
});

describe('nearestIndex', () => {
	it('snaps to the nearest moment, and has none for no moments', () => {
		expect(nearestIndex([0, 60, 120], 89)).toBe(1);
		expect(nearestIndex([0, 60, 120], 91)).toBe(2);
		expect(nearestIndex([0, 60, 120], -50)).toBe(0);
		expect(nearestIndex([], 10)).toBeUndefined();
	});
});

describe('fold', () => {
	const part = (key: string, value: number) => ({ key, label: key, color: key, value });

	it('keeps six parts or fewer as they are, less any that are nothing', () => {
		expect(fold([part('a', 1), part('b', 0)]).map((one) => one.key)).toEqual(['a']);
	});

	it('folds the smallest past the fifth into one Other, keeping the order of the rest', () => {
		const parts = [1, 9, 2, 8, 3, 7, 4].map((value, index) => part(`p${index}`, value));
		const folded = fold(parts);
		expect(folded.map((one) => one.key)).toEqual(['p1', 'p3', 'p4', 'p5', 'p6', 'other']);
		expect(folded.at(-1)?.value).toBe(1 + 2);
	});
});
