import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { URLS } from '@monoflake/sdk';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type Env, RELAY, TRIES, openLive, socketOf } from './edge.ts';
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

describe('the API ahead of the pages', () => {
	it('shares its prefix with no page', () => {
		// A page here would never be reached: src/hooks.server.ts hands `/api/` to the API first.
		const pages = readdirSync(join(import.meta.dirname, '../../routes'));
		expect(pages).not.toContain('api');
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
		const response = await openLive(asked('/live', UPGRADE), env);
		expect(response.status).toBe(502);
		expect(await response.json()).toMatchObject({ code: 'upstream_unavailable' });
		expect(sent.map(({ node }) => node)).toEqual(NEAREST.slice(0, TRIES));
	});

	it('refuses a request that asks for no socket', async () => {
		const { sent, env } = bound({ tyo: () => OPENED });
		const response = await openLive(asked('/live'), env);
		expect(response.status).toBe(426);
		expect(sent).toHaveLength(0);
	});
});
