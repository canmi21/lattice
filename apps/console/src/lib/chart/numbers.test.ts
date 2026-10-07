import { describe, expect, it } from 'vitest';
import { compact, duration, percent, signed } from './numbers.ts';

describe('compact', () => {
	it('groups under ten thousand and shortens above it', () => {
		expect(compact(1284)).toBe('1,284');
		expect(compact(12_900)).toBe('12.9K');
		expect(compact(4_200_000)).toBe('4.2M');
		expect(compact(Number.NaN)).toBe('');
	});
});

describe('percent', () => {
	it('keeps a decimal only under ten', () => {
		expect(percent(0.042)).toBe('4.2%');
		expect(percent(0.5)).toBe('50%');
		expect(percent(0)).toBe('0%');
	});
});

describe('signed', () => {
	it('always writes the sign, and none on nothing', () => {
		expect(signed(4.2)).toBe('+4.2');
		expect(signed(-12_900)).toBe('-12.9K');
		expect(signed(0)).toBe('0');
	});
});

describe('duration', () => {
	it('says a length in its two largest units', () => {
		expect(duration(0.42)).toBe('420 ms');
		expect(duration(4.25)).toBe('4.3 s');
		expect(duration(42)).toBe('42 s');
		expect(duration(184)).toBe('3 min 4 s');
		expect(duration(180)).toBe('3 min');
		expect(duration(7500)).toBe('2 h 5 min');
		expect(duration(90_000)).toBe('1 d 1 h');
		expect(duration(-1)).toBe('');
	});
});
