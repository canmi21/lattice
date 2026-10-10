import { describe, expect, it } from 'vitest';
import { offsetOf, served } from './time-zone.ts';

describe('the zone the server draws with', () => {
	const jar = (value?: string) => ({ get: () => value });
	const guess = { timezone: 'America/New_York' };

	it('is the one the cookie names, whatever Cloudflare guesses', () => {
		expect(served(jar('Asia/Kolkata'), guess)).toEqual({ name: 'Asia/Kolkata' });
		expect(served(jar('UTC'), guess)).toEqual({ name: 'UTC' });
	});

	it('is the one Cloudflare names where the cookie is absent or names no zone', () => {
		expect(served(jar(), guess)).toEqual({ name: 'America/New_York' });
		expect(served(jar(''), guess)).toEqual({ name: 'America/New_York' });
		expect(served(jar('Mars/Olympus'), guess)).toEqual({ name: 'America/New_York' });
		expect(served(jar('+5.5'), guess)).toEqual({ name: 'America/New_York' });
	});

	it('is UTC with neither', () => {
		expect(served(jar(), undefined)).toEqual({ name: 'UTC' });
		expect(served(jar('Mars/Olympus'), { timezone: 'Mars/Olympus' })).toEqual({ name: 'UTC' });
	});
});

describe('offsetOf', () => {
	// A summer moment, so a zone that keeps daylight time is on it.
	const july = Date.UTC(2026, 6, 1, 12);
	const january = Date.UTC(2026, 0, 1, 12);

	it('writes UTC itself as UTC+0, never a bare UTC or GMT', () => {
		expect(offsetOf({ name: 'UTC' }, july)).toBe('UTC+0');
		expect(offsetOf({ name: 'Europe/London' }, january)).toBe('UTC+0');
	});

	it('writes an offset with its sign, and its minutes where it has them', () => {
		expect(offsetOf({ name: 'America/New_York' }, july)).toBe('UTC-4');
		expect(offsetOf({ name: 'America/New_York' }, january)).toBe('UTC-5');
		expect(offsetOf({ name: 'Asia/Tokyo' }, july)).toBe('UTC+9');
		expect(offsetOf({ name: 'Asia/Kolkata' }, july)).toBe('UTC+5:30');
	});
});
