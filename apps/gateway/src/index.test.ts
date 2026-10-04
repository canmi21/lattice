import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { developmentUrl, GATEWAY, PAGE_ORIGINS, URLS } from '@monoflake/sdk';
import { describe, expect, it, vi } from 'vitest';
import { declarations } from '../scripts/scopes.ts';
import { type Env, gateway, INTERNAL_HEADER, MARK } from './index.ts';
import { type Check, covers } from '@canmi/limits';
import { GATEWAY_DEFAULTS } from './declaration.ts';
import { SCOPES } from './scopes.ts';
import { type Scope, scopeTable, WORKERS } from './table.ts';

/** The public API host, whatever scope the site's own base names. */
const HOST = new URL(URLS.apps.production.api).origin;

/** wrangler.jsonc as data: its comments and trailing commas taken off, strings left alone. */
function wrangler(): {
	services: Array<{ binding: string; service: string }>;
	vpc_services: Array<{ binding: string }>;
	durable_objects?: { bindings: Array<{ name: string; class_name: string }> };
} {
	const text = readFileSync(join(import.meta.dirname, '../wrangler.jsonc'), 'utf8');
	const bare = text.replace(
		/("(?:\\.|[^"\\])*")|\/\/[^\n]*/g,
		(_match: string, string?: string) => string ?? '',
	);
	return JSON.parse(bare.replace(/,(\s*[}\]])/g, '$1'));
}

/** A binding that records the one request it is sent. */
function binding() {
	const seen: Request[] = [];
	const fetcher = {
		fetch: vi.fn(async (request: Request) => (seen.push(request), new Response('ok'))),
	};
	return { fetcher: fetcher as unknown as Fetcher, seen };
}

/** A `quota` that allows or refuses every call, and remembers which buckets it was asked. */
function counters(allowed: boolean) {
	const asked: Check[] = [];
	return {
		asked,
		counters: {
			take: async (checks: readonly Check[]) => (
				asked.push(...checks),
				{ allowed, retryAfter: allowed ? 0 : 7 }
			),
		},
	};
}

describe('the scope table', () => {
	it('is what the declarations say', () => {
		// A mismatch means a service.toml changed without `mise run scopes`.
		expect(SCOPES).toEqual(scopeTable(declarations()));
	});

	it('binds each Workers scope to its Worker, and each node to its VPC service', () => {
		const config = wrangler();
		const workers = Object.values(SCOPES)
			.filter((scope) => scope.placement === WORKERS)
			.map((scope) => ({ binding: scope.binding, service: scope.worker }));
		const scopes = config.services.filter((service) => service.binding !== 'QUOTA');
		expect(scopes.toSorted((a, b) => a.binding.localeCompare(b.binding))).toEqual(
			workers.toSorted((a, b) => a.binding.localeCompare(b.binding)),
		);
		const nodes = new Set(config.vpc_services.map((service) => service.binding));
		for (const scope of Object.values(SCOPES).filter((scope) => scope.placement !== WORKERS)) {
			expect(nodes).toContain(scope.binding);
		}
	});

	it("binds quota's inside door, which every limit is counted at", () => {
		expect(wrangler().services).toContainEqual({
			binding: 'QUOTA',
			service: 'quota',
			entrypoint: 'Internal',
		});
	});

	it('leaves out a scope that is not public', () => {
		const table = scopeTable([
			'version = 1\nname = "geo"\nplacements = ["home"]\n[api]\npublic = false\n',
			'version = 1\nname = "open"\nplacements = ["home"]\n[api]\npublic = true\n',
		]);
		expect(Object.keys(table)).toEqual(['open']);
		expect(table.open).toMatchObject({ placement: 'home', binding: 'HOME' });
	});
});

describe('a limit covering a call', () => {
	it('covers its own path exactly, or everything under a prefix ending in /*', () => {
		expect(covers('/checks', '/checks')).toBe(true);
		expect(covers('/checks', '/checks/a/results')).toBe(false);
		expect(covers('/checks/*', '/checks/a/results')).toBe(true);
		expect(covers('/checks/*', '/checks')).toBe(false);
	});
});

