import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import ArrowUpIcon from '@tabler/icons-svelte-runes/icons/arrow-up';
import XCircleIcon from '@tabler/icons-svelte-runes/icons/circle-x';
import MinusIcon from '@tabler/icons-svelte-runes/icons/minus';
import Donut from './donut.svelte';
import Meter from './meter.svelte';
import Sparkline from './sparkline.svelte';
import StatTile from './stat-tile.svelte';

const stateIcon = (icon: typeof ArrowUpIcon) =>
	/<svg[\s\S]*<\/svg>/.exec(render(icon, { props: { size: 12, stroke: 2.5 } }).body)![0];

describe('stat tile on the server', () => {
	it('writes the figure compact, the delta signed against its period, and the trend', () => {
		const { body } = render(StatTile, {
			props: {
				label: 'Requests',
				value: 12_900,
				delta: { value: 420, period: 'last week', good: 'up' },
				trend: [1, 3, 2, 5, 4, 6, 5, 7, 6, 8, 7, 9],
			},
		});
		expect(body).toContain('>12.9K</span>');
		expect(body).toContain('+420');
		expect(body).toContain('vs last week');
		expect(body).toContain('aria-label="Requests, recent trend"');
		expect(body).toContain(stateIcon(ArrowUpIcon));
	});

	it('carries a direction as an icon as well as a tone, never the tone alone', () => {
		const worse = render(StatTile, {
			props: {
				label: 'Errors',
				value: '3',
				delta: { value: 2, period: 'yesterday', good: 'down' },
			},
		});
		const same = render(StatTile, {
			props: {
				label: 'Errors',
				value: '3',
				delta: { value: 0, period: 'yesterday', good: 'down' },
			},
		});
		expect(worse.body).toContain(stateIcon(ArrowUpIcon));
		expect(same.body).toContain(stateIcon(MinusIcon));
	});
});

describe('sparkline on the server', () => {
	it('draws the line in a stretched viewBox and the latest as a dot placed in percent', () => {
		const { body } = render(Sparkline, { props: { values: [1, 2, 3] } });
		expect(body).toContain('preserveAspectRatio="none"');
		expect(body).toContain('vector-effect="non-scaling-stroke"');
		expect(body).toContain('left: 100%');
		expect(body).toContain('background-color: var(--color-accent)');
	});

	it('draws no line for a single value', () => {
		const { body } = render(Sparkline, { props: { values: [Number.NaN, 4] } });
		expect(body).not.toContain('<path');
	});
});

describe('meter on the server', () => {
	it('fills its share in the accent over a dimmer step of the same hue', () => {
		const { body } = render(Meter, { props: { label: 'Disk', value: 40, limit: 100 } });
		expect(body).toContain('role="meter"');
		expect(body).toContain('width: 40%');
		expect(body).toContain('color-mix(in oklab, var(--color-accent) 22%, var(--color-surface))');
		expect(body).not.toContain('<svg');
	});

	it('warns and then alarms with an icon and a word, and never overfills', () => {
		const near = render(Meter, { props: { label: 'Disk', value: 80, limit: 100 } }).body;
		expect(near).toContain('background-color: var(--color-warn)');
		expect(near).toContain('High');
		const over = render(Meter, { props: { label: 'Disk', value: 130, limit: 100 } }).body;
		expect(over).toContain('background-color: var(--color-danger)');
		expect(over).toContain('Over limit');
		expect(over).toContain(stateIcon(XCircleIcon));
		expect(over).toContain('width: 100%');
	});
});

describe('donut on the server', () => {
	const part = (key: string, value: number, slot: number) => ({
		key,
		label: key,
		value,
		color: `var(--color-series-${slot})`,
	});

	it('draws a fixed square ring, a slice per part, each listed with its share', () => {
		const parts = [part('web', 3, 1), part('api', 1, 2)];
		const { body } = render(Donut, { props: { parts, size: 120 } });
		expect(body).toContain('viewBox="-60 -60 120 120"');
		expect(body.match(/<path[^>]+style="fill:/g)).toHaveLength(2);
		expect(body).toContain('>75%</span>');
		expect(body).toContain('>4</span>');
	});

	it('folds past six parts into Other', () => {
		const parts = Array.from({ length: 8 }, (_, index) => part(`p${index}`, index + 1, index + 1));
		const { body } = render(Donut, { props: { parts } });
		expect(body).toContain('>Other</span>');
		expect(body.match(/<path[^>]+style="fill:/g)).toHaveLength(6);
	});
});
