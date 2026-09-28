import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { developmentUrl, URLS } from '@canmi/urls';
import { describe, expect, it, vi } from 'vitest';
import { declarations } from '../scripts/scopes.ts';
import { type Env, gateway, MARK } from './index.ts';
import { POLICIES, type Policy } from './policy.ts';
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

/** Counters that allow or refuse every call, and remember whose they were asked to count. */
function counters(allowed: boolean) {
	const asked: Array<{ name: string; count: number; seconds: number }> = [];
	return {
		asked,
		counters: {
			idFromName: (name: string) => name,
			get: (name: string) => ({
				take: async (count: number, seconds: number) => (
					asked.push({ name, count, seconds }),
					{ allowed, retryAfter: allowed ? 0 : 7 }
				),
			}),
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
		expect(config.services.toSorted((a, b) => a.binding.localeCompare(b.binding))).toEqual(
			workers.toSorted((a, b) => a.binding.localeCompare(b.binding)),
		);
		const nodes = new Set(config.vpc_services.map((service) => service.binding));
		for (const scope of Object.values(SCOPES).filter((scope) => scope.placement !== WORKERS)) {
			expect(nodes).toContain(scope.binding);
		}
	});

	it('has a policy only for scopes it has, and the counters every limit is kept in', () => {
		for (const scope of Object.keys(POLICIES)) expect(SCOPES).toHaveProperty(scope);
		expect(wrangler().durable_objects?.bindings).toContainEqual({
			name: 'limits',
			class_name: 'counter',
		});
	});

	it('leaves out a scope that is not public', () => {
		const table = scopeTable([
			'version = 1\nname = "geo"\nplacements = ["home"]\n[api]\npublic = false\n',
			'version = 1\nname = "open"\nplacements = ["home"]\n[api]\npublic = true\n',
		]);
		expect(table).toEqual({ open: { placement: 'home', binding: 'HOME' } });
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
		},
		hook: { placement: WORKERS, binding: 'HOOK', worker: 'hook' },
		geo: { placement: 'home', binding: 'HOME' },
	};
	const listed = 'https://listed.test';
	const policies: Record<string, Policy> = {
		site: { origin: (origin) => (!origin ? '*' : origin === listed ? origin : null) },
	};
	const app = gateway(table, policies);
	const ask = (path: string, env: Env = {}, init?: RequestInit) =>
		app.fetch(new Request(`${HOST}${path}`, init), env);

	it('refuses a path with no scope as malformed', async () => {
		for (const path of ['//stats', '//']) {
			const answer = await ask(path);
			expect(answer.status).toBe(400);
			expect(await answer.json()).toMatchObject({ status: 'error', code: 'invalid_path' });
		}
	});

	it('does not know a scope outside its table, or one inherited from Object', async () => {
		for (const path of ['/nothing/x', '/constructor/x', '/__proto__/x']) {
			expect((await ask(path)).status).toBe(404);
		}
	});

	it('says so when a scope it knows has no binding', async () => {
		const answer = await ask('/site/x');
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
			const answer = await ask('/geo/address', { HOME });
			expect(answer.status).toBe(502);
			expect(await answer.json()).toMatchObject({ code: 'upstream_unavailable' });
		}
		// A service's own failure is passed on as it said it.
		const passed = await ask('/geo/address', { HOME: own });
		expect(passed.status).toBe(503);
	});

	it('hands a Workers scope its request with the scope taken off', async () => {
		const { fetcher, seen } = binding();
		const answer = await ask(
			'/site/like?slug=a',
			{ SITE: fetcher, limits: counters(true).counters },
			{ method: 'PUT', headers: { 'cf-connecting-ip': '192.0.2.1' }, body: 'x' },
		);
		expect(answer.status).toBe(200);
		const [sent] = seen;
		expect(sent?.url).toBe(`${HOST}/api/like?slug=a`);
		expect(sent?.method).toBe('PUT');
		expect(sent?.headers.get('cf-connecting-ip')).toBe('192.0.2.1');
		expect(await sent?.text()).toBe('x');
	});

	it('gives the bare scope the root of its prefix', async () => {
		const { fetcher, seen } = binding();
		await ask('/site', { SITE: fetcher });
		expect(seen[0]?.url).toBe(`${HOST}/api/`);
	});

	it("sends a scope bound to `development` to its Worker's development address", async () => {
		const real = globalThis.fetch;
		const seen: string[] = [];
		globalThis.fetch = (async (request: Request) => (
			seen.push(request.url),
			new Response('ok')
		)) as typeof fetch;
		try {
			await ask('/site/media?resource=a', { SITE: 'development' });
		} finally {
			globalThis.fetch = real;
		}
		expect(seen).toEqual([`${developmentUrl('site')}/api/media?resource=a`]);
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

	it('answers robots itself, keeping the whole host out of an index', async () => {
		const answer = await ask('/robots.txt');
		expect(await answer.text()).toContain('Disallow: /');
	});

	it("sends a node's scope to its Caddy with the scope left on", async () => {
		const { fetcher, seen } = binding();
		await ask('/geo/address?latitude=1&longitude=2', { HOME: fetcher });
		const node = new URL(URLS.internal.app);
		node.hostname = `api.${node.hostname}`;
		node.protocol = 'http:';
		expect(seen[0]?.url).toBe(`${node.origin}/geo/address?latitude=1&longitude=2`);
	});

	it('answers a preflight from a listed origin itself', async () => {
		const { fetcher, seen } = binding();
		const answer = await ask(
			'/site/like',
			{ SITE: fetcher },
			{ method: 'OPTIONS', headers: { origin: listed, 'access-control-request-method': 'PUT' } },
		);
		expect(answer.status).toBe(204);
		expect(answer.headers.get('access-control-allow-origin')).toBe(listed);
		expect(seen).toHaveLength(0);
	});

	it("adds CORS to the service's answer by the scope's list", async () => {
		const { fetcher } = binding();
		const env = { SITE: fetcher };
		const from = async (origin?: string) =>
			(await ask('/site/stats', env, { headers: origin ? { origin } : {} })).headers;
		expect((await from(listed)).get('access-control-allow-origin')).toBe(listed);
		expect((await from('https://stranger.test')).get('access-control-allow-origin')).toBeNull();
		expect((await from()).get('access-control-allow-origin')).toBe('*');
		expect((await from(listed)).get('vary')).toContain('Origin');
	});

	it('gives a scope with no origin policy no CORS at all', async () => {
		const { fetcher } = binding();
		const answer = await ask('/hook/github', { HOOK: fetcher }, { headers: { origin: listed } });
		expect(answer.headers.get('access-control-allow-origin')).toBeNull();
	});

	it('limits by address on the method and path a limit names, and nothing else', async () => {
		const { fetcher, seen } = binding();
		const refused = counters(false);
		const env = { SITE: fetcher, limits: refused.counters };
		const headers = { 'cf-connecting-ip': '192.0.2.1' };
		const answer = await ask('/site/like', env, { method: 'PUT', headers });
		expect(answer.status).toBe(429);
		expect(answer.headers.get('retry-after')).toBe('7');
		expect(refused.asked).toEqual([{ name: 'site_put_like_192.0.2.1', count: 10, seconds: 60 }]);
		expect(seen).toHaveLength(0);
		// Another method on the same path, and a caller with no address, are not this limit's.
		expect((await ask('/site/like', env, { headers })).status).toBe(200);
		expect((await ask('/site/like', env, { method: 'PUT' })).status).toBe(200);
	});

	it('marks what it passes on as public, over whatever the caller claimed', async () => {
		const { fetcher, seen } = binding();
		await ask('/geo/address', { HOME: fetcher }, { headers: { [MARK.name]: 'internal' } });
		await ask('/site/stats', { SITE: binding().fetcher });
		expect(seen[0]?.headers.get(MARK.name)).toBe(MARK.value);
	});

	it('lets a call through when its counter fails, rather than failing it', async () => {
		const { fetcher } = binding();
		const broken = {
			idFromName: (name: string) => name,
			get: () => ({ take: async () => Promise.reject(new Error('over quota')) }),
		};
		const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		const headers = { 'cf-connecting-ip': '192.0.2.1' };
		const answer = await ask(
			'/site/like',
			{ SITE: fetcher, limits: broken },
			{ method: 'PUT', headers },
		);
		expect(answer.status).toBe(200);
		expect(error).toHaveBeenCalled();
		error.mockRestore();
	});

	it('refuses rather than skips a limit whose binding is missing', async () => {
		const { fetcher } = binding();
		const headers = { 'cf-connecting-ip': '192.0.2.1' };
		expect((await ask('/site/like', { SITE: fetcher }, { method: 'PUT', headers })).status).toBe(
			429,
		);
	});
});