describe('the gateway', () => {
	const table: Record<string, Scope> = {
		site: {
			placement: WORKERS,
			binding: 'SITE',
			worker: 'site',
			prefix: '/api',
			limits: [{ methods: ['PUT'], path: '/like', count: 10, seconds: 60 }],
			routes: [
				{
					...GATEWAY_DEFAULTS,
					path: '/*',
					crawlable: true,
					cors: { origins: ['status'], methods: ['GET', 'HEAD', 'PUT'], headers: [] },
				},
			],
		},
		hook: { placement: WORKERS, binding: 'HOOK', worker: 'hook', routes: [] },
		geo: { placement: 'home', binding: 'HOME', routes: [] },
	};
	const listed = PAGE_ORIGINS.status?.[0] ?? '';
	const app = gateway(table);
	const ask = (path: string, env: Env = {}, init?: RequestInit) =>
		app.fetch(new Request(`${HOST}${path}`, init), env);

	it('sends a path in another spelling to its one spelling, the query kept', async () => {
		for (const [path, status, location] of [
			['//stats', 308, '/stats'],
			['//', 301, HOST],
			['//?abc=', 308, '/?abc='],
			['/geo/address/?latitude=1', 308, '/geo/address?latitude=1'],
		] as const) {
			const answer = await ask(path);
			expect(answer.status, path).toBe(status);
			expect(answer.headers.get('location')).toBe(location);
		}
	});

	it('does not know a scope outside its table, or one inherited from Object', async () => {
		for (const path of ['/v1/nothing/x', '/v1/constructor/x']) {
			expect((await ask(path)).status).toBe(404);
		}
		// Not a name a service could have, so the path is malformed rather than its scope unknown.
		expect((await ask('/v1/__proto__/x')).status).toBe(400);
	});

	it('says so when a scope it knows has no binding', async () => {
		const answer = await ask('/v1/site/x');
		expect(answer.status).toBe(502);
		expect(await answer.json()).toMatchObject({ code: 'scope_unavailable' });
	});

	it('says the service is out of reach, in the envelope, when the node cannot be reached', async () => {
		const thrown = {
			fetch: async () => Promise.reject(new Error('tunnel down')),
		} as unknown as Fetcher;
		const page = {
			fetch: async () => new Response('<html>Bad gateway</html>', { status: 502 }),
		} as unknown as Fetcher;
		const own = {
			fetch: async () =>
				Response.json({ status: 'error', code: 'service_unavailable' }, { status: 503 }),
		} as unknown as Fetcher;
		for (const HOME of [thrown, page]) {
			const answer = await ask('/v1/geo/address', { HOME });
			expect(answer.status).toBe(502);
			expect(await answer.json()).toMatchObject({ code: 'upstream_unavailable' });
		}
		// A service's own failure is passed on as it said it.
		const passed = await ask('/v1/geo/address', { HOME: own });
		expect(passed.status).toBe(503);
	});

	it('hands a Workers scope its request with the scope taken off', async () => {
		const { fetcher, seen } = binding();
		const answer = await ask(
			'/v1/site/like?slug=a',
			{ SITE: fetcher, QUOTA: counters(true).counters },
			{ method: 'PUT', headers: { 'cf-connecting-ip': '192.0.2.1' }, body: 'x' },
		);
		expect(answer.status).toBe(200);
		const [sent] = seen;
		expect(sent?.url).toBe(`${HOST}/api/v1/like?slug=a`);
		expect(sent?.method).toBe('PUT');
		expect(sent?.headers.get('cf-connecting-ip')).toBe('192.0.2.1');
		expect(await sent?.text()).toBe('x');
	});

	it('gives the bare scope the root of its prefix', async () => {
		const { fetcher, seen } = binding();
		await ask('/v1/site', { SITE: fetcher });
		expect(seen[0]?.url).toBe(`${HOST}/api/v1/`);
	});

	it("sends a scope bound to `development` to its Worker's development address", async () => {
		const real = globalThis.fetch;
		const seen: string[] = [];
		globalThis.fetch = (async (request: Request) => (
			seen.push(request.url),
			new Response('ok')
		)) as typeof fetch;
		try {
			await ask('/v1/site/media?resource=a', { SITE: 'development' });
		} finally {
			globalThis.fetch = real;
		}
		expect(seen).toEqual([`${developmentUrl('site')}/api/v1/media?resource=a`]);
	});

	it("sends the host's own address to the site", async () => {
		for (const path of ['', '/']) {
			const answer = await ask(path);
			expect(answer.status).toBe(301);
			expect(answer.headers.get('location')).toBe(`${URLS.apps.production.site}/?ref=api`);
		}
	});

	it('answers its own security.txt, before any scope is read', async () => {
		const answer = await ask('/.well-known/security.txt');
		expect(answer.status).toBe(200);
		expect(await answer.text()).toContain('Contact: mailto:');
	});

	it('answers robots itself, refusing every crawler on an API host', async () => {
		const text = await (await ask('/robots.txt')).text();
		expect(text).toContain('Disallow: /');
		expect(text).not.toContain('Allow:');
		expect(text).not.toContain('Content-Signal');
	});

	it('says nothing a crawler reading no Allow would read as a refusal, where all is open', async () => {
		const open: Record<string, Scope> = {
			cdn: {
				placement: WORKERS,
				binding: 'CDN',
				worker: 'cdn',
				routes: [{ ...GATEWAY_DEFAULTS, path: '/*', crawlable: true }],
			},
		};
		const answer = await gateway(open).fetch(
			new Request(new URL('/robots.txt', `https://${GATEWAY.retired.cdn}`)),
			{},
		);
		const lines = (await answer.text()).split('\n');
		expect(lines).toContain('Disallow: ');
		expect(lines).not.toContain('Disallow: /');
	});

	it('lets a crawler into a CDN host as far as its routes say', async () => {
		const cdn: Record<string, Scope> = {
			cdn: {
				placement: WORKERS,
				binding: 'CDN',
				worker: 'cdn',
				routes: [
					{ ...GATEWAY_DEFAULTS, path: '/object/*', crawlable: true },
					{ ...GATEWAY_DEFAULTS, path: '/*' },
				],
			},
		};
		const answer = await gateway(cdn).fetch(
			new Request(new URL('/robots.txt', `https://${GATEWAY.retired.cdn}`)),
			{},
		);
		const text = await answer.text();
		expect(text).toContain('Allow: /object/');
		expect(text).toContain('Disallow: /');
	});

	it('follows its own mark for the browser rather than reading it as a scope', async () => {
		const object = `${URLS.apps.production.cdn}/object/abc.ico`;
		const fetching = vi
			.spyOn(globalThis, 'fetch')
			.mockResolvedValue(new Response(null, { status: 302, headers: { Location: object } }));
		const answer = await ask('/favicon.ico');
		expect(String(fetching.mock.calls[0]?.[0])).toBe(
			`${URLS.apps.production.symlink}/api/favicon.ico`,
		);
		expect(answer.status).toBe(302);
		expect(answer.headers.get('Location')).toBe(object);
		fetching.mockRestore();
	});

	it('asks the alias layer by its binding for its own mark, never by a host it may answer', async () => {
		const object = `${URLS.apps.production.cdn}/object/abc.ico`;
		const seen: string[] = [];
		const AKA = {
			fetch: async (request: Request) => (
				seen.push(request.url),
				new Response(null, { status: 302, headers: { Location: object } })
			),
		} as unknown as Fetcher;
		const fetching = vi.spyOn(globalThis, 'fetch');
		const answer = await ask('/favicon.ico', { AKA });
		expect(seen).toEqual([`${URLS.apps.production.symlink}/v1/symlink/api/favicon.ico`]);
		expect(fetching).not.toHaveBeenCalled();
		expect(answer.headers.get('Location')).toBe(object);
		fetching.mockRestore();
	});

	it("sends a node's scope to its Caddy with the scope left on", async () => {
		const { fetcher, seen } = binding();
		await ask('/v1/geo/address?latitude=1&longitude=2', { HOME: fetcher });
		const node = new URL(URLS.internal.app);
		node.hostname = `api.${node.hostname}`;
		node.protocol = 'http:';
		expect(seen[0]?.url).toBe(`${node.origin}/geo/v1/address?latitude=1&longitude=2`);
	});

	it('answers a preflight from a listed origin itself', async () => {
		const { fetcher, seen } = binding();
		const answer = await ask(
			'/v1/site/like',
			{ SITE: fetcher },
			{ method: 'OPTIONS', headers: { origin: listed, 'access-control-request-method': 'PUT' } },
		);
		expect(answer.status).toBe(204);
		expect(answer.headers.get('access-control-allow-origin')).toBe(listed);
		expect(seen).toHaveLength(0);
	});

	it("adds CORS to the service's answer by the route's service codes", async () => {
		const { fetcher } = binding();
		const env = { SITE: fetcher };
		const from = async (origin?: string) =>
			(await ask('/v1/site/stats', env, { headers: origin ? { origin } : {} })).headers;
		expect((await from(listed)).get('access-control-allow-origin')).toBe(listed);
		expect((await from('https://stranger.test')).get('access-control-allow-origin')).toBeNull();
		expect((await from()).get('access-control-allow-origin')).toBeNull();
		expect((await from(listed)).get('vary')).toContain('Origin');
	});

	it('gives a route that declares no CORS none at all', async () => {
		const { fetcher } = binding();
		const answer = await ask('/v1/hook/github', { HOOK: fetcher }, { headers: { origin: listed } });
		expect(answer.headers.get('access-control-allow-origin')).toBeNull();
	});

	it('limits by address on the method and path a limit names, and nothing else', async () => {
		const { fetcher, seen } = binding();
		const refused = counters(false);
		const env = { SITE: fetcher, QUOTA: refused.counters };
		const headers = { 'cf-connecting-ip': '192.0.2.1' };
		const answer = await ask('/v1/site/like', env, { method: 'PUT', headers });
		expect(answer.status).toBe(429);
		expect(answer.headers.get('retry-after')).toBe('7');
		expect(refused.asked).toEqual([
			{ key: 'site_put_like_address-192.0.2.1', rate: { count: 10, seconds: 60 } },
		]);
		expect(seen).toHaveLength(0);
		// Another method on the same path, and a caller with no address, are not this limit's.
		expect((await ask('/v1/site/like', env, { headers })).status).toBe(200);
		expect((await ask('/v1/site/like', env, { method: 'PUT' })).status).toBe(200);
	});

	it('skips the counter for a request carrying the probe token, and counts everyone else', async () => {
		const { fetcher, seen } = binding();
		const refused = counters(false);
		const env = { SITE: fetcher, QUOTA: refused.counters, PROBE_TOKEN: 'shh' };
		const headers = { 'cf-connecting-ip': '192.0.2.1' };
		const probe = await ask('/v1/site/like', env, {
			method: 'PUT',
			headers: { ...headers, 'x-probe': 'shh' },
		});
		expect(probe.status).toBe(200);
		expect(seen).toHaveLength(1);
		expect(refused.asked).toHaveLength(0);
		const stranger = await ask('/v1/site/like', env, {
			method: 'PUT',
			headers: { ...headers, 'x-probe': 'nope' },
		});
		expect(stranger.status).toBe(429);
		const nobody = await ask('/v1/site/like', env, { method: 'PUT', headers });
		expect(nobody.status).toBe(429);
	});

	it('never exempts a probe header when the secret is not set', async () => {
		const { fetcher } = binding();
		const refused = counters(false);
		const env = { SITE: fetcher, QUOTA: refused.counters };
		const answer = await ask('/v1/site/like', env, {
			method: 'PUT',
			headers: { 'cf-connecting-ip': '192.0.2.1', 'x-probe': '' },
		});
		expect(answer.status).toBe(429);
	});

	it('does not count again what the internal gateway counted, and takes its token off', async () => {
		const { fetcher, seen } = binding();
		const refused = counters(false);
		const env = { SITE: fetcher, QUOTA: refused.counters, INTERNAL_TOKEN: 'house' };
		const headers = { 'cf-connecting-ip': '192.0.2.1', [INTERNAL_HEADER]: 'house' };
		expect((await ask('/v1/site/like', env, { method: 'PUT', headers })).status).toBe(200);
		expect(refused.asked).toHaveLength(0);
		expect(seen[0]?.headers.has(INTERNAL_HEADER)).toBe(false);
		const forged = { ...headers, [INTERNAL_HEADER]: 'guess' };
		expect((await ask('/v1/site/like', env, { method: 'PUT', headers: forged })).status).toBe(429);
	});

	it('at home, asks a service on Workers through the public gateway, and a node service at home', async () => {
		const relay = binding();
		const home = binding();
		const env = {
			HOME: home.fetcher,
			QUOTA: counters(true).counters,
			RELAY: relay.fetcher,
			INTERNAL_TOKEN: 'house',
		};
		await ask('/v1/site/stats?x=1', env, {
			headers: { [INTERNAL_HEADER]: 'forged', 'cf-connecting-ip': '10.0.0.7' },
		});
		await ask('/v1/geo/address', env);
		const relayed = relay.seen;
		expect(relayed.map((request) => request.url)).toEqual([
			`https://${GATEWAY.api}/v1/site/stats?x=1`,
		]);
		expect(relayed[0]?.headers.get(INTERNAL_HEADER)).toBe('house');
		expect(relayed[0]?.headers.has('cf-connecting-ip')).toBe(false);
		expect(home.seen).toHaveLength(1);
	});

	it('marks what it passes on as public, over whatever the caller claimed', async () => {
		const { fetcher, seen } = binding();
		await ask('/v1/geo/address', { HOME: fetcher }, { headers: { [MARK.name]: 'internal' } });
		await ask('/v1/site/stats', { SITE: binding().fetcher });
		expect(seen[0]?.headers.get(MARK.name)).toBe(MARK.value);
	});

	it('lets a call through when its counter fails, rather than failing it', async () => {
		const { fetcher } = binding();
		const broken = { take: async () => Promise.reject(new Error('over quota')) };
		const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		const headers = { 'cf-connecting-ip': '192.0.2.1' };
		const answer = await ask(
			'/v1/site/like',
			{ SITE: fetcher, QUOTA: broken },
			{ method: 'PUT', headers },
		);
		expect(answer.status).toBe(200);
		expect(error).toHaveBeenCalled();
		error.mockRestore();
	});

	it('refuses rather than skips a limit whose binding is missing', async () => {
		const { fetcher } = binding();
		const headers = { 'cf-connecting-ip': '192.0.2.1' };
		expect((await ask('/v1/site/like', { SITE: fetcher }, { method: 'PUT', headers })).status).toBe(
			429,
		);
	});
});

