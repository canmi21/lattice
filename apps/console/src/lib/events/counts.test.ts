import { describe, expect, it } from 'vitest';
import type { FleetEvent } from '#lib/server/fleet.ts';
import { days, hours } from './counts.ts';

const NOW = Date.parse('2026-10-06T12:30:00Z');
const event = (node: string, at: string, outcome = 'succeeded'): FleetEvent => ({
	node: node as FleetEvent['node'],
	id: 1,
	app: 'web',
	action: 'deploy',
	source: { kind: 'panel' },
	outcome,
	started_at: at,
});

describe('counts', () => {
	it('counts events per hour per node over the last 24 hours', () => {
		const { times, values } = hours(
			[
				event('tyo', '2026-10-06T12:05:00Z'),
				event('tyo', '2026-10-06T12:59:00Z'),
				event('gvx', '2026-10-05T13:10:00Z'),
				event('gvx', '2026-10-05T12:10:00Z'),
			],
			['tyo', 'gvx'],
			NOW,
		);
		expect(times).toHaveLength(24);
		expect(times.at(-1)).toBe(Date.parse('2026-10-06T12:00:00Z') / 1000);
		expect(values[0]?.at(-1)).toBe(2);
		expect(values[1]?.[0]).toBe(1);
		expect(values[1]?.reduce((a, b) => a + b, 0)).toBe(1);
	});

	it('counts outcomes per day in the reader zone', () => {
		const at = [
			event('tyo', '2026-10-06T01:00:00Z', 'failed'),
			event('tyo', '2026-10-05T23:00:00Z'),
			event('tyo', '2026-09-20T00:00:00Z'),
			event('tyo', '2026-10-06T02:00:00Z', 'odd'),
		];
		const utc = days(at, NOW, 'UTC');
		expect(utc.times).toHaveLength(7);
		expect(utc.times.at(-1)).toBe(Date.parse('2026-10-06T00:00:00Z') / 1000);
		expect(utc.values[1]?.at(-1)).toBe(1);
		expect(utc.values[0]?.at(-2)).toBe(1);
		const tokyo = days(at, NOW, 'Asia/Tokyo');
		expect(tokyo.times.at(-1)).toBe(Date.parse('2026-10-05T15:00:00Z') / 1000);
		expect(tokyo.values[0]?.at(-2)).toBe(0);
		expect(tokyo.values[0]?.at(-1)).toBe(1);
	});
});
