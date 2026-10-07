/**
 * What a relay sends a browser, as apps/system/relay writes it: `live.rs` for the socket's two
 * messages, `own.rs` for a snapshot, `host.rs` for its events and apps. A word host owns -- an
 * action, an outcome, a stage -- stays a string, since host may add to it.
 */

/** The contract this console reads; a relay speaking another is not read. */
export const CONTRACT = 1;

export interface Source {
	/** `run`, `upload` or `panel`. */
	kind: string;
	run?: number;
	commit?: string;
}

export interface Event {
	id: number;
	app: string;
	action: string;
	source: Source;
	image?: string;
	/** `running`, `succeeded`, `failed` or `skipped`. */
	outcome: string;
	/** `downloading` to `draining`, as ./deployments/state.ts orders them. */
	stage?: string;
	/** Why it failed; on a skip of an app deployed by hand, the command that deploys it. */
	detail?: string;
	started_at: string;
	finished_at?: string;
}

export interface App {
	name: string;
	image: string;
	deployed_at: string;
	running: boolean;
	held: boolean;
	/** Absent until the relay passes host's on; see ./apps/rollout.ts. */
	rollout?: string;
}

export interface Snapshot {
	taken_at: string;
	events: Event[];
	apps: App[];
	/** The meter's `{ info, sample }`, passed on whole; absent where no meter is deployed. */
	machine?: unknown;
	/** The parts the node's last round failed to read, each held at what was read before. */
	stale?: string[];
}

/** What a relay holds of one node. */
export interface Held {
	/** The node's own clock in milliseconds; higher is newer. */
	version: number;
	/** When the answering relay took this version. */
	heard_at: string;
	snapshot: Snapshot;
}

/** Every node at once: `/state`'s data, and a socket's first message. */
export interface Cluster {
	version: number;
	/** The node whose relay answered. */
	node: string;
	nodes: Record<string, Held>;
}

export type Live = ({ type: 'cluster' } & Cluster) | { type: 'node'; node: string; state: Held };
