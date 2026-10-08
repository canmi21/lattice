import { describe, expect, it } from 'vitest';
import { offsetOf } from './time-zone.ts';

describe('offsetOf', () => {
	// A summer moment, so a zone that keeps daylight time is on it.
	const july = Date.UTC(2026, 6, 1, 12);
	const january = Date.UTC(2026, 0, 1, 12);

	it('writes UTC itself as UTC+0, never a bare UTC or GMT', () => {
		expect(offsetOf('UTC', july)).toBe('UTC+0');
		expect(offsetOf('Europe/London', january)).toBe('UTC+0');
	});

	it('writes an offset with its sign, and its minutes where it has them', () => {
		expect(offsetOf('America/New_York', july)).toBe('UTC-4');
		expect(offsetOf('America/New_York', january)).toBe('UTC-5');
		expect(offsetOf('Asia/Tokyo', july)).toBe('UTC+9');
		expect(offsetOf('Asia/Kolkata', july)).toBe('UTC+5:30');
	});
});
