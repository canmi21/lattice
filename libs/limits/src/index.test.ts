import { describe, expect, it, vi } from 'vitest';
import { type Check, counted, limited, type Row } from './index.ts';

const ROWS: Row[] = [
	{ methods: ['PUT'], path: '/like', count: 10, seconds: 60 },
	{ methods: ['GET'], path: '/like', count: 60, seconds: 60 },
];

function quota(allowed: boolean) {
	const asked: Check[] = [];
	return {
		asked,
		quota: {
			take: (checks: readonly Check[]) => (asked.push(...checks), { allowed, retryAfter: 9 }),
		},
	};
}

describe('counted', () => {
	it('asks quota for the row covering the method and path, by the address', async () => {
		const { asked, quota: door } = quota(false);
		const call = { method: 'PUT', path: '/like', address: '2001:db8::1' };
		expect(await counted(door, 'site', ROWS, call)).toEqual({ allowed: false, retryAfter: 9 });
		expect(asked).toEqual([
			{ key: 'site_put_like_address-2001:db8:0:0::/64', rate: { count: 10, seconds: 60 } },
		]);
	});

	it('leaves alone what no row covers, and a caller with no address', async () => {
		const { asked, quota: door } = quota(false);
		expect(
			(await counted(door, 'site', ROWS, { method: 'POST', path: '/like', address: 'a' })).allowed,
		).toBe(true);
		expect(
			(await counted(door, 'site', ROWS, { method: 'PUT', path: '/like', address: undefined }))
				.allowed,
		).toBe(true);
		expect(asked).toEqual([]);
	});

	it('refuses when the binding is missing, and lets through when quota fails', async () => {
		const call = { method: 'PUT', path: '/like', address: '192.0.2.1' };
		expect(await counted(undefined, 'site', ROWS, call)).toEqual({
			allowed: false,
			retryAfter: 60,
		});
		const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		const broken = { take: async () => Promise.reject(new Error('down')) };
		expect((await counted(broken, 'site', ROWS, call)).allowed).toBe(true);
		expect(error).toHaveBeenCalled();
		error.mockRestore();
	});
});

describe('limited', () => {
	it('says when to try again, in the envelope', async () => {
		const answer = limited({ allowed: false, retryAfter: 12 });
		expect(answer.status).toBe(429);
		expect(answer.headers.get('Retry-After')).toBe('12');
		expect(await answer.json()).toMatchObject({ status: 'error', code: 'rate_limited' });
	});
});
