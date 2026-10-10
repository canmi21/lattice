import { describe, expect, it } from 'vitest';
import { localTime } from './format.ts';

describe('a moment for a title', () => {
	it('is written in the zone it is handed, UTC without one, whatever the runtime zone', () => {
		const stamp = '2026-10-06T23:30:05Z';
		expect(localTime(stamp)).toBe('Oct 6, 11:30:05 PM');
		expect(localTime(stamp, { name: 'Asia/Tokyo' })).toBe('Oct 7, 08:30:05 AM');
	});

	it('is written in a zone half or a quarter of an hour off the hour', () => {
		const stamp = '2026-10-06T23:30:05Z';
		expect(localTime(stamp, { name: 'Asia/Kolkata' })).toBe('Oct 7, 05:00:05 AM');
		expect(localTime(stamp, { name: 'Asia/Kathmandu' })).toBe('Oct 7, 05:15:05 AM');
	});

	it('keeps the daylight time each moment had, not the one in force now', () => {
		const zone = { name: 'America/New_York' };
		expect(localTime('2026-01-15T14:00:00Z', zone)).toBe('Jan 15, 09:00:00 AM');
		expect(localTime('2026-07-15T14:00:00Z', zone)).toBe('Jul 15, 10:00:00 AM');
	});

	it('gives back what it cannot read as it came', () => {
		expect(localTime('soon', { name: 'Asia/Tokyo' })).toBe('soon');
	});
});
