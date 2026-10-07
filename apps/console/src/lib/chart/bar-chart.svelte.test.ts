import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import BarChart, { type Bars } from './bar-chart.svelte';
import StackedBar from './stacked-bar.svelte';

const categories = ['web', 'api', 'cdn'];
const ok: Bars = {
	key: 'ok',
	label: 'Succeeded',
	color: 'var(--color-series-1)',
	values: [8, 4, 2],
};
const failed: Bars = {
	key: 'failed',
	label: 'Failed',
	color: 'var(--color-series-2)',
	values: [2, 0, 2],
};

/** Every drawn bar or segment: an element filled in a series color. */
const fills = (body: string) => body.match(/background-color: var\(--color-series-\d\)/g) ?? [];

describe('bar chart on the server', () => {
	it('draws a bar per category, capped in thickness, rounded only at the data end', () => {
		const { body } = render(BarChart, { props: { categories, series: [ok] } });
		// One series: three bars, and a legend's swatch would make it four.
		expect(fills(body)).toHaveLength(3);
		expect(body).toContain('--bar: min(24px,');
		expect(body).toContain('border-radius: 4px 4px 0 0');
		for (const category of categories) expect(body).toContain(`title="${category}"`);
		// A hit target per category, whose label carries the value for the keyboard.
		expect(body).toContain('aria-label="web: Succeeded 8"');
	});

	it('groups series side by side, GAP apart, with a legend', () => {
		const { body } = render(BarChart, { props: { categories, series: [ok, failed] } });
		expect(body).toContain('(2 * var(--bar) + 2px)');
		expect(body.match(/aria-pressed="true"/g)).toHaveLength(2);
	});

	it('lays horizontal bars a row each, a value at each tip', () => {
		const { body } = render(BarChart, {
			props: { categories, series: [ok], orientation: 'horizontal' },
		});
		expect(body).toContain('border-radius: 0 4px 4px 0');
		expect(body).toMatch(/>8<\/span>/);
		// Three rows of 28 pixels, and the axis band: the frame grows to hold them.
		expect(body).toContain(`height: ${3 * 28 + 4 + 22}px`);
	});

	it('says there is nothing to draw when every value is nothing', () => {
		const zero = { ...ok, values: [0, Number.NaN, 0] };
		const { body } = render(BarChart, { props: { categories, series: [zero] } });
		expect(body).toContain('Nothing to show');
	});
});

describe('stacked bar on the server', () => {
	it('stacks drawn segments GAP apart and rounds only the top one', () => {
		const { body } = render(StackedBar, { props: { categories, series: [ok, failed] } });
		// web and cdn have two segments, api one: its zero draws nothing.
		expect(fills(body).length - 2).toBe(5);
		expect(body).toContain('calc(80% + 1px)');
		expect(body.match(/border-radius: 4px 4px 0 0/g)).toHaveLength(3);
		expect(body.match(/border-radius: 0px 0px 0 0/g)).toHaveLength(2);
	});

	it('expands every bar to the whole, its axis in percent', () => {
		const { body } = render(StackedBar, {
			props: { categories, series: [ok, failed], expand: true },
		});
		expect(body).toContain('>100%</span>');
		expect(body).toContain('aria-label="web: Succeeded 80% · 8, Failed 20% · 2, Total 10"');
	});
});
