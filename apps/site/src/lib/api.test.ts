import { describe, expect, it, vi } from 'vitest';
import { apiPath, readAddress } from './api';

describe("the pages' addresses for the API, in development", () => {
	it('asks at the shape, the thing in the path and the rest in the query', () => {
		expect(apiPath('article', { slug: 'a-b', locale: 'ja' })).toBe('/api/articles/a-b?locale=ja');
		expect(apiPath('read', { slug: 'a-b' })).toBe('/api/articles/a-b/reads');
		expect(apiPath('newsletter')).toBe('/api/subscriptions');
		expect(() => apiPath('read')).toThrow();
	});

	it('reads an address back into its route and the query its handler takes', () => {
		expect(readAddress('articles/a-b/source')).toEqual({ route: 'source', query: { slug: 'a-b' } });
		expect(readAddress('assets/aka/favicon.ico')).toEqual({
			route: 'asset',
			query: { name: 'aka/favicon.ico' },
		});
		expect(readAddress('article')).toBeUndefined();
	});
});

describe("the pages' addresses for the API, in production", () => {
	it('asks at the contract address, then the thing in the path, and reads it back', async () => {
		const { ROUTES } = await import('@canmi/site-api/routes');
		const stated = Object.fromEntries(ROUTES.map((route, i) => [route, `${i}`.padStart(12, 'a')]));
		vi.stubGlobal('STATED_API_ADDRESSES', stated);
		vi.resetModules();
		try {
			const { apiPath, readAddress } = await import('./api');
			const read = apiPath('read', { slug: 'a-b' });
			expect(read).toBe(`/api/${stated.read}/a-b`);
			expect(readAddress(read.slice('/api/'.length))).toEqual({
				route: 'read',
				query: { slug: 'a-b' },
			});
			expect(apiPath('stats')).toBe(`/api/${stated.stats}`);
			expect(readAddress('articles/a-b/reads')).toBeUndefined();
		} finally {
			vi.unstubAllGlobals();
			vi.resetModules();
		}
	});
});
