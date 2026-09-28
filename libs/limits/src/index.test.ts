import { describe, expect, it } from 'vitest';
import { type Limit, limited, within } from './index.ts';

const LIMITS: Limit[] = [
	{ methods: ['PUT'], path: '/like', limiter: 'LIKE' },
	{ methods: ['GET'], path: '/like', limiter: 'READS' },
];

function limiter(success: boolean) {
	const keys: string[] = [];
	return {
		binding: { limit: async ({ key }: { key: string }) => (keys.push(key), { success }) },
		keys,
	};
}

describe('within', () => {
	it('counts by the address, in the first limit covering the method and path', async () => {
		const like = limiter(false);
		const reads = limiter(true);
		const env = { LIKE: like.binding, READS: reads.binding };
		const address = '192.0.2.1';
		expect(await within(LIMITS, env, { method: 'PUT', path: '/like', address })).toBe(false);
		expect(await within(LIMITS, env, { method: 'GET', path: '/like', address })).toBe(true);
		expect(like.keys).toEqual([address]);
		expect(reads.keys).toEqual([address]);
	});

	it('leaves alone what no limit covers, and a caller with no address', async () => {
		const env = { LIKE: limiter(false).binding };
		expect(await within(LIMITS, env, { method: 'POST', path: '/like', address: '192.0.2.1' })).toBe(
			true,
		);
		expect(await within(LIMITS, env, { method: 'PUT', path: '/like', address: undefined })).toBe(
			true,
		);
	});

	it('refuses rather than skips a limit whose binding is missing', async () => {
		expect(await within(LIMITS, {}, { method: 'PUT', path: '/like', address: '192.0.2.1' })).toBe(
			false,
		);
	});
});

it('answers in the envelope, with a retry hint', async () => {
	const answer = limited();
	expect(answer.status).toBe(429);
	expect(answer.headers.get('retry-after')).toBe('60');
	expect(await answer.json()).toEqual({ status: 'error', message: 'rate_limited' });
});
