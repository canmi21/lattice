import { describe, expect, it } from 'vitest';
import { moment, offset, zonedTicks } from './series.ts';

/** 2026-09-21 14:13:20 UTC. */
const START = 1_790_000_000;

describe('zones', () => {
	it('knows how far a zone is ahead, daylight time included', () => {
		expect(offset(START, { name: 'UTC' })).toBe(0);
		expect(offset(START, { name: 'Asia/Kathmandu' })).toBe(5 * 3600 + 45 * 60);
		expect(offset(START, { name: 'America/New_York' })).toBe(-4 * 3600);
	});

	it('puts ticks on the round hours of the zone asked, not of the runtime', () => {
		const ticks = zonedTicks(START, START + 6 * 3600, 6, { name: 'Asia/Kathmandu' });
		const ahead = offset(START, { name: 'Asia/Kathmandu' });
		for (const tick of ticks) expect((tick.getTime() / 1000 + ahead) % 3600).toBe(0);
		expect(moment((ticks[0]?.getTime() ?? 0) / 1000, { name: 'Asia/Kathmandu' })).toBe(
			'Sep 21, 08:00:00 PM',
		);
	});
});
