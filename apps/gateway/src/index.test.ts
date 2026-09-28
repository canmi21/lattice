import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { URLS } from '@canmi/urls';
import { describe, expect, it, vi } from 'vitest';
import { declarations } from '../scripts/scopes.ts';
import { type Env, gateway } from './index.ts';
import { POLICIES, type Policy } from './policy.ts';
import { SCOPES } from './scopes.ts';
import { type Scope, scopeTable, WORKERS } from './table.ts';

/** The public API host, whatever scope the site's own base names. */
const HOST = new URL(URLS.apps.production.api).origin;

/** wrangler.jsonc as data: its comments and trailing commas taken off, strings left alone. */
function wrangler(): {
	services: Array<{ binding: string; service: string }>;
	vpc_services: Array<{ binding: string }>;
	ratelimits: Array<{ name: string }>;
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

	it('has a policy only for scopes it has, and a binding for every limit a policy names', () => {
		const limiters = new Set(wrangler().ratelimits.map((limit) => limit.name));
		for (const [scope, policy] of Object.entries(POLICIES)) {
			expect(SCOPES).toHaveProperty(scope);
			for (const limit of policy.limits ?? []) expect(limiters).toContain(limit.limiter);
		}
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
		site: { placement: WORKERS, binding: 'SITE', worker: 'site-api' },
		hook: { placement: WORKERS, binding: 'HOOK', worker: 'hook' },
		geo: { placement: 'home', binding: 'HOME' },
	};
	const listed = 'https://listed.test';
	const policies: Record<string, Policy> = {
		site: {
			origin: (origin) => (!origin ? '*' : origin === listed ? origin : null),
			limits: [{ methods: ['PUT'], path: '/like', limiter: 'LIKE' }],
		},
	};
	const app = gateway(table, policies);
	const ask = (path: string, env: Env = {}, init?: RequestInit) =>
		app.fetch(new Request(`${HOST}${path}`, init), env);

	/** A limiter that allows or refuses everything, and counts the keys it was asked about. */
	function limiter(success: boolean) {
		const keys: string[] = [];
		return {
			limiter: { limit: async ({ key }: { key: string }) => (keys.push(key), { success }) },
			keys,
		};
	}

	it('refuses a path with no scope as malformed', async () => {
		for (const path of ['', '/', '//stats']) {
			const answer = await ask(path);
			expect(answer.status).toBe(400);
			expect(await answer.json()).toEqual({ status: 'error', message: 'no_scope' });
		}
	});

	it('does not know a scope outside its table, or one inherited from Object', async () => {
		for (const path of ['/nothing/x', '/constructor/x', '/__proto__/x']) {
			expect((await ask(path)).status).toBe(404);
		}
	});

	it('says so when a scope it knows has no binding', async () => {
		expect((await ask('/site/x')).status).toBe(502);
	});

	it('hands a Workers scope its request with the scope taken off', async () => {
		const { fetcher, seen } = binding();
		const answer = await ask(
			'/site/like?slug=a',
			{ SITE: fetcher, LIKE: limiter(true).limiter },
			{ method: 'PUT', headers: { 'cf-connecting-ip': '192.0.2.1' }, body: 'x' },
		);
		expect(answer.status).toBe(200);
		const [sent] = seen;
		expect(sent?.url).toBe(`${HOST}/like?slug=a`);
		expect(sent?.method).toBe('PUT');
		expect(sent?.headers.get('cf-connecting-ip')).toBe('192.0.2.1');
		expect(await sent?.text()).toBe('x');
	});

	it('gives the bare scope the root', async () => {
		const { fetcher, seen } = binding();
		await ask('/site', { SITE: fetcher });
		expect(seen[0]?.url).toBe(`${HOST}/`);
	});

	it("sends a node's scope to its Caddy with the scope left on", async () => {
		const { fetcher, seen } = binding();
		await ask('/geo/reverse?lat=1&lon=2', { HOME: fetcher });
		const node = new URL(URLS.internal.app);
		node.hostname = `api.${node.hostname}`;
		node.protocol = 'http:';
		expect(seen[0]?.url).toBe(`${node.origin}/geo/reverse?lat=1&lon=2`);
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
		const refused = limiter(false);
		const env = { SITE: fetcher, LIKE: refused.limiter };
		const headers = { 'cf-connecting-ip': '192.0.2.1' };
		const answer = await ask('/site/like', env, { method: 'PUT', headers });
		expect(answer.status).toBe(429);
		expect(answer.headers.get('retry-after')).toBe('60');
		expect(refused.keys).toEqual(['192.0.2.1']);
		expect(seen).toHaveLength(0);
		// Another method on the same path, and a caller with no address, are not this limit's.
		expect((await ask('/site/like', env, { headers })).status).toBe(200);
		expect((await ask('/site/like', env, { method: 'PUT' })).status).toBe(200);
	});

	it('refuses rather than skips a limit whose binding is missing', async () => {
		const { fetcher } = binding();
		const headers = { 'cf-connecting-ip': '192.0.2.1' };
		expect((await ask('/site/like', { SITE: fetcher }, { method: 'PUT', headers })).status).toBe(
			429,
		);
	});
});
