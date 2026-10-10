/**
 * The console's live socket, and its one `/state`, handed to the nearest node's relay. Once the
 * socket is passed on nothing here runs per message. See spec/architecture/console.md, "Live,
 * through the nearest node". No authentication of its own: Access stands in front of every `.app`
 * name, see the same file. Answered from src/hooks.server.ts, ahead of every page.
 */
import { failure, success } from '@canmi/response';
import { URLS } from '@monoflake/sdk';
import { type Node, type Whereabouts, order } from './nodes.ts';

/**
 * Each node's Caddy, through that node's tunnel, bound by its name in capitals, and the read-only
 * token every node's host takes for its `GET` routes; see wrangler.jsonc.
 */
export type Env = Readonly<
	Partial<Record<Uppercase<Node>, Fetcher>> & { HOST_READ_TOKEN?: string }
>;

/** The relay's interface on a node; VPC sends it as the `Host` Caddy routes on. See platform's
 * spec/architecture/services.md, "One door per node". */
const INTERFACE = `relay.${new URL(URLS.internal.app).hostname}`;
export const RELAY = `http://${INTERFACE}`;

/** How many nodes one request tries before it gives up. */
export const TRIES = 3;

/** How long one node may take to answer before it counts as unavailable, in milliseconds. */
export const TIMEOUT = 4000;

/**
 * How a node is reached: over its VPC binding, to its Caddy, which carries the WebSocket too. See
 * spec/architecture/console.md, "Live, through the nearest node".
 */
export function reach(env: Env, node: Node, path: string, init: RequestInit): Promise<Response> {
	const binding = bindingOf(env, node);
	if (binding === undefined) return Promise.reject(new Error(`${node} is not bound`));
	return binding.fetch(`${RELAY}${path}`, init);
}

/** A node's binding, absent where wrangler.jsonc binds none. */
export function bindingOf(env: Env, node: Node): Fetcher | undefined {
	return env[node.toUpperCase() as Uppercase<Node>];
}

/** The first answer among `nodes` that `taken` accepts, trying `TRIES` of them at most. */
export async function first(
	nodes: readonly Node[],
	ask: (node: Node) => Promise<Response>,
	taken: (answer: Response) => boolean,
): Promise<{ node: Node; answer: Response } | undefined> {
	for (const node of nodes.slice(0, TRIES)) {
		try {
			const answer = await ask(node);
			if (taken(answer)) return { node, answer };
			await answer.body?.cancel();
			console.error(`live: ${node} answered ${answer.status}`);
		} catch (error) {
			console.error(`live: ${node} did not answer: ${String(error)}`);
		}
	}
	return undefined;
}

/** The socket of the first node that opens one, with the browser's `Origin` and socket headers. */
export async function socketOf(
	request: Request,
	env: Env,
	nodes: readonly Node[],
): Promise<WebSocket | undefined> {
	const headers = new Headers(request.headers);
	// The URL names the relay; this `Host` is the Worker's own.
	headers.delete('host');
	const opened = await first(
		nodes,
		(node) => reach(env, node, '/live', { headers }),
		(answer) => answer.status === 101 && answer.webSocket !== null,
	);
	return opened?.answer.webSocket ?? undefined;
}

/** The paths answered here rather than by a page. */
export const ROUTES = ['/live', '/state', '/history', '/nearest'] as const;

export function isRoute(path: string): path is (typeof ROUTES)[number] {
	return (ROUTES as readonly string[]).includes(path);
}

/**
 * `timeout` bounds each relay `/state` asks, never the socket `/live` opens: an established socket
 * outlives any request.
 */
export async function handle(request: Request, env: Env, timeout = TIMEOUT): Promise<Response> {
	const { pathname, search } = new URL(request.url);
	if (request.method !== 'GET') return failure(404, 'no_such_route');
	const nodes = order(request.cf as Whereabouts | undefined);
	switch (pathname) {
		case '/live': {
			if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') {
				return failure(426, 'invalid_method');
			}
			const socket = await socketOf(request, env, nodes);
			if (socket === undefined) return failure(502, 'upstream_unavailable');
			return new Response(null, { status: 101, webSocket: socket });
		}
		// The console's polling, while it has no socket: the relay's answer, as it gave it.
		case '/state': {
			const reached = await first(
				nodes,
				(node) =>
					reach(env, node, '/state', { method: 'GET', signal: AbortSignal.timeout(timeout) }),
				(answer) => answer.ok,
			);
			return reached?.answer ?? failure(502, 'upstream_unavailable');
		}
		// A span of every node's minutes, as the page asks it once the reader picks another.
		case '/history': {
			const reached = await first(
				nodes,
				(node) =>
					reach(env, node, `/history${search}`, {
						method: 'GET',
						signal: AbortSignal.timeout(timeout),
					}),
				(answer) => answer.ok || answer.status === 400,
			);
			return reached?.answer ?? failure(502, 'upstream_unavailable');
		}
		case '/nearest':
			return success({ node: nodes[0], order: nodes });
		default:
			return failure(404, 'no_such_route');
	}
}