describe("geo's declaration", () => {
	const app = gateway({ geo: SCOPES.geo as Scope });

	it('lets any page call it, and limits one address on the lookup alone', async () => {
		const refused = counters(false);
		const env = { HOME: binding().fetcher, QUOTA: refused.counters };
		const headers = { 'cf-connecting-ip': '192.0.2.1', origin: 'https://anyone.test' };
		const lookup = await app.fetch(
			new Request(`${HOST}/v1/geo/address?latitude=1&longitude=2`, { headers }),
			env,
		);
		expect(lookup.status).toBe(429);
		expect(refused.asked).toEqual([
			{ key: 'geo_get-head_address_address-192.0.2.1', rate: { count: 60, seconds: 60 } },
		]);
		const health = await app.fetch(new Request(`${HOST}/v1/geo/health`, { headers }), env);
		expect(health.status).toBe(200);
		expect(health.headers.get('access-control-allow-origin')).toBe('*');
	});
});

describe("shot's declaration", () => {
	const app = gateway({ shot: SCOPES.shot as Scope });
	const headers = { 'cf-connecting-ip': '192.0.2.1' };

	it('refuses `internal` from the public, whatever its value, before the service or a limit', async () => {
		const { fetcher, seen } = binding();
		const allowing = counters(true);
		const env = { HOME: fetcher, QUOTA: allowing.counters };
		for (const query of ['internal=true', 'internal=false', 'internal', 'host=a.test&internal=1']) {
			const answer = await app.fetch(
				new Request(`${HOST}/v1/shot/capture?${query}`, { headers }),
				env,
			);
			expect(answer.status, query).toBe(403);
			expect(await answer.json()).toMatchObject({ code: 'forbidden_parameter' });
		}
		const status = await app.fetch(
			new Request(`${HOST}/v1/shot/tasks/abc?internal=true`, { headers }),
			env,
		);
		expect(status.status).toBe(403);
		expect(seen).toHaveLength(0);
		expect(allowing.asked).toHaveLength(0);
	});

	it('refuses `internal` in a JSON body, however deep, and lets any other body through', async () => {
		const { fetcher, seen } = binding();
		const env = { HOME: fetcher, QUOTA: counters(true).counters };
		const post = (body: string) =>
			app.fetch(
				new Request(`${HOST}/v1/shot/capture`, {
					method: 'POST',
					headers: { ...headers, 'content-type': 'application/json' },
					body,
				}),
				env,
			);
		for (const body of [
			'{"internal":true}',
			'{"access":{"internal":false}}',
			'[{"a":{"internal":1}}]',
		]) {
			const answer = await post(body);
			expect(answer.status, body).toBe(403);
		}
		expect(seen).toHaveLength(0);
		expect((await post('{"access":{"insecure":true},"target":{"host":"a.test"}}')).status).toBe(
			200,
		);
		expect((await post('not json')).status).toBe(200);
		expect(seen).toHaveLength(2);
	});

	it('refuses `fresh` from the public, whatever its value, before the service or a limit', async () => {
		const { fetcher, seen } = binding();
		const allowing = counters(true);
		const env = { HOME: fetcher, QUOTA: allowing.counters };
		for (const query of ['fresh=true', 'fresh=false', 'fresh', 'host=a.test&fresh=1']) {
			const answer = await app.fetch(
				new Request(`${HOST}/v1/shot/capture?${query}`, { headers }),
				env,
			);
			expect(answer.status, query).toBe(403);
			expect(await answer.json()).toMatchObject({ code: 'forbidden_parameter' });
		}
		expect(seen).toHaveLength(0);
		expect(allowing.asked).toHaveLength(0);
	});

	it('refuses `access.fresh` in a JSON body, however deep, and lets any other body through', async () => {
		const { fetcher, seen } = binding();
		const env = { HOME: fetcher, QUOTA: counters(true).counters };
		const post = (body: string) =>
			app.fetch(
				new Request(`${HOST}/v1/shot/capture`, {
					method: 'POST',
					headers: { ...headers, 'content-type': 'application/json' },
					body,
				}),
				env,
			);
		for (const body of ['{"fresh":true}', '{"access":{"fresh":false}}', '[{"a":{"fresh":1}}]']) {
			const answer = await post(body);
			expect(answer.status, body).toBe(403);
		}
		expect(seen).toHaveLength(0);
		expect((await post('{"access":{"insecure":true},"target":{"host":"a.test"}}')).status).toBe(
			200,
		);
	});

	it('limits starting a capture, and neither asking after one nor fetching it', async () => {
		const refused = counters(false);
		const env = { HOME: binding().fetcher, QUOTA: refused.counters };
		const start = await app.fetch(
			new Request(`${HOST}/v1/shot/tasks`, { method: 'POST', headers, body: '{}' }),
			env,
		);
		expect(start.status).toBe(429);
		for (const path of [
			'/v1/shot/tasks/0e6f',
			'/v1/shot/pictures/0e6f.png',
			'/v1/shot/pictures/0e6f.webp',
		]) {
			expect((await app.fetch(new Request(`${HOST}${path}`, { headers }), env)).status).toBe(200);
		}
		expect(refused.asked.map((asked) => asked.key)).toEqual(['shot_post_tasks_address-192.0.2.1']);
	});
});
