import { describe, expect, it } from 'vitest';
import { build, DOT, PITCH, projectionOf } from '../../../scripts/project.ts';
import { NODES } from '../server/nodes.ts';
import * as generated from './land.generated.ts';
import { SIZES } from './marks.ts';
import { gather, PLACES } from './places.ts';

describe('the generated map', () => {
	it('places every node of nodes.ts where the projection puts it', () => {
		expect(Object.keys(generated.POINTS).toSorted()).toEqual(Object.keys(NODES).toSorted());
		const world = projectionOf(generated.PROJECTION);
		for (const [code, [latitude, longitude]] of Object.entries(NODES)) {
			const [x, y] = world([longitude, latitude]) ?? [NaN, NaN];
			const [gx, gy] = generated.POINTS[code as keyof typeof NODES];
			expect(gx).toBeCloseTo(x, 1);
			expect(gy).toBeCloseTo(y, 1);
		}
	});

	it('is what scripts/land.ts would write now: run `pnpm map` when this fails', () => {
		const built = build();
		expect(generated.WIDTH).toBe(built.width);
		expect(generated.HEIGHT).toBe(built.height);
		expect(generated.PROJECTION).toEqual(built.projection);
		expect(generated.DOT).toBe(DOT);
		expect(generated.PITCH).toBe(PITCH);
		expect(generated.DOTS).toBe(built.dots);
		expect(generated.LOCATIONS).toEqual(built.locations);
		expect(generated.POINTS).toEqual(built.points);
	});

	it('gives the globe each node where nodes.ts has it', () => {
		expect(generated.LOCATIONS).toEqual(NODES);
	});

	it('draws land as runs of whole dots on the grid, inside the plot', () => {
		const runs = [...generated.DOTS.matchAll(/M([\d.]+) ([\d.]+)h(\d+)/g)];
		expect(runs.length).toBeGreaterThan(100);
		expect(runs.map((run) => run[0]).join('')).toBe(generated.DOTS);
		for (const [, x, y, length] of runs) {
			expect((Number(x) - (PITCH - DOT) / 2) % PITCH).toBe(0);
			expect((Number(y) - PITCH / 2) % PITCH).toBe(0);
			expect((Number(length) - DOT) % PITCH).toBe(0);
			expect(Number(x) + Number(length)).toBeLessThan(generated.WIDTH);
			expect(Number(y)).toBeLessThan(generated.HEIGHT);
		}
	});

	it('keeps every node inside the plot', () => {
		for (const [x, y] of Object.values(generated.POINTS)) {
			expect(x).toBeGreaterThan(0);
			expect(x).toBeLessThan(generated.WIDTH);
			expect(y).toBeGreaterThan(0);
			expect(y).toBeLessThan(generated.HEIGHT);
		}
	});

	it("keeps every place's largest mark inside the plot and clear of every other", () => {
		const largest = SIZES[SIZES.length - 1]?.radius ?? 0;
		const sites = gather(
			(Object.keys(PLACES) as (keyof typeof PLACES)[]).map((code) => ({
				code,
				role: PLACES[code].role,
				cluster: PLACES[code].cluster,
				state: 'live' as const,
				apps: undefined,
				memory: undefined,
				used: undefined,
				cpu: undefined,
				heard: undefined,
				point: generated.POINTS[code],
			})),
		);
		for (const [
			index,
			{
				point: [x, y],
			},
		] of sites.entries()) {
			expect(x - largest).toBeGreaterThan(0);
			expect(x + largest).toBeLessThan(generated.WIDTH);
			expect(y - largest).toBeGreaterThan(0);
			expect(y + largest).toBeLessThan(generated.HEIGHT);
			for (const {
				point: [ox, oy],
			} of sites.slice(index + 1)) {
				expect(Math.hypot(x - ox, y - oy)).toBeGreaterThan(2 * largest);
			}
		}
	});

	it('knows a place for every node', () => {
		expect(Object.keys(PLACES).toSorted()).toEqual(Object.keys(NODES).toSorted());
	});
});
