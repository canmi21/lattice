import { afterEach, describe, expect, it, vi } from 'vitest';
import { URLS } from '@canmi/urls';
import { CACHE_HEADER, DEFAULT_LIFETIME, secondsFor, UNREACHED_SECONDS } from './cache.ts';
import { gateway } from './index.ts';
import type { Scope } from './table.ts';

const HOST = new URL(URLS.apps.production.api).origin;

const answer = (status: number, headers: Record<string, string> = {}) =>
	new Response('{}', { status, headers: { 'content-type': 'application/json', ...headers } });

describe('how long an answer is kept', () => {
	it("takes the service's word first", () => {
		expect(secondsFor(answer(200, { 'cache-control': 'no-store' }), undefined)).toBe(0);
		expect(secondsFor(answer(200, { 'cache-control': 'private, max-age=60' }), undefined)).toBe(0);
		expect(secondsFor(answer(200, { 'cache-control': 'public, max-age=900' }), undefined)).toBe(
			900,
		);
		expect(secondsFor(answer(200, { 'cache-control': 's-maxage=86400' }), { success: 5 })).toBe(
			86400,
		);
	});

	it("takes the scope's otherwise, and five minutes for both when it says nothing", () => {
		expect(secondsFor(answer(200), undefined)).toBe(DEFAULT_LIFETIME.success);
		expect(secondsFor(answer(404), undefined)).toBe(DEFAULT_LIFETIME.failure);
		expect(secondsFor(answer(200), { success: 86400 })).toBe(86400);
		expect(secondsFor(answer(404), { success: 86400 })).toBe(DEFAULT_LIFETIME.failure);
		expect(secondsFor(answer(200), false)).toBe(0);
	});

	it('keeps its own failure to reach a service briefly, and nothing that sets a cookie', () => {
		expect(secondsFor(answer(502), undefined, true)).toBe(UNREACHED_SECONDS);
		expect(secondsFor(answer(200, { 'set-cookie': 'a=1' }), undefined)).toBe(0);
	});
});

describe('the cache at the gateway', () => {
	/** A cache that keeps by address, as a location's does, and remembers what it was given. */
	function install() {
		const kept = new Map<string, Response>();
		const put: string[] = [];
		const cache = {
			match: async (request: Request) => kept.get(request.url)?.clone(),
			put: async (request: Request, response: Response) => {
				put.push(`${request.url} ${response.headers.get('cache-control')}`);
				kept.set(request.url, response);
			},
		};
		vi.stubGlobal('caches', { default: cache });
		return { kept, put };
	}

	afterEach(() => vi.unstubAllGlobals());

	const table: Record<string, Scope> = { geo: { placement: 'home', binding: 'HOME', routes: [] } };

	function node(respond: (request: Request) => Response) {
		const seen: Request[] = [];
		return {
			seen,
			env: {
				HOME: {
					fetch: async (request: Request) => (seen.push(request), respond(request)),
				} as unknown as Fetcher,
			},
		};
	}

	it('answers a repeat from the cache without reaching the service, or a limit', async () => {
		const { put } = install();
		const counted: string[] = [];
		const app = gateway(
			{
				geo: {
					placement: 'home',
					binding: 'HOME',
					limits: [{ methods: ['GET'], path: '/address', count: 60, seconds: 60 }],
					routes: [],
				},
			},
			{},
		);
		const { seen, env } = node(() => answer(200));
		const LIMITS = {
			idFromName: (name: string) => name,
			get: (name: string) => ({
				take: async () => (counted.push(name), { allowed: true, retryAfter: 0 }),
			}),
		};
		const ask = () =>
			app.fetch(
				new Request(`${HOST}/geo/address?latitude=1`, {
					headers: { 'cf-connecting-ip': '192.0.2.1' },
				}),
				{ ...env, limits: LIMITS },
			);
		const first = await ask();
		expect(first.headers.get(CACHE_HEADER)).toBe('miss');
		const second = await ask();
		expect(second.headers.get(CACHE_HEADER)).toBe('hit');
		expect(await second.text()).toBe('{}');
		expect(seen).toHaveLength(1);
		expect(counted).toHaveLength(1);
		expect(put).toEqual([`${HOST}/geo/address?latitude=1 public, max-age=300`]);
	});

	it('keeps nothing the service says not to, nor what a credential asked for, nor a write', async () => {
		const { put } = install();
		const app = gateway(table, {});
		const { seen, env } = node(() => answer(200, { 'cache-control': 'no-store' }));
		await app.fetch(new Request(`${HOST}/geo/a`), env);
		await app.fetch(new Request(`${HOST}/geo/a`), env);
		const open = node(() => answer(200));
		await app.fetch(
			new Request(`${HOST}/geo/b`, { headers: { authorization: 'Bearer x' } }),
			open.env,
		);
		await app.fetch(new Request(`${HOST}/geo/b`, { method: 'POST', body: 'x' }), open.env);
		await app.fetch(new Request(`${HOST}/geo/b`, { method: 'HEAD' }), open.env);
		expect(seen).toHaveLength(2);
		expect(put).toEqual([]);
	});

	it('keeps its own failure to reach the node for thirty seconds', async () => {
		const { put } = install();
		const app = gateway(table, {});
		const down = {
			HOME: { fetch: async () => Promise.reject(new Error('tunnel down')) } as unknown as Fetcher,
		};
		const answered = await app.fetch(new Request(`${HOST}/geo/address`), down);
		expect(answered.status).toBe(502);
		expect(put).toEqual([`${HOST}/geo/address public, max-age=30`]);
	});

	it('gives HEAD what GET kept, without its body', async () => {
		install();
		const app = gateway(table, {});
		const { env } = node(() => answer(200));
		await app.fetch(new Request(`${HOST}/geo/c`), env);
		const head = await app.fetch(new Request(`${HOST}/geo/c`, { method: 'HEAD' }), env);
		expect(head.headers.get(CACHE_HEADER)).toBe('hit');
		expect(await head.text()).toBe('');
	});

	it('keeps nothing for a scope that asks for none', async () => {
		const { put } = install();
		const app = gateway(table, { geo: { cache: false } });
		const { seen, env } = node(() => answer(200));
		await app.fetch(new Request(`${HOST}/geo/d`), env);
		await app.fetch(new Request(`${HOST}/geo/d`), env);
		expect(seen).toHaveLength(2);
		expect(put).toEqual([]);
	});
});
