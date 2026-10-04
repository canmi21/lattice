import { afterEach, describe, expect, it, vi } from 'vitest';
import { URLS } from '@monoflake/sdk';
import { UNCHANGING } from '@canmi/cache';
import { CACHE_HEADER, controlOf, kindOf, secondsOf } from './cache.ts';
import { GATEWAY_DEFAULTS } from './declaration.ts';
import { gateway } from './index.ts';
import type { Scope } from './table.ts';

const HOST = new URL(URLS.apps.production.api).origin;

const answer = (status: number, headers: Record<string, string> = {}) =>
	new Response('{}', { status, headers: { 'content-type': 'application/json', ...headers } });

describe('which kind an answer is, and what it is told', () => {
	it('names the five by status, a 202 apart and no answer a fault', () => {
		expect(kindOf(200)).toBe('fulfilled');
		expect(kindOf(204)).toBe('fulfilled');
		expect(kindOf(202)).toBe('accepted');
		expect(kindOf(301)).toBe('redirected');
		expect(kindOf(404)).toBe('rejected');
		expect(kindOf(503)).toBe('faulted');
		expect(kindOf(200, true)).toBe('faulted');
	});

	it('tells a cache after it the lifetime, or to keep nothing', () => {
		expect(controlOf(300)).toBe('public, max-age=300');
		expect(controlOf(0)).toBe('no-store');
		expect(controlOf('immutable')).toBe(UNCHANGING);
		expect(secondsOf('immutable')).toBe(31_536_000);
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
		const app = gateway({
			geo: {
				placement: 'home',
				binding: 'HOME',
				limits: [{ methods: ['GET'], path: '/address', count: 60, seconds: 60 }],
				routes: [],
			},
		});
		const { seen, env } = node(() => answer(200));
		const QUOTA = {
			take: async (checks: readonly { key: string }[]) => (
				counted.push(...checks.map((check) => check.key)),
				{ allowed: true, retryAfter: 0 }
			),
		};
		const ask = () =>
			app.fetch(
				new Request(`${HOST}/v1/geo/address?latitude=1`, {
					headers: { 'cf-connecting-ip': '192.0.2.1' },
				}),
				{ ...env, QUOTA },
			);
		const first = await ask();
		expect(first.headers.get(CACHE_HEADER)).toBe('miss');
		const second = await ask();
		expect(second.headers.get(CACHE_HEADER)).toBe('hit');
		expect(await second.text()).toBe('{}');
		expect(seen).toHaveLength(1);
		expect(counted).toHaveLength(1);
		expect(put).toEqual([`${HOST}/v1/geo/address?latitude=1 public, max-age=900`]);
	});

	it('answers a kept answer with its route lifetime, whatever the cache handed back', async () => {
		const { kept } = install();
		const app = gateway(table);
		const { env } = node(() => answer(404));
		await app.fetch(new Request(`${HOST}/v1/geo/a`), env);
		// What a zone's browser lifetime makes of it on the way back out of Cloudflare's cache.
		const stored = kept.get(`${HOST}/v1/geo/a`) as Response;
		const rewritten = new Headers(stored.headers);
		rewritten.set('cache-control', 'public, max-age=14400');
		kept.set(`${HOST}/v1/geo/a`, new Response('{}', { status: stored.status, headers: rewritten }));
		const hit = await app.fetch(new Request(`${HOST}/v1/geo/a`), env);
		expect(hit.headers.get(CACHE_HEADER)).toBe('hit');
		expect(hit.headers.get('cache-control')).toBe(controlOf(GATEWAY_DEFAULTS.cache.rejected));
	});

	it("keeps by the route's word, not the service's, and nothing for a credential or a write", async () => {
		const { put } = install();
		const app = gateway(table);
		const { seen, env } = node(() => answer(200, { 'cache-control': 'no-store' }));
		const said = await app.fetch(new Request(`${HOST}/v1/geo/a`), env);
		expect(said.headers.get('cache-control')).toBe('public, max-age=900');
		await app.fetch(new Request(`${HOST}/v1/geo/a`), env);
		const open = node(() => answer(200));
		await app.fetch(
			new Request(`${HOST}/v1/geo/b`, { headers: { authorization: 'Bearer x' } }),
			open.env,
		);
		await app.fetch(new Request(`${HOST}/v1/geo/b`, { method: 'POST', body: 'x' }), open.env);
		await app.fetch(new Request(`${HOST}/v1/geo/b`, { method: 'HEAD' }), open.env);
		expect(seen).toHaveLength(1);
		expect(put).toEqual([`${HOST}/v1/geo/a public, max-age=900`]);
	});

	it('keeps its own failure to reach the node as the route keeps a fault', async () => {
		const { put } = install();
		const app = gateway(table);
		const down = {
			HOME: { fetch: async () => Promise.reject(new Error('tunnel down')) } as unknown as Fetcher,
		};
		const answered = await app.fetch(new Request(`${HOST}/v1/geo/address`), down);
		expect(answered.status).toBe(502);
		expect(put).toEqual([`${HOST}/v1/geo/address public, max-age=300`]);
	});

	it('gives HEAD what GET kept, without its body', async () => {
		install();
		const app = gateway(table);
		const { env } = node(() => answer(200));
		await app.fetch(new Request(`${HOST}/v1/geo/c`), env);
		const head = await app.fetch(new Request(`${HOST}/v1/geo/c`, { method: 'HEAD' }), env);
		expect(head.headers.get(CACHE_HEADER)).toBe('hit');
		expect(await head.text()).toBe('');
	});

	it('keeps neither a range asked for nor a part answered', async () => {
		const { put } = install();
		const app = gateway(table);
		const ranged = node(() => answer(206, { 'content-range': 'bytes 0-1/10' }));
		await app.fetch(
			new Request(`${HOST}/v1/geo/r`, { headers: { range: 'bytes=0-1' } }),
			ranged.env,
		);
		const partial = node(() => answer(206));
		await app.fetch(new Request(`${HOST}/v1/geo/p`), partial.env);
		expect(put).toEqual([]);
	});

	it('keeps nothing for a route that declares none', async () => {
		const { put } = install();
		const app = gateway({
			geo: {
				placement: 'home',
				binding: 'HOME',
				routes: [
					{
						...GATEWAY_DEFAULTS,
						path: '/*',
						cache: { fulfilled: 0, accepted: 0, redirected: 0, rejected: 0, faulted: 0 },
					},
				],
			},
		});
		const { seen, env } = node(() => answer(200));
		await app.fetch(new Request(`${HOST}/v1/geo/d`), env);
		await app.fetch(new Request(`${HOST}/v1/geo/d`), env);
		expect(seen).toHaveLength(2);
		expect(put).toEqual([]);
	});
});
