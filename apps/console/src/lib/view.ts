/**
 * Every node as this browser last heard it. Per node the highest version it has been sent is kept,
 * whichever relay or path sent it: an older one arriving late is dropped. See platform's
 * spec/architecture/relay.md, "A snapshot's version is its origin's clock". The same version
 * with another `state` is taken too, which time alone changed, and a peer the relay has not heard
 * gives its state alone -- the same file, "A node says it is leaving before it goes".
 */
import { CONTRACT, type Cluster, type Entry, type Live } from './wire.ts';

export interface View {
	nodes: Readonly<Record<string, Entry>>;
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

function taken(view: View, offered: Readonly<Record<string, Entry>>): View {
	let nodes: Record<string, Entry> | undefined;
	for (const [node, entry] of Object.entries(offered)) {
		const next = after(view.nodes[node], entry);
		if (next === view.nodes[node]) continue;
		nodes ??= { ...view.nodes };
		nodes[node] = next;
	}
	return nodes ? { ...view, nodes } : view;
}

/** What is held of a node once `entry` is offered: `kept` itself where nothing in it is news. */
function after(kept: Entry | undefined, entry: Entry): Entry {
	if (!kept) return entry;
	if (entry.version === undefined) {
		// What this browser holds stays, under the state the relay says now.
		return kept.state === entry.state ? kept : { ...kept, state: entry.state };
	}
	if (kept.version === undefined || entry.version > kept.version) return entry;
	// A lean first paint's node, given whole at last.
	if (kept.partial && !entry.partial && entry.version === kept.version) return entry;
	return entry.version === kept.version && entry.state !== kept.state ? entry : kept;
}
