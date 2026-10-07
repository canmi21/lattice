import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import Heatmap from './heatmap.svelte';
import { HOVER, Hover } from './hover.svelte.ts';

const START = 1_790_000_000;
const times = Array.from({ length: 12 }, (_, hour) => START + hour * 3600);
const rows = [
	{ key: 'web', label: 'web' },
	{ key: 'api', label: 'api' },
];
const values = [times.map((_, hour) => hour * 10), times.map(() => Number.NaN)];

describe('heatmap on the server', () => {
	it('draws a cell per row per moment on a CSS grid, nothing measured', () => {
		const { body } = render(Heatmap, { props: { rows, times, values } });
		expect(body).toContain('grid-template-columns: repeat(12, minmax(0, 1fr))');
		expect(body.match(/role="gridcell"/g)).toHaveLength(24);
		// One cell, the first, is where the keyboard enters the grid.
		expect(body.match(/role="gridcell" tabindex="0"/g)).toHaveLength(1);
	});

	it('steps one hue from near the surface to full, and marks an unread cell apart', () => {
		const { body } = render(Heatmap, {
			props: { rows, times, values, hue: 'var(--color-series-3)' },
		});
		expect(body).toContain('color-mix(in oklab, var(--color-series-3) 20%, var(--color-surface))');
		expect(body).toContain('color-mix(in oklab, var(--color-series-3) 100%, var(--color-surface))');
		expect(body).toContain('background-color: var(--color-sunken)');
		expect(body).toContain(': No reading"');
		// The scale legend names each of the five steps.
		expect(body.match(/\+\s*<\/span>/g)).toHaveLength(5);
	});

	it('outlines the column a synced chart points at', () => {
		const hover = new Hover();
		hover.at = START + 3 * 3600 + 60;
		const { body } = render(Heatmap, {
			props: { rows, times, values },
			context: new Map([[HOVER, hover]]),
		});
		const classes = [...body.matchAll(/role="gridcell"[^>]*class="([^"]*)"/g)].map(
			([, names]) => names,
		);
		const [usual] = classes;
		// Column three, in both rows, and no other cell.
		expect(classes.filter((names) => names !== usual)).toHaveLength(2);
		expect(classes.indexOf(classes.find((names) => names !== usual) ?? '')).toBe(3);
	});
});
