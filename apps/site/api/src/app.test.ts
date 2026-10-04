import { URLS } from '@canmi/urls';
import { describe, expect, it } from 'vitest';
import app from './app';
import type { Bindings } from './bindings';
import type { Api } from './boundary';
import { ROUTES } from './contract/routes';

const base = new URL(URLS.apps.production.site).origin;
const deny = { take: async () => ({ allowed: false, retryAfter: 42 }) };

describe('limits', () => {
	it('refuses a caller over the allowance before any handler runs', async () => {
		const res = await app.fetch(
			new Request(`${base}/like`, { method: 'PUT', headers: { 'CF-Connecting-IP': '192.0.2.1' } }),
			{ QUOTA: deny } as unknown as Bindings,
		);
		expect(res.status).toBe(429);
		expect(res.headers.get('Retry-After')).toBe('42');
		expect(await res.json()).toMatchObject({ status: 'error', code: 'rate_limited' });
	});
});

describe('an unknown route', () => {
	it('says so in the envelope', async () => {
		const res = await app.fetch(new Request(`${base}/nothing`), {} as Bindings);
		expect(res.status).toBe(404);
		expect(await res.json()).toMatchObject({ status: 'error', code: 'no_such_route' });
	});
});

describe('the route list', () => {
	it('is exactly the routes the app serves', () => {
		const served = new Set(
			app.routes.filter((route) => route.method !== 'ALL').map((route) => route.path.slice(1)),
		);
		expect(served).toEqual(new Set(ROUTES));
	});
});

describe('the boundary the site imports', () => {
	it('is what the app is', () => {
		// A type check more than a test: the workers program fails here if the declaration the
		// site's program reads stops describing the app.
		const declared: Api = app;
		expect(typeof declared.fetch).toBe('function');
	});
});
