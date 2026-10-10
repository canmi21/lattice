import { describe, expect, it } from 'vitest';
import { contractAddress } from './build';
import { asking, pathOf, routeOf } from './index';

const SHAPES = { one: 'things/{slug}', all: 'things' } as const;

describe('addresses by shape', () => {
	it('asks at the shape where nothing was stated, and reads it back', () => {
		const asked = asking(SHAPES, undefined);
		expect(pathOf(asked, '/api/', 'one', { slug: 'a b', at: '1' })).toBe('/api/things/a%20b?at=1');
		expect(routeOf(asked, 'things/a%20b')).toEqual({ route: 'one', query: { slug: 'a b' } });
		expect(routeOf(asked, 'nothing')).toBeUndefined();
	});

	it('asks at the stated address, then the thing in the path', () => {
		const asked = asking(SHAPES, { one: 'aaaaaaaaaaaa', all: 'bbbbbbbbbbbb' });
		expect(pathOf(asked, '/api/', 'one', { slug: 'x' })).toBe('/api/aaaaaaaaaaaa/x');
		expect(pathOf(asked, '/api/', 'all')).toBe('/api/bbbbbbbbbbbb');
		expect(routeOf(asked, 'things/x')).toBeUndefined();
	});
});

describe('a contract address', () => {
	it('moves with the name, the revision and the contract, and with nothing else', () => {
		const one = contractAddress('one', 1, { a: 1, b: [2] });
		expect(one).toMatch(/^[0-9a-f]{12}$/);
		expect(contractAddress('one', 1, { b: [2], a: 1 })).toBe(one);
		expect(contractAddress('one', 2, { a: 1, b: [2] })).not.toBe(one);
		expect(contractAddress('two', 1, { a: 1, b: [2] })).not.toBe(one);
		expect(contractAddress('one', 1, { a: 1, b: [3] })).not.toBe(one);
	});
});
