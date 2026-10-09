import { describe, expect, it } from 'vitest';
import { viewBoxOf } from './optics.ts';

describe('viewBoxOf', () => {
	it('leaves a drawing with no correction as drawn', () => {
		expect(viewBoxOf({})).toBe('0 0 24 24');
	});

	it('moves the drawing by moving the canvas the other way', () => {
		expect(viewBoxOf({ x: 1.5 })).toBe('-1.5 0 24 24');
		expect(viewBoxOf({ y: -1 })).toBe('0 1 24 24');
	});

	it('scales about the center: a larger drawing is a smaller canvas around the same point', () => {
		expect(viewBoxOf({ scale: 1.2 })).toBe('2 2 20 20');
		expect(viewBoxOf({ scale: 0.8 })).toBe('-3 -3 30 30');
	});
});
