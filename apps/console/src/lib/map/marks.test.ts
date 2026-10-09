import { describe, expect, it } from 'vitest';
import { DOT, PITCH } from './land.generated.ts';
import { BREATHS, DEPTHS, opacity, period, radius, shown, SIZES, worst } from './marks.ts';

const GIB = 2 ** 30;

describe('a mark by how much machine stands at its place', () => {
	it('steps at 2 GiB, taking 2 itself, and at 8 GiB, giving 8 the largest', () => {
		expect(radius(0.9 * GIB)).toBe(7);
		expect(radius(2 * GIB)).toBe(7);
		expect(radius(2 * GIB + 1)).toBe(9.5);
		expect(radius(8 * GIB - 1)).toBe(9.5);
		expect(radius(8 * GIB)).toBe(12);
		expect(radius(64 * GIB)).toBe(12);
	});

	it('draws the smallest across two of the land dots, a pitch and a dot', () => {
		expect(2 * SIZES[0].radius).toBe(PITCH + DOT);
	});

	it('takes the middle step while the memory is not known', () => {
		expect(radius(undefined)).toBe(SIZES[1].radius);
		expect(radius(NaN)).toBe(SIZES[1].radius);
	});
});

describe('a mark by whether its node is heard', () => {
	it('draws a late node as heard, and one upgrading or restarting as leaving', () => {
		expect(shown('live')).toBe('live');
		expect(shown('late')).toBe('live');
		expect(shown('upgrading')).toBe('leaving');
		expect(shown('restarting')).toBe('leaving');
		expect(shown('waiting')).toBe('waiting');
		expect(shown('gone')).toBe('gone');
	});

	it("takes the worst of a place's nodes: gone over leaving over waiting over heard", () => {
		expect(worst(['live', 'leaving', 'gone'])).toBe('gone');
		expect(worst(['live', 'leaving', 'waiting'])).toBe('leaving');
		expect(worst(['live', 'waiting'])).toBe('waiting');
		expect(worst(['live', 'live'])).toBe('live');
		expect(worst([])).toBe('live');
	});
});

describe('a mark by how deep its node runs', () => {
	it('steps its opacity at 5 and 15 apps running', () => {
		expect(opacity(5)).toBe(0.45);
		expect(opacity(6)).toBe(0.72);
		expect(opacity(15)).toBe(0.72);
		expect(opacity(16)).toBe(1);
		expect(opacity(undefined)).toBe(DEPTHS[1].opacity);
	});
});

describe('a mark breathing by how busy its node is', () => {
	it('steps its period below 2, 10 and 30 percent, so idle nodes are told apart', () => {
		expect(period(0)).toBe(4);
		expect(period(1.99)).toBe(4);
		expect(period(2)).toBe(2.6);
		expect(period(9.99)).toBe(2.6);
		expect(period(10)).toBe(1.6);
		expect(period(29.99)).toBe(1.6);
		expect(period(30)).toBe(0.9);
		expect(period(100)).toBe(0.9);
	});

	it('breathes slowest while the CPU is not known', () => {
		expect(period(undefined)).toBe(4);
		expect(period(NaN)).toBe(4);
	});

	it('only quickens with the load', () => {
		const periods = BREATHS.map((breath) => breath.period);
		expect(periods).toEqual(periods.toSorted((a, b) => b - a));
	});
});
