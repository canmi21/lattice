import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import AreaChart from './area-chart.svelte';
import { HOVER, Hover } from './hover.svelte.ts';
import type { Datum, Line } from './series.ts';
import { zoned } from '../ui/time-zone.ts';

const START = 1_790_000_000;
const points: Datum[] = Array.from({ length: 60 }, (_, minute) => ({
	at: START + minute * 60,
	value: 20 + (minute % 10),
	minimum: 10,
	maximum: 40,
}));
const cpu: Line = { key: 'cpu', label: 'Busy', color: 'var(--color-series-2)', points };
const memory: Line = { ...cpu, key: 'memory', label: 'Memory', color: 'var(--color-series-1)' };
const percent = (value: number) => `${value}%`;

describe('area chart on the server', () => {
	it('renders the plot and its axes whole, with nothing measured first', () => {
		const { body } = render(AreaChart, {
			props: { lines: [cpu], since: START, until: START + 3600, ceiling: 100, format: percent },
		});
		expect(body).toMatch(/<svg[^>]*viewBox="0 0 1000 164"/);
		// The band, the wash and the line, each a drawn path; controls may have paths of their own.
		expect(body.match(/<path[^>]+(?:fill-opacity|stroke-width="2")/g)).toHaveLength(3);
		expect(body).toContain('stroke-width="2"');
		// The grid, and a label per tick on the value axis and the time axis.
		expect(body.match(/<line /g)?.length).toBeGreaterThanOrEqual(4);
		for (const tick of ['0%', '20%', '100%']) expect(body).toContain(`>${tick}</span>`);
		expect(body.match(/>\d{1,2}:\d{2}(?: [AP]M)?<\/span>/g)?.length).toBeGreaterThan(0);
		// One series needs no legend: the card's title names it.
		expect(body).not.toContain('aria-pressed="true"');
	});

	it('gives two series a legend that toggles them, and a table switch', () => {
		const { body } = render(AreaChart, { props: { lines: [cpu, memory] } });
		expect(body.match(/aria-pressed="true"/g)).toHaveLength(2);
		expect(body).toContain('>Table');
	});

	it('draws a limit with its label and an event with its marker', () => {
		const { body } = render(AreaChart, {
			props: {
				lines: [cpu],
				ceiling: 100,
				format: percent,
				thresholds: [{ value: 80, label: 'Limit', tone: 'bad' }],
				events: [{ at: START + 1800, label: 'Deploy v12' }],
			},
		});
		expect(body).toContain('Limit');
		expect(body).toContain('80%');
		expect(body).toContain('title="Deploy v12"');
		// The top margin grows to hold the event's label.
		expect(body).toMatch(/viewBox="0 0 1000 150"/);
	});

	it('says plainly when there is nothing to draw, or the read failed, at the same height', () => {
		const empty = render(AreaChart, { props: { lines: [], height: 180 } }).body;
		expect(empty).toContain('No points in this span');
		expect(empty).not.toContain('<svg');
		expect(empty).toContain('height: 180px');
		const failed = render(AreaChart, { props: { lines: [cpu], height: 180, error: 'timed out' } });
		expect(failed.body).toContain('Could not be read');
		expect(failed.body).toContain('timed out');
		expect(failed.body).toContain('height: 180px');
	});

	it('holds a stale drawing dimmed rather than blanking it', () => {
		const { body } = render(AreaChart, { props: { lines: [cpu], stale: true } });
		expect(body).toContain('aria-busy="true"');
		expect(body).toContain('<path d="M');
	});

	it('draws the shared moment in every chart that reads it, snapped to its own points', () => {
		const hover = new Hover();
		hover.at = START + 600 + 10;
		const context = new Map([[HOVER, hover]]);
		for (const lines of [[cpu], [memory]]) {
			const { body } = render(AreaChart, { props: { lines }, context });
			// The crosshair, one tooltip, and the value at minute ten.
			expect(body).toContain('min-w-40');
			expect(body).toContain('>20.0</span>');
			expect(body).toMatch(/aria-valuenow="10"/);
		}
	});

	it('writes its times in the zone the layout set, ticking on the round hours of it', () => {
		const props = { lines: [cpu], since: START, until: START + 6 * 3600 };
		// 14:13 to 20:13 UTC; 19:58 to 01:58 in Kathmandu, which is 5:45 ahead.
		const utc = render(AreaChart, { props, context: zoned('UTC') }).body;
		const nepal = render(AreaChart, { props, context: zoned('Asia/Kathmandu') }).body;
		expect(utc).toContain('>03:00 PM</span>');
		expect(utc).toContain('>07:00 PM</span>');
		expect(nepal).toContain('>09:00 PM</span>');
		expect(nepal).toContain('>12:00 AM</span>');
		expect(nepal).not.toContain('>03:00 PM</span>');
		// UTC's round hours would land at a quarter to in Kathmandu; its own land on the hour.
		expect(nepal).not.toContain('08:45 PM');
	});

	it('writes UTC with no zone set, or one no zone database knows', () => {
		const props = { lines: [cpu], since: START, until: START + 6 * 3600 };
		const bare = render(AreaChart, { props }).body;
		const wrong = render(AreaChart, { props, context: zoned('Mars/Olympus') }).body;
		expect(bare).toContain('>03:00 PM</span>');
		expect(wrong).toContain('>03:00 PM</span>');
	});
});
