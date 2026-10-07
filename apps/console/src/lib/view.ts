/**
 * Every node as this browser last heard it. Per node the highest version it has been sent is kept,
 * whichever relay or path sent it: an older one arriving late is dropped. See platform's
 * spec/architecture/relay.md, "A snapshot's version is its origin's clock".
 */
import { CONTRACT, type Cluster, type Held, type Live } from './wire.ts';

export interface View {
	nodes: Readonly<Record<string, Held>>;
	/** The node whose relay last sent the whole cluster. */
	via?: string;
	/** A contract version this console cannot read, from the last relay that spoke one. */
	refused?: number;
}

export const EMPTY: View = { nodes: {} };

/** `view` with `message` taken in; the same object when nothing in it was newer. */
export function merge(view: View, message: Live): View {
	if (message.type === 'node') return taken(view, { [message.node]: message.state });
	return mergeCluster(view, message);
}

/** `view` with a whole cluster taken in, as `/state` answers it or a socket opens with it. */
export function mergeCluster(view: View, cluster: Cluster): View {
	if (cluster.version !== CONTRACT) return { ...view, refused: cluster.version };
	const next = taken(view, cluster.nodes);
	return next.via === cluster.node && next.refused === undefined
		? next
		: { ...next, via: cluster.node, refused: undefined };
}

function taken(view: View, offered: Readonly<Record<string, Held>>): View {
	let nodes: Record<string, Held> | undefined;
	for (const [node, held] of Object.entries(offered)) {
		const kept = view.nodes[node];
		if (kept && kept.version >= held.version) continue;
		nodes ??= { ...view.nodes };
		nodes[node] = held;
	}
	return nodes ? { ...view, nodes } : view;
}
