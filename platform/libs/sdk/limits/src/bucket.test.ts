import { describe, expect, it } from 'vitest';
import { type Rate, take } from './bucket.ts';

/** Every call of `times` at `now`, the bucket's `due` carried from one to the next. */
function run(rate: Rate, times: readonly number[], due?: number) {
	const answers: boolean[] = [];
	let kept = due;
	for (const now of times) {
		const taken = take(kept, rate, now);
		answers.push(taken.allowed);
		kept = taken.due;
	}
	return { answers, due: kept };
}

describe('take', () => {
	it('lets a burst through at once and refuses the call after it', () => {
		const { answers } = run({ count: 60, seconds: 60, burst: 3 }, [0, 0, 0, 0]);
		expect(answers).toEqual([true, true, true, false]);
	});

	it('takes the burst to be the count when it is not named', () => {
		const { answers } = run({ count: 2, seconds: 60 }, [0, 0, 0]);
		expect(answers).toEqual([true, true, false]);
	});

	it('gives room back at the rate, one call an interval', () => {
		const rate = { count: 60, seconds: 60, burst: 1 };
		const { answers } = run(rate, [0, 500, 1000, 1999, 2000]);
		expect(answers).toEqual([true, false, true, false, true]);
	});

	it('holds a long run to the burst plus the rate, however the calls are spread', () => {
		const rate = { count: 10, seconds: 10, burst: 5 };
		const times = Array.from({ length: 1000 }, (_, index) => index * 37);
		const passed = run(rate, times).answers.filter(Boolean).length;
		const span = (times.at(-1) as number) / 1000;
		expect(passed).toBeLessThanOrEqual(5 + Math.ceil(span));
		expect(passed).toBeGreaterThanOrEqual(Math.floor(span));
	});

	it('says to the second when the next call passes, and spends nothing on a refusal', () => {
		const rate = { count: 1, seconds: 30 };
		const first = take(undefined, rate, 0);
		const refused = take(first.due, rate, 1000);
		expect(refused).toMatchObject({ allowed: false, retryAfter: 29, due: first.due });
		expect(take(refused.due, rate, 30_000).allowed).toBe(true);
	});

	it('never says less than a second', () => {
		const rate = { count: 1000, seconds: 1, burst: 1 };
		const first = take(undefined, rate, 0);
		expect(take(first.due, rate, 0).retryAfter).toBe(1);
	});
});
