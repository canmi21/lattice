import { describe, expect, it } from 'vitest';
import { take } from './window.ts';

describe('a sliding window', () => {
	it('allows up to the count, then says when the oldest call leaves the window', () => {
		const log: number[] = [];
		expect([0, 1_000, 2_000].map((at) => take(log, 3, 60, at).allowed)).toEqual([true, true, true]);
		expect(take(log, 3, 60, 10_000)).toEqual({ allowed: false, retryAfter: 50 });
		// A refusal is not counted: the window still frees at sixty seconds from the first call.
		expect(take(log, 3, 60, 59_999)).toEqual({ allowed: false, retryAfter: 1 });
		expect(take(log, 3, 60, 60_000).allowed).toBe(true);
		expect(log).toEqual([1_000, 2_000, 60_000]);
	});

	it('slides rather than resetting on a boundary', () => {
		const log: number[] = [];
		take(log, 2, 10, 9_000);
		take(log, 2, 10, 9_500);
		// A fixed window would reset at ten seconds and allow two more at once.
		expect(take(log, 2, 10, 10_100).allowed).toBe(false);
		expect(take(log, 2, 10, 19_001).allowed).toBe(true);
	});
});
