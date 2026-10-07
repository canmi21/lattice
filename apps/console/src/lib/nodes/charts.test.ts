import { describe, expect, it } from 'vitest';
import type { Point } from '../host.ts';
import type { Event } from '../wire.ts';
import { markers, nodeCharts } from './charts.ts';

const summary = (average: number) => ({
	average,
	minimum: average - 1,
	maximum: average + 1,
	count: 60,
});

const points: Point[] = [
	{
		at: 120,
		values: {
			'cpu.usage': summary(20),
			'cpu.core.10.usage': summary(5),
			'cpu.core.2.usage': summary(40),
			'temperature.soc': summary(50),
		},
	},
	{ at: 60, values: { 'cpu.usage': summary(10), 'cpu.core.2.usage': summary(30) } },
];

describe('nodeCharts', () => {
	it('draws each metric as a line in time order, its colors in the fixed order', () => {
		const charts = nodeCharts(points);
		expect(charts.cpu.map((line) => [line.key, line.color])).toEqual([
			['cpu.usage', 'var(--color-series-1)'],
			['cpu.iowait', 'var(--color-series-2)'],
		]);
		expect(charts.cpu[0]?.points).toEqual([
			{ at: 60, value: 10, minimum: 9, maximum: 11 },
			{ at: 120, value: 20, minimum: 19, maximum: 21 },
		]);
		expect(charts.cpu[1]?.points).toEqual([]);
	});

	it('orders cores by number, with NaN where a core was not read', () => {
		const { cores } = nodeCharts(points);
		expect(cores.rows.map((row) => row.label)).toEqual(['Core 2', 'Core 10']);
		expect(cores.times).toEqual([60, 120]);
		expect(cores.values).toEqual([
			[30, 40],
			[Number.NaN, 5],
		]);
	});

	it('draws a line per thermal zone, named as the kernel names it', () => {
		expect(nodeCharts(points).temperature.map((line) => line.label)).toEqual(['soc']);
	});
});

const event = (id: number, action: string, started_at: string, app = 'geo'): Event => ({
	id,
	app,
	action,
	source: { kind: 'run', run: 1 },
	outcome: 'succeeded',
	started_at,
});

describe('markers', () => {
	const at = (stamp: string) => Date.parse(stamp) / 1000;
	const since = at('2026-10-06T00:00:00Z');
	const until = at('2026-10-06T12:00:00Z');

	it('marks the deploys in the span, and not a restart or one outside it', () => {
		const marks = markers(
			[
				event(4, 'rollback_with_data', '2026-10-06T06:00:00Z'),
				event(3, 'restart', '2026-10-06T05:00:00Z'),
				event(2, 'deploy', '2026-10-06T04:00:00Z'),
				event(1, 'deploy', '2026-10-05T04:00:00Z'),
			],
			since,
			until,
		);
		expect(marks).toEqual([
			{ at: at('2026-10-06T04:00:00Z'), label: 'geo deploy' },
			{ at: at('2026-10-06T06:00:00Z'), label: 'geo rollback with data' },
		]);
	});

	it('gives deploys starting in one second one marker', () => {
		const marks = markers(
			[
				event(2, 'deploy', '2026-10-06T04:00:00.400Z', 'apt'),
				event(1, 'deploy', '2026-10-06T04:00:00.100Z'),
			],
			since,
			until,
		);
		expect(marks).toEqual([{ at: at('2026-10-06T04:00:00Z'), label: 'apt deploy, geo deploy' }]);
	});
});
