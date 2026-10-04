import { take } from '@canmi/limits';
import { describe, expect, it } from 'vitest';
import { type Buckets, takeAll } from './index.ts';

/** Buckets in a map, each the arithmetic the Durable Object runs, at a clock the test holds. */
function buckets(now: () => number) {
	const due = new Map<string, number | undefined>();
	const asked: string[] = [];
	const store: Buckets = {
		idFromName: (name) => name,
		get: (id) => ({
			take(rate) {
				const key = id as string;
				asked.push(key);
				const taken = take(due.get(key), rate, now());
				due.set(key, taken.due);
				return { allowed: taken.allowed, retryAfter: taken.retryAfter };
			},
		}),
	};
	return { store, asked };
}

describe('takeAll', () => {
	it('keeps one bucket a key, and leaves the next key alone once one refuses', async () => {
		const { store, asked } = buckets(() => 0);
		const address = { key: 'shot_post_tasks_address-a', rate: { count: 1, seconds: 60 } };
		const account = { key: 'shot_post_tasks_account-u', rate: { count: 5, seconds: 60 } };
		expect(await takeAll(store, [address, account])).toEqual({ allowed: true, retryAfter: 0 });
		expect(await takeAll(store, [address, account])).toEqual({ allowed: false, retryAfter: 60 });
		expect(asked).toEqual([address.key, account.key, address.key]);
	});
});
