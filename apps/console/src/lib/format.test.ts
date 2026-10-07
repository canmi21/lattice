import { describe, expect, it } from 'vitest';
import { localTime } from './format.ts';

describe('a moment for a title', () => {
	it('is written in the zone it is handed, UTC without one, whatever the runtime zone', () => {
		const stamp = '2026-10-06T23:30:05Z';
		expect(localTime(stamp)).toBe('Oct 6, 11:30:05 PM');
		expect(localTime(stamp, 'Asia/Tokyo')).toBe('Oct 7, 08:30:05 AM');
	});

	it('gives back what it cannot read as it came', () => {
		expect(localTime('soon', 'Asia/Tokyo')).toBe('soon');
	});
});
