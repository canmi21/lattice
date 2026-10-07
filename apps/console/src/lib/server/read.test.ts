import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Env } from './edge.ts';
import { RELAY } from './edge.ts';
import { order } from './nodes.ts';
import { PANEL, cluster, node } from './read.ts';

const TOKEN = 'read-token';

/** VPC bindings that record what they were sent; each answers as `answers` says, or throws. */
function bound(answers: Record<string, () => Response>, token: string | null = TOKEN) {
	const sent: { node: string; url: string; headers: Headers }[] = [];
	const env = Object.fromEntries(
		Object.entries(answers).map(([name, answer]) => [
			name.toUpperCase(),
			{
				fetch: async (url: string, init: RequestInit = {}) => {
					sent.push({ node: name, url, headers: new Headers(init.headers) });
					return answer();
				},
			} as unknown as Fetcher,
		]),
	);
	return { sent, env: { ...env, HOST_READ_TOKEN: token ?? undefined } as Env };
}

const envelope =
	(body: unknown, status = 200) =>
	() =>
		Response.json(body, { status });
const down = (): Response => {
	throw new Error('tunnel down');
};

/** A binding that never answers, until the request's signal gives up on it. */
const hanging = {
	fetch: (_url: string, init: RequestInit = {}) =>
		new Promise<Response>((_, reject) => {
			init.signal?.addEventListener('abort', () => reject(init.signal?.reason));
		}),
} as unknown as Fetcher;

const OSAKA = { latitude: '34.6937', longitude: '135.5023' };
const NEAREST = order(OSAKA);

afterEach(() => {
	vi.restoreAllMocks();
});

describe('cluster', () => {
	it('reads the nearest relay that answers, and names the node that did', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const [unreachable, answering] = NEAREST as [string, string];
		const data = { version: 1, node: answering, nodes: {} };
		const { sent, env } = bound({
			[unreachable]: down,
			[answering]: envelope({ status: 'success', data }),
		});
		expect(await cluster({ env, where: OSAKA })).toEqual({ ok: true, node: answering, data });
		expect(sent.map(({ url }) => url)).toEqual([`${RELAY}/state`, `${RELAY}/state`]);
		// A relay is asked with nothing of the token's.
		expect(sent.some(({ headers }) => headers.has('authorization'))).toBe(false);
	});

	it('gives up on a relay that hangs, for the next', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const [hung, answering] = NEAREST as [string, string];
		const data = { version: 1, node: answering, nodes: {} };
		const { sent, env } = bound({ [answering]: envelope({ status: 'success', data }) });
		const read = await cluster(
			{ env: { ...env, [hung.toUpperCase()]: hanging }, where: OSAKA },
			20,
		);
		expect(read).toEqual({ ok: true, node: answering, data });
		expect(sent.map(({ node }) => node)).toEqual([answering]);
	});

	it('fails as a 502 when every relay it tries hangs', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const env = Object.fromEntries(NEAREST.map((name) => [name.toUpperCase(), hanging])) as Env;
		const read = await cluster({ env, where: OSAKA }, 20);
		expect(read).toMatchObject({
			ok: false,
			failure: { status: 502, code: 'upstream_unavailable' },
		});
	});

	it('fails as a 502 when no relay answers', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const { env } = bound({});
		const read = await cluster({ env, where: OSAKA });
		expect(read).toMatchObject({
			ok: false,
			failure: { status: 502, code: 'upstream_unavailable' },
		});
	});
});

describe('node', () => {
	it("asks the panel's interface under /api with the read token, and hands back data", async () => {
		const data = { info: { cores: 4 }, sample: { at: 1, values: {} } };
		const { sent, env } = bound({ tyo: envelope({ status: 'success', data }) });
		expect(await node({ env }, 'tyo', '/node/now')).toEqual({ ok: true, node: 'tyo', data });
		expect(sent).toHaveLength(1);
		expect(sent[0]?.url).toBe(`${PANEL}/api/node/now`);
		expect(sent[0]?.headers.get('authorization')).toBe(`Bearer ${TOKEN}`);
	});

	it("passes host's own failure on with its status", async () => {
		const refused = { status: 'error', code: 'invalid_token', message: 'Not this token.' };
		const { env } = bound({ hnd: envelope(refused, 401) });
		expect(await node({ env }, 'hnd', '/node/now')).toEqual({
			ok: false,
			failure: { status: 401, code: 'invalid_token', message: 'Not this token.' },
		});
	});

	it('asks nothing of a name that is not a node, or of a node with no token to give', async () => {
		const { sent, env } = bound({ tyo: envelope({ status: 'success', data: 1 }) });
		expect(await node({ env }, 'nowhere', '/node/now')).toMatchObject({
			ok: false,
			failure: { status: 404, code: 'no_such_host' },
		});
		// `toString` is on every object; a node is an own key of NODES or nothing.
		expect(await node({ env }, 'toString', '/node/now')).toMatchObject({ ok: false });
		const untokened = bound({ tyo: envelope({ status: 'success', data: 1 }) }, null);
		expect(await node({ env: untokened.env }, 'tyo', '/node/now')).toMatchObject({ ok: false });
		expect([...sent, ...untokened.sent]).toHaveLength(0);
	});

	it('counts an answer outside the envelope, or none, as the node unavailable', async () => {
		const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
		const { env } = bound({ tyo: () => new Response('bad gateway', { status: 502 }), nrt: down });
		for (const name of ['tyo', 'nrt']) {
			expect(await node({ env }, name, '/node/now')).toMatchObject({
				ok: false,
				failure: { status: 502, code: 'upstream_unavailable' },
			});
		}
		// What is logged names the node and never carries the token.
		expect(errors.mock.calls.flat().join(' ')).not.toContain(TOKEN);
	});
});
