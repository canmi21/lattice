/**
 * What a node's host answers under `/api/`, as the console reads it: the part of infra's
 * apps/deploy/panel/src/lib/api.ts it asks for, and the meter's shapes host passes on.
 */

/** Cores that run at one frequency, which the meter reads once for all of them. */
export interface CoreCluster {
	cores: number[];
	/** MHz at most. */
	max_frequency: number | null;
}

/** What does not change while the machine is up, as the meter reads it. */
export interface MachineInfo {
	model: string | null;
	kernel: string | null;
	cores: number;
	clusters: CoreCluster[];
	/** Bytes. */
	memory: number;
	swap: number;
	/** Bytes, of the filesystem the meter keeps its hours on. */
	storage: number | null;
	/** Seconds since the epoch. */
	booted: number | null;
}

/** One second of the machine: a value per metric. */
export interface Sample {
	at: number;
	values: Record<string, number>;
}

/** `/api/node/now`. */
export interface Now {
	info: MachineInfo;
	sample: Sample;
}

export interface Summary {
	average: number;
	minimum: number;
	maximum: number;
	count: number;
}

/** A bucket of time, named by when it starts, each metric summarized over it. */
export interface Point {
	at: number;
	values: Record<string, Summary>;
}

export type Grain = 'second' | 'minute' | 'hour';

/** One version of an app: its manifest as far as the console reads it, and the image it runs. */
export interface Version {
	manifest: {
		name: string;
		container?: { port?: number; socket?: string; memory_mb?: number };
		/** `replace`, `beside` or `manual`; see ./apps/rollout.ts. */
		rollout?: string;
	};
	image: string;
}

/** `/api/apps` and `/api/apps/{name}`: an app as host shows it. */
export interface AppDetail extends Version {
	previous: Version | null;
	deployed_at: string;
	held: boolean;
	running: boolean;
	restorable: boolean;
	/** host, keeper, Caddy or the tunnel: restarted from there, never stopped. */
	platform: boolean;
	/** objects or postgres: no container of its own, so nothing to start or stop. */
	driver: boolean;
	/** `replace`, `beside` or `manual`, absent before host sends it; see ./apps/rollout.ts. */
	rollout?: string;
}

/**
 * `/api/apps/{name}/health`: host asking the app's own `/health` on its behalf. `body` is the app's
 * JSON as it answered, read by whoever knows that app; see ./apps/health.ts.
 */
export interface Checked {
	app: string;
	answered: boolean;
	/** The app's HTTP status, none when it did not answer. */
	code: number | null;
	body: unknown;
	checked_at: string;
	/** Why it did not answer. */
	error?: string;
}

/** A page of events: `before` is an event id on that node, and the next page is the one before. */
export interface Page {
	before?: number;
	limit?: number;
}

export interface Mount {
	path: string;
	total: number;
	used: number;
	available: number;
}

export interface AppUsage {
	app: string;
	bytes: number;
	/** The walk was cut off by its time budget, so `bytes` is a lower bound. */
	partial: boolean;
}

export interface DiskSnapshot {
	name: string;
	app: string;
	created: string;
}

/** `/api/inspect/disk`. */
export interface Disk {
	mounts: Mount[];
	apps: AppUsage[];
	snapshots: DiskSnapshot[];
}