describe("geo's policy", () => {
	const app = gateway({ geo: SCOPES.geo as Scope }, POLICIES);

	it('lets any page call it, and limits one address on the lookup alone', async () => {
		const refused = counters(false);
		const env = { HOME: binding().fetcher, limits: refused.counters };
		const headers = { 'cf-connecting-ip': '192.0.2.1', origin: 'https://anyone.test' };
		const lookup = await app.fetch(
			new Request(`${HOST}/geo/address?latitude=1&longitude=2`, { headers }),
			env,
		);
		expect(lookup.status).toBe(429);
		expect(refused.asked).toEqual([
			{ name: 'geo_get-head_address_192.0.2.1', count: 60, seconds: 60 },
		]);
		const health = await app.fetch(new Request(`${HOST}/geo/health`, { headers }), env);
		expect(health.status).toBe(200);
		expect(health.headers.get('access-control-allow-origin')).toBe('*');
	});
});

describe("shot's policy", () => {
	const app = gateway({ shot: SCOPES.shot as Scope }, POLICIES);
	const headers = { 'cf-connecting-ip': '192.0.2.1' };

	it('refuses `internal` from the public, whatever its value, before the service or a limit', async () => {
		const { fetcher, seen } = binding();
		const allowing = counters(true);
		const env = { HOME: fetcher, limits: allowing.counters };
		for (const query of ['internal=true', 'internal=false', 'internal', 'host=a.test&internal=1']) {
			const answer = await app.fetch(
				new Request(`${HOST}/shot/capture?${query}`, { headers }),
				env,
			);
			expect(answer.status, query).toBe(403);
			expect(await answer.json()).toMatchObject({ code: 'forbidden_parameter' });
		}
		const status = await app.fetch(
			new Request(`${HOST}/shot/tasks/abc?internal=true`, { headers }),
			env,
		);
		expect(status.status).toBe(403);
		expect(seen).toHaveLength(0);
		expect(allowing.asked).toHaveLength(0);
	});

	it('refuses `internal` in a JSON body, however deep, and lets any other body through', async () => {
		const { fetcher, seen } = binding();
		const env = { HOME: fetcher, limits: counters(true).counters };
		const post = (body: string) =>
			app.fetch(
				new Request(`${HOST}/shot/capture`, {
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

	it('limits starting a capture, and neither asking after one nor fetching it', async () => {
		const refused = counters(false);
		const env = { HOME: binding().fetcher, limits: refused.counters };
		const start = await app.fetch(
			new Request(`${HOST}/shot/capture?host=a.test`, { headers }),
			env,
		);
		expect(start.status).toBe(429);
		for (const path of [
			'/shot/tasks/0e6f',
			'/shot/pictures/0e6f.png',
			'/shot/pictures/0e6f.webp',
		]) {
			expect((await app.fetch(new Request(`${HOST}${path}`, { headers }), env)).status).toBe(200);
		}
		expect(refused.asked.map((asked) => asked.name)).toEqual([
			'shot_get-head-post_capture_192.0.2.1',
		]);
	});
});
