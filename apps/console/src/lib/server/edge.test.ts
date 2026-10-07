import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { URLS } from '@monoflake/sdk';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type Env, RELAY, ROUTES, TRIES, handle, isRoute, socketOf } from './edge.ts';
import { NODES, type Node, order } from './nodes.ts';

/** wrangler.jsonc as data: its comments and trailing commas taken off, strings left alone. */
function wrangler(): {
	routes: Array<{ pattern: string; custom_domain?: boolean }>;
	vpc_services: Array<{ binding: string }>;
} {
	const text = readFileSync(join(import.meta.dirname, '../../../wrangler.jsonc'), 'utf8');
	const bare = text.replace(
		/("(?:\\.|[^"\\])*")|\/\/[^\n]*/g,
		(_match: string, string?: string) => string ?? '',
	);
	return JSON.parse(bare.replace(/,(\s*[}\]])/g, '$1'));
}

/**
 * A socket as a binding hands it back. Node's `Response` refuses a 101, so an opened socket is an
 * object shaped like one, and the 101 the Worker builds from it is left to the runtime.
 */
const OPENED = { status: 101, ok: false, body: null, webSocket: {} } as unknown as Response;

/** VPC bindings that record what they were sent; each answers as `answers` says, or throws. */
function bound(answers: Partial<Record<Node, () => Response>>) {
	const sent: { node: Node; url: string; headers: Headers }[] = [];
	const env = Object.fromEntries(
		Object.entries(answers).map(([node, answer]) => [
			node.toUpperCase(),
			{
				fetch: async (url: string, init: RequestInit) => {
					sent.push({ node: node as Node, url, headers: new Headers(init.headers) });
					return answer();
				},
			} as unknown as Fetcher,
		]),
	) as Env;
	return { sent, env };
}

function down(): Response {
	throw new Error('tunnel down');
}

/** A binding that never answers, until the request's signal gives up on it. */
const hanging = {
	fetch: (_url: string, init: RequestInit = {}) =>
		new Promise<Response>((_, reject) => {
			init.signal?.addEventListener('abort', () => reject(init.signal?.reason));
		}),
} as unknown as Fetcher;

/** Where Cloudflare places every reader here: Osaka, whose order is Tokyo's three first. */
const OSAKA = { latitude: '34.6937', longitude: '135.5023' };
const NEAREST = order(OSAKA);

function asked(path: string, init: RequestInit = {}): Request {
	const request = new Request(new URL(path, 'https://console.example.test'), init);
	return Object.assign(request, { cf: OSAKA });
}

const UPGRADE = { headers: { upgrade: 'websocket', origin: URLS.internal.app } };

afterEach(() => {
	vi.restoreAllMocks();
});

describe('wrangler.jsonc', () => {
	it('answers on the sdk name and binds every node it places', () => {
		const config = wrangler();
		expect(config.routes).toEqual([
			{ pattern: new URL(URLS.internal.console).hostname, custom_domain: true },
		]);
		const bindings = config.vpc_services.map((service) => service.binding).toSorted();
		expect(bindings).toEqual(
			Object.keys(NODES)
				.map((node) => node.toUpperCase())
				.toSorted(),
		);
	});
});

describe('the routes ahead of the pages', () => {
	it('answers each of its paths exactly, and no page shares one', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		// Nothing bound, so `/state` is a 502 and `/live` a 426: answered, if not well.
		const { env } = bound({});
		for (const route of ROUTES) {
			expect(isRoute(route)).toBe(true);
			expect((await handle(asked(route), env)).status).not.toBe(404);
		}
		expect(['/', '/nodes', '/live/', '/state.json'].some(isRoute)).toBe(false);
		// A page here would never be reached: src/hooks.server.ts answers its path first.
		const pages = readdirSync(join(import.meta.dirname, '../../routes'));
		expect(pages.filter((page) => isRoute(`/${page}`))).toEqual([]);
	});
});

