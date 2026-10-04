import { describe, expect, it } from 'vitest';
import { addressOf, checksOf, type Row } from './key.ts';

describe('addressOf', () => {
	it('counts IPv4 whole, and IPv4 written as IPv6 as itself', () => {
		expect(addressOf('198.51.100.7')).toBe('198.51.100.7');
		expect(addressOf('::ffff:198.51.100.7')).toBe('198.51.100.7');
	});

	it('counts IPv6 by its /64, however it is written', () => {
		const block = '2001:db8:85a3:8d3::/64';
		expect(addressOf('2001:0db8:85a3:08d3:1319:8a2e:0370:7344')).toBe(block);
		expect(addressOf('2001:DB8:85a3:8d3::1')).toBe(block);
		expect(addressOf('2001:db8:85a3:8d3:ffff::')).toBe(block);
		expect(addressOf('::1')).toBe('0:0:0:0::/64');
	});

	it('refuses what is no address', () => {
		for (const written of ['', 'nobody', '1:2:3', '1::2::3', '12345::', 'g::1']) {
			expect(addressOf(written), written).toBeUndefined();
		}
	});
});

describe('checksOf', () => {
	const ROWS: Row[] = [
		{ methods: ['POST'], path: '/tasks', count: 3, seconds: 60 },
		{ methods: ['POST'], path: '/tasks', subject: 'account', count: 30, seconds: 60, burst: 5 },
		{ methods: ['GET'], path: '/pictures/*', count: 60, seconds: 60 },
	];

	it('names the service, the row and the subject, and no host or version', () => {
		const checks = checksOf('shot', ROWS, {
			method: 'GET',
			path: '/pictures/a.png',
			subjects: { address: '198.51.100.7' },
		});
		expect(checks).toEqual([
			{ key: 'shot_get_pictures-any_address-198.51.100.7', rate: { count: 60, seconds: 60 } },
		]);
	});

	it('stacks a row of each kind the call carries, the address first', () => {
		const call = { method: 'POST', path: '/tasks' };
		const signed = checksOf('shot', ROWS, {
			...call,
			subjects: { account: 'u1', address: '192.0.2.1' },
		});
		expect(signed.map((check) => check.key)).toEqual([
			'shot_post_tasks_address-192.0.2.1',
			'shot_post_tasks_account-u1',
		]);
		expect(signed[1]?.rate).toEqual({ count: 30, seconds: 60, burst: 5 });
		const anonymous = checksOf('shot', ROWS, { ...call, subjects: { address: '192.0.2.1' } });
		expect(anonymous).toHaveLength(1);
	});

	it('counts nothing a row does not cover, or a call with no subject', () => {
		expect(
			checksOf('shot', ROWS, { method: 'GET', path: '/tasks', subjects: { address: 'a' } }),
		).toEqual([]);
		expect(checksOf('shot', ROWS, { method: 'POST', path: '/tasks', subjects: {} })).toEqual([]);
	});
});
