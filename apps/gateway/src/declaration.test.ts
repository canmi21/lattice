import { describe, expect, it } from 'vitest';
import { GATEWAY_DEFAULTS, lifetimeOf, routesOf } from './declaration.ts';

describe('a lifetime as written', () => {
	it.each([
		['30s', 30],
		['15m', 900],
		['1h', 3_600],
		['1d', 86_400],
		['none', 0],
		['immutable', 'immutable'],
	])('%s is %s', (written, kept) => {
		expect(lifetimeOf(written)).toBe(kept);
	});

	it('refuses what it cannot read, and anything past a year', () => {
		expect(() => lifetimeOf('15 minutes')).toThrow();
		expect(() => lifetimeOf('2y')).toThrow();
		expect(() => lifetimeOf('366d')).toThrow();
	});
});

describe("a service's routes", () => {
	it('falls to the gateway for everything nobody declares, as /*', () => {
		expect(routesOf('bare', {})).toEqual([{ path: '/*', ...GATEWAY_DEFAULTS }]);
	});

	it('looks each lifetime up on the route, then the defaults, then the gateway', () => {
		const [route, rest] = routesOf('svc', {
			defaults: { cache: { success: { fulfilled: '1m' }, failure: { faulted: 'none' } } },
			routes: [{ path: '/fast', cache: { success: { fulfilled: '5s' } } }],
		});
		expect(route?.cache).toEqual({
			fulfilled: 5,
			accepted: 0,
			redirected: 900,
			rejected: 300,
			faulted: 0,
		});
		expect(rest?.cache).toMatchObject({ fulfilled: 60, faulted: 0 });
	});

	it('matches exact before prefix, and the longer prefix first, whatever the written order', () => {
		const paths = routesOf('svc', {
			routes: [{ path: '/a/*' }, { path: '/a/b/*' }, { path: '/a/b' }],
		}).map((route) => route.path);
		expect(paths).toEqual(['/a/b', '/a/b/*', '/a/*', '/*']);
	});

	it('keeps a 202 nowhere unless a route says otherwise, apart from what a 200 keeps', () => {
		const [status, rest] = routesOf('svc', {
			routes: [{ path: '/status', cache: { success: { fulfilled: '5m' } } }],
		});
		expect(status?.cache).toMatchObject({ fulfilled: 300, accepted: 0 });
		expect(rest?.cache.accepted).toBe(0);
		const [kept] = routesOf('svc', { defaults: { cache: { success: { accepted: '5s' } } } });
		expect(kept?.cache.accepted).toBe(5);
	});

	it('gives a browser nothing unless cors is declared, and lets a route take it away', () => {
		const [closed, open] = routesOf('svc', {
			defaults: { cors: { origins: 'public' } },
			routes: [{ path: '/private', cors: false }],
		});
		expect(closed).not.toHaveProperty('cors');
		expect(open?.cors).toEqual({ origins: 'public', methods: ['GET', 'HEAD'], headers: [] });
	});

	it('names callers by service code', () => {
		const [route] = routesOf('svc', {
			routes: [{ path: '/send', cors: { origins: ['status'], methods: ['POST'] } }],
		});
		expect(route?.cors?.origins).toEqual(['status']);
	});

	it.each([
		['a field nobody reads', { defaults: { cahce: {} } }, /cahce/],
		['a service code nobody declares', { defaults: { cors: { origins: ['nobody'] } } }, /cors/],
		[
			'a lifetime it cannot read',
			{ defaults: { cache: { success: { fulfilled: '1w' } } } },
			/lifetime/,
		],
		['a kind of answer that is not one', { defaults: { cache: { success: { ok: '1m' } } } }, /ok/],
		['a star in the middle', { routes: [{ path: '/a/*/b' }] }, /path/],
		['the same path twice', { routes: [{ path: '/a' }, { path: '/a' }] }, /twice/],
		['/* as a route', { routes: [{ path: '/*' }] }, /defaults/],
	])('refuses %s, naming the service', (_, api, reason) => {
		expect(() => routesOf('svc', api)).toThrow(/^svc: /);
		expect(() => routesOf('svc', api)).toThrow(reason);
	});
});
