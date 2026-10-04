import { describe, expect, it } from 'vitest';
import { type Check, takeInOrder } from './index.ts';

const RATE = { count: 1, seconds: 1 };

describe('takeInOrder', () => {
	it('stops at the first refusal, asking nothing after it', async () => {
		const asked: string[] = [];
		const checks: Check[] = ['a', 'b', 'c'].map((key) => ({ key, rate: RATE }));
		const taken = await takeInOrder(checks, ({ key }) => {
			asked.push(key);
			return key === 'b' ? { allowed: false, retryAfter: 7 } : { allowed: true, retryAfter: 0 };
		});
		expect(taken).toEqual({ allowed: false, retryAfter: 7 });
		expect(asked).toEqual(['a', 'b']);
	});

	it('allows a call with no bucket', async () => {
		expect(await takeInOrder([], () => ({ allowed: false, retryAfter: 1 }))).toEqual({
			allowed: true,
			retryAfter: 0,
		});
	});
});
