/**
 * What the pages load on the server: the whole cluster from the nearest relay that answers, and
 * one node's host, asked through that node's binding with the read-only token. The token goes to a
 * node binding and nowhere else, and is never logged. See spec/architecture/console.md, "It reads,
 * and does not write, at first".
 */
import type { Code } from '@canmi/response';
import { URLS } from '@monoflake/sdk';
import type { Cluster } from '../wire.ts';
import type { FleetEvent } from './fleet.ts';
import { type Env, TIMEOUT, bindingOf, first, reach } from './edge.ts';
import { NODES, type Node, type Whereabouts, order } from './nodes.ts';

/**
 * Caddy's door to host on a node, which passes the console's reads on: its label on the tunnel's
 * side, `.app`, which is the side a VPC binding reaches. VPC sends it as the `Host`.
 */
const LABEL = new URL(URLS.internal.panel).hostname.split('.')[0];
export const PANEL = `http://${LABEL}.${new URL(URLS.internal.app).hostname}`;

/** What a read is made with: the Worker's bindings, and where Cloudflare says the reader is. */
export interface Edge {
	env: Env;
	where?: Whereabouts;
}

export interface Failure {
	status: number;
	code: Code;
	message: string;
}

/** What a read came back with, and the node that answered it. */
export type Read<T> = { ok: true; node: Node; data: T } | { ok: false; failure: Failure };

/**
 * Every node as the nearest relay that answers holds them, as `/state` passes it on. A relay that
 * has not answered in `timeout` milliseconds is given up on for the next.
 */
export async function cluster(edge: Edge, timeout = TIMEOUT): Promise<Read<Cluster>> {
	const reached = await first(
		order(edge.where),
		(node) =>
			reach(edge.env, node, '/state', { method: 'GET', signal: AbortSignal.timeout(timeout) }),
		(answer) => answer.ok,
	);
	if (reached === undefined) return failed(502, 'upstream_unavailable', 'No relay answered.');
	return opened<Cluster>(reached.node, reached.answer);
}

/** Every node's rows of the last 30 days, newest first, as one relay mirrors them. */
export interface Mirrored {
	version: number;
	/** The node whose relay answered. */
	node: Node;
	runs: FleetEvent[];
}

/**
 * Every node's runs as the nearest relay that answers mirrors them, `/runs` -- one read, answered
 * from the relay's own disk. See platform's spec/architecture/relay.md, "The runs, mirrored on
 * every relay's disk".
 */
export async function mirrored(edge: Edge, timeout = TIMEOUT): Promise<Read<Mirrored>> {
	const reached = await first(
		order(edge.where),
		(node) =>
			reach(edge.env, node, '/runs', { method: 'GET', signal: AbortSignal.timeout(timeout) }),
		(answer) => answer.ok,
	);
	if (reached === undefined) return failed(502, 'upstream_unavailable', 'No relay answered.');
	return opened<Mirrored>(reached.node, reached.answer);
}

/**
 * A `GET` of `path` under one node's `/api`, as `/node/now` or `/node/series?grain=minute`. A
 * `timeout` in milliseconds gives up on a node that has not answered, whole body included, as
 * unavailable.
 */
export async function node<T>(
	edge: Edge,
	name: string,
	path: `/${string}`,
	timeout?: number,
): Promise<Read<T>> {
	if (!isNode(name)) return failed(404, 'no_such_host', `No node is named ${name}.`);
	const binding = bindingOf(edge.env, name);
	const token = edge.env.HOST_READ_TOKEN;
	if (binding === undefined || !token) {
		return failed(502, 'upstream_unavailable', `${name} is not bound.`);
	}
	try {
		const answer = await binding.fetch(`${PANEL}/api${path}`, {
			headers: { authorization: `Bearer ${token}` },
			signal: timeout === undefined ? undefined : AbortSignal.timeout(timeout),
		});
		return await opened<T>(name, answer);
	} catch (error) {
		console.error(`read: ${name} did not answer: ${String(error)}`);
		return failed(502, 'upstream_unavailable', `${name} did not answer.`);
	}
}

export function isNode(name: string): name is Node {
	return Object.hasOwn(NODES, name);
}

/**
 * The envelope's data, or its failure; anything else that is not an envelope is the node's fault,
 * but a 404 is a path nothing on the node answers yet, as a route host has not deployed.
 */
async function opened<T>(node: Node, answer: Response): Promise<Read<T>> {
	const body = (await answer.json().catch(() => undefined)) as
		| { status: 'success'; data: T }
		| { status: 'error'; code: Code; message: string }
		| undefined;
	if (body?.status === 'success') return { ok: true, node, data: body.data };
	if (body?.status === 'error') {
		const { code, message } = body;
		return { ok: false, failure: { status: answer.status, code, message } };
	}
	if (answer.status === 404) return failed(404, 'no_such_route', `${node} has no such route.`);
	console.error(`read: ${node} answered ${answer.status} outside the envelope`);
	return failed(502, 'upstream_unavailable', `${node} answered outside the envelope.`);
}

function failed(status: number, code: Code, message: string): Read<never> {
	return { ok: false, failure: { status, code, message } };
}
