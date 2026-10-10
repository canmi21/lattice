/**
 * What a relay sends a browser, as apps/system/relay writes it: `live.rs` for the socket's two
 * messages, `own.rs` for a snapshot, `host.rs` for its events and apps. A word host owns -- an
 * action, an outcome, a stage -- stays a string, since host may add to it.
 */

/** The contract this console reads; a relay speaking another is not read. */
export const CONTRACT = 1;

export interface Source {
	/** `run`, `upload`, `panel`, or `keeper` for keeper's acts on host; host may add more. */
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
	/**
	 * Its relay's round trip to each neighbor's, in seconds, by node; a neighbor not timed lately
	 * is absent. Platform's spec/architecture/relay.md, "The round trip to each neighbor".
	 */
	round_trip?: Record<string, number>;
	/**
	 * Its relay's last word before it stopped on purpose: why, and the seconds it means to be back
	 * within. Platform's spec/architecture/relay.md, "A node says it is leaving before it goes".
	 */
	leaving?: { reason: 'upgrade' | 'restart'; within: number };
}

/** A node as the answering relay reads it; see `Snapshot.leaving` for where it is defined. */
export type State = 'live' | 'late' | 'upgrading' | 'restarting' | 'waiting' | 'gone';

/** What a relay holds of one node. */
export interface Held {
	/** The node's own clock in milliseconds; higher is newer. */
	version: number;
	/** When the answering relay took this version. */
	heard_at: string;
	snapshot: Snapshot;
	/** Absent from a relay on the build before it; see ./node.ts, `stateOf`. */
	state?: State;
	/**
	 * The console's own mark, never a relay's: held lean for the first paint, events that are not
	 * running left out, so the socket's whole copy replaces it at an equal version.
	 */
	partial?: true;
}

/** A peer the answering relay has not heard since it started, `waiting` and then `gone`. */
export interface Unheard {
	state: State;
	version?: undefined;
	heard_at?: undefined;
	snapshot?: undefined;
}

/** One node as a relay sends it: what it holds, or its state alone. */
export type Entry = Held | Unheard;

/** Every node at once: `/state`'s data, and a socket's first message. */
export interface Cluster {
	version: number;
	/** The node whose relay answered. */
	node: string;
	nodes: Record<string, Entry>;
}

export type Live = ({ type: 'cluster' } & Cluster) | { type: 'node'; node: string; state: Entry };

/**
 * One slot of one node's history, as `/history` answers it: absent where it holds nothing.
 * Platform's spec/architecture/relay.md, "Each node's minutes, kept for a year".
 */
export interface Slot {
	at: string;
	/** The rounds that read host, of those `due`, twenty a minute. */
	beats?: number;
	due?: number;
	/** Minutes unheard, and of them those after a minute that said it was leaving. */
	missing?: number;
	announced?: number;
	/** Minutes that said the node was leaving. */
	leaving?: number;
	/** Each app's rounds down. */
	down?: Record<string, number>;
	/** Each neighbor's round trip, in seconds. */
	round_trip?: Record<string, { mean: number; worst: number }>;
	runs?: { succeeded?: number; failed?: number; running?: number; partly_failed?: number };
}

/** Every node's history over a span, `/history`'s data. */
export interface History {
	version: number;
	node: string;
	from: string;
	until: string;
	/** Seconds a slot. */
	slot: number;
	nodes: Record<string, Slot[]>;
}
