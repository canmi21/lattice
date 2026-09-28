import * as v from 'valibot';
import { describe, expect, it } from 'vitest';
import { addresses, addressOf, CONTRACTS } from './contracts';
import { ROUTES } from './routes';

describe('addresses', () => {
	it('gives every route one, and no two routes the same', () => {
		const all = addresses();
		expect(Object.keys(all).toSorted()).toEqual([...ROUTES].toSorted());
		expect(new Set(Object.values(all)).size).toBe(ROUTES.length);
		expect(Object.keys(CONTRACTS).toSorted()).toEqual([...ROUTES].toSorted());
	});

	it('stays put while the contract does, and moves with any part of it', () => {
		const base = { schemas: [v.object({ count: v.number() })], revision: 1 };
		const same = { schemas: [v.object({ count: v.number() })], revision: 1 };
		expect(addressOf('stats', base)).toBe(addressOf('stats', same));
		expect(addressOf('stats', base)).not.toBe(addressOf('read', base));
		expect(addressOf('stats', base)).not.toBe(addressOf('stats', { ...base, revision: 2 }));
		const renamed = { schemas: [v.object({ total: v.number() })], revision: 1 };
		expect(addressOf('stats', base)).not.toBe(addressOf('stats', renamed));
		const retyped = { schemas: [v.object({ count: v.string() })], revision: 1 };
		expect(addressOf('stats', base)).not.toBe(addressOf('stats', retyped));
		const limited = { schemas: [v.pipe(v.array(v.string()), v.maxLength(3))], revision: 1 };
		const widened = { schemas: [v.pipe(v.array(v.string()), v.maxLength(4))], revision: 1 };
		expect(addressOf('batch', limited)).not.toBe(addressOf('batch', widened));
	});
});