describe('the live socket', () => {
	it('goes on to the next node when the nearest throws', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const { sent, env } = bound({ tyo: down, hnd: () => OPENED, nrt: () => OPENED });
		const nodes: Node[] = ['tyo', 'hnd', 'nrt'];
		const socket = await socketOf(asked('/live', UPGRADE), env, nodes);
		expect(socket).toBe(OPENED.webSocket);
		expect(sent.map(({ node }) => node)).toEqual(['tyo', 'hnd']);
		expect(sent.every(({ url }) => url === `${RELAY}/live`)).toBe(true);
		// The browser's page goes with it, since the relay admits by `Origin`.
		expect(sent[1]?.headers.get('origin')).toBe(URLS.internal.app);
		expect(sent[1]?.headers.get('upgrade')).toBe('websocket');
	});

	it('opens the socket with no deadline, which would cut it once open', async () => {
		const signals: (AbortSignal | null | undefined)[] = [];
		const env = {
			TYO: {
				fetch: async (_url: string, init: RequestInit = {}) => {
					signals.push(init.signal);
					return OPENED;
				},
			} as unknown as Fetcher,
		} as Env;
		await socketOf(asked('/live', UPGRADE), env, ['tyo']);
		expect(signals).toEqual([undefined]);
	});

	it('takes no answer but an opened socket', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const refused = () => new Response(null, { status: 403 });
		const { sent, env } = bound({ tyo: refused, nrt: () => OPENED });
		const socket = await socketOf(asked('/live', UPGRADE), env, ['tyo', 'nrt']);
		expect(socket).toBe(OPENED.webSocket);
		expect(sent).toHaveLength(2);
	});

	it(`gives up after ${TRIES} nodes with an envelope's 502`, async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const every = Object.fromEntries(Object.keys(NODES).map((node) => [node, down]));
		const { sent, env } = bound(every);
		const response = await handle(asked('/live', UPGRADE), env);
		expect(response.status).toBe(502);
		expect(await response.json()).toMatchObject({ code: 'upstream_unavailable' });
		expect(sent.map(({ node }) => node)).toEqual(NEAREST.slice(0, TRIES));
	});

	it('refuses a request that asks for no socket', async () => {
		const { sent, env } = bound({ tyo: () => OPENED });
		const response = await handle(asked('/live'), env);
		expect(response.status).toBe(426);
		expect(sent).toHaveLength(0);
	});
});

describe('the state', () => {
	it("passes the first node's answer on as it is, after one that failed", async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const body = JSON.stringify({ status: 'success', data: { node: 'hnd' } });
		const [failing, unreachable, answering] = NEAREST as [Node, Node, Node];
		const { sent, env } = bound({
			[failing]: () => new Response('bad gateway', { status: 502 }),
			[unreachable]: down,
			[answering]: () => new Response(body, { headers: { 'content-type': 'application/json' } }),
		});
		const response = await handle(asked('/state'), env);
		expect(response.status).toBe(200);
		expect(response.headers.get('content-type')).toBe('application/json');
		expect(await response.text()).toBe(body);
		expect(sent.map(({ url }) => url)).toEqual(Array(3).fill(`${RELAY}/state`));
	});

	it('gives up on a node that hangs, for the next', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const body = JSON.stringify({ status: 'success', data: { node: 'hnd' } });
		const [hung, answering] = NEAREST as [Node, Node];
		const { sent, env } = bound({ [answering]: () => new Response(body) });
		const response = await handle(asked('/state'), { ...env, [hung.toUpperCase()]: hanging }, 20);
		expect(response.status).toBe(200);
		expect(await response.text()).toBe(body);
		expect(sent.map(({ node }) => node)).toEqual([answering]);
	});
});

describe('handle', () => {
	it('names the nearest node and the order, without asking any', async () => {
		const { sent, env } = bound({});
		const response = await handle(asked('/nearest'), env);
		const { data } = (await response.json()) as { data: { node: Node; order: Node[] } };
		expect(data).toEqual({ node: NEAREST[0], order: NEAREST });
		expect(sent).toHaveLength(0);
	});

	it('answers anything else with a 404', async () => {
		const { env } = bound({});
		expect((await handle(asked('/other'), env)).status).toBe(404);
		expect((await handle(asked('/state', { method: 'POST' }), env)).status).toBe(404);
	});
});
