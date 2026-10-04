/**
 * host's API as the panel's pages read it, under `/api/`, which the panel's server passes on to
 * host: same origin, the session cookie carried by the browser, and every answer in the envelope.
 * See spec/architecture/host.md, "The panel is an app of its own".
 */
import type { ApiResponse } from '@canmi/response';

export interface Version {
	manifest: { name: string; container?: { port?: number; socket?: string; memory_mb?: number } };
	image: string;
}

/** An app as host shows it. */
export interface App extends Version {
	previous: Version | null;
	deployed_at: string;
	held: boolean;
	running: boolean;
	restorable: boolean;
	/** host, keeper, Caddy or the tunnel: restarted from here, never stopped. */
	platform: boolean;
	/** objects or postgres: no container of its own, so nothing to start or stop. */
	driver: boolean;
}

/** An image on the machine, and why it stays: `no` is nothing could run it again. */
export interface Image {
	id: string;
	tags: string[];
	size: number;
	created: number;
	kept: 'current' | 'previous' | 'used' | 'keeper' | 'no';
	app?: string;
	/** When it was found collectable, and when it goes on its own. */
	flagged_at?: string;
	removed_at?: string;
}

/** Something the panel asked of the images, done in host's background. */
export interface ImageTask {
	id: number;
	kind: 'remove' | 'collect';
	image?: string;
	state: 'queued' | 'running' | 'done' | 'failed';
	asked_at: string;
	finished_at?: string;
	detail?: string;
}

/** The images as host's background last found them, and the tasks asked of it. */
export interface Images {
	scan: { at: string; images: Image[]; size: number | null } | null;
	tasks: ImageTask[];
	grace_seconds: number;
}

export type Action =
	| 'deploy'
	| 'redeploy'
	| 'rollback'
	| 'rollback_with_data'
	| 'start'
	| 'stop'
	| 'restart';

export interface Event {
	id: number;
	app: string;
	action: Action;
	source: { kind: 'run' | 'upload' | 'panel'; run?: number; commit?: string };
	image?: string;
	snapshot?: string;
	outcome: 'running' | 'succeeded' | 'failed' | 'skipped';
	detail?: string;
	started_at: string;
	finished_at?: string;
}

export interface Route {
	name: string;
	upstream: string;
	private: boolean;
	/** Always true: a route is always on `.app`. host refuses a route put with this false. */
	public: boolean;
	home?: string;
}

export interface Environment {
	config: Record<string, string>;
	secrets: string[];
}

export interface Archived {
	file: string;
	bytes: number;
}

/** Cores that run at one frequency, which the meter reads once for all of them. */
export interface Cluster {
	cores: number[];
	/** MHz at most. */
	max_frequency: number | null;
}

/** What does not change while the machine is up, as the meter reads it. */
export interface MachineInfo {
	model: string | null;
	kernel: string | null;
	cores: number;
	/** The cores that share a clock. */
	clusters: Cluster[];
	/** Bytes. */
	memory: number;
	swap: number;
	/** Bytes, of the filesystem the meter keeps its hours on. */
	storage: number | null;
	/** Seconds since the epoch. */
	booted: number | null;
}

/** One second of the machine: a value per metric. See spec/architecture/meter.md, "Metrics". */
export interface Sample {
	at: number;
	values: Record<string, number>;
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

/** One thing a service was asked to do, as the ledger keeps it. See spec/architecture/ledger.md,
 * "A task, and the events that make it up". */
export interface Task {
	service: string;
	id: string;
	/** What was asked, in the service's own words: `capture`. */
	kind: string;
	state: 'queued' | 'running' | 'done' | 'failed';
	caller: 'public' | 'ours';
	parent: { service: string; id: string } | null;
	asked_at: string;
	started_at?: string;
	finished_at?: string;
	updated_at: string;
	/** A small object the service chooses: for `shot`, the page's URL. */
	summary: Record<string, unknown>;
	/** Why it failed, in the service's own words, when it did. */
	detail?: string;
	/** What `before` takes to page `GET /tasks` past this task. */
	cursor: string;
}

/** One step of a task, appended and never changed, in `seq` order. */
export interface TaskEvent {
	service: string;
	task: string;
	seq: number;
	at: string;
	/** The step, in the service's own words: `resolving`, `loading`, `rendering`, `storing`. */
	stage: string;
	level: 'info' | 'warn' | 'error';
	message: string;
	data?: Record<string, unknown>;
}

/** A task's own fields, flattened, plus its events in `seq` order and the tasks it is the parent
 * of, newest first. */
export interface TaskDetail extends Task {
	events: TaskEvent[];
	children: Task[];
}

/** How a run ended, as cron's `Outcome` words it. */
export type Outcome = 'running' | 'done' | 'failed' | 'skipped';

/** A job's latest run, whatever started it, as cron's `store::Last` serializes. */
export interface LastRun {
	/** The run's id, which is its ledger task's, under service `cron`: `/tasks/cron/<run>`. */
	run: string;
	/** The due time it ran for; none for one asked by hand. */
	due: string | null;
	started_at: string;
	finished_at: string | null;
	outcome: Outcome;
	/** The status the service answered with, when it answered. */
	status: number | null;
	detail: string | null;
}

/**
 * One job cron runs on this node, its own `Job` fields flattened in, as `GET /schedules` answers
 * -- cron's `scheduler::View`, read directly from `apps/cron/src/scheduler.rs` and
 * `apps/cron/src/store.rs` while both are written in parallel, kept here in one place so it stays
 * easy to re-align. See spec/architecture/cron.md, "cron answers on its own `[api]` scope,
 * privately", "Seen in the panel".
 */
export interface Schedule {
	service: string;
	name: string;
	/** Exactly one of `cron` and `every` is set, matching the job's own declaration. */
	cron: string | null;
	every: string | null;
	/** RFC 3339, UTC: when this job next falls due, none once it has nothing left to run for. */
	next: string | null;
	/** Held until cron restarts -- see cron.md, "Seen in the panel". */
	paused: boolean;
	running: boolean;
	/** A run due while the last still goes, waiting behind it -- see cron.md, "Overlap". */
	queued: boolean;
	last: LastRun | null;
}

/** Not signed in, or signed out since: the panel asks for the token again. */
export class SignedOut extends Error {}

/** A refusal, as host words it. */
export class Refused extends Error {
	constructor(
		readonly code: string,
		message: string,
	) {
		super(message);
	}
}

export async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
	const response = await fetch(path, {
		method,
		headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
		body: body === undefined ? undefined : JSON.stringify(body),
	});
	if (response.status === 401) throw new SignedOut();
	// A change with nothing to say: stored, and Caddy in step.
	if (response.status === 204) return null as T;
	const envelope = (await response.json()) as ApiResponse<T>;
	if (envelope.status === 'error') throw new Refused(envelope.code, envelope.message);
	return envelope.data;
}

export const api = {
	signIn: (token: string) => call<null>('POST', '/api/session', { token }),
	signOut: () => call<null>('DELETE', '/api/session'),
	apps: () => call<App[]>('GET', '/api/apps'),
	app: (name: string) => call<App>('GET', `/api/apps/${name}`),
	history: (name: string, before?: number) =>
		call<Event[]>('GET', `/api/apps/${name}/history${before ? `?before=${before}` : ''}`),
	lines: (name: string) => call<{ lines: string[] }>('GET', `/api/apps/${name}/logs`),
	archived: (name: string) => call<Archived[]>('GET', `/api/apps/${name}/logs/archive`),
	environment: (name: string) => call<Environment>('GET', `/api/apps/${name}/environment`),
	setVariable: (name: string, kind: 'config' | 'secret', key: string, value: string) =>
		call<{ changed: boolean }>('PUT', `/api/apps/${name}/environment/${kind}/${key}`, { value }),
	unsetVariable: (name: string, kind: 'config' | 'secret', key: string) =>
		call<{ changed: boolean }>('DELETE', `/api/apps/${name}/environment/${kind}/${key}`),
	redeploy: (name: string) => call<unknown>('POST', `/api/apps/${name}/redeploy`),
	rollback: (name: string, withData: boolean) =>
		call<unknown>('POST', `/api/apps/${name}/rollback`, { with_data: withData }),
	act: (name: string, act: 'start' | 'stop' | 'restart') =>
		call<unknown>('POST', `/api/apps/${name}/${act}`),
	now: () => call<{ info: MachineInfo; sample: Sample }>('GET', '/api/node/now'),
	series: (grain: Grain, metrics: string[], since?: number) => {
		const query = new URLSearchParams({ grain, metrics: metrics.join(',') });
		if (since !== undefined) query.set('since', String(since));
		return call<Point[]>('GET', `/api/node/series?${query}`);
	},
	images: () => call<Images>('GET', '/api/images'),
	removeImage: (id: string) => call<ImageTask>('DELETE', `/api/images/${encodeURIComponent(id)}`),
	collectImages: () => call<ImageTask>('POST', '/api/images/collect'),
	scanImages: () => call<null>('POST', '/api/images/scan'),
	/** One container's latest second, `<name>.cpu` and the rest. */
	appNow: (name: string) => call<Sample>('GET', `/api/apps/${name}/metrics/now`),
	appSeries: (name: string, grain: Grain, since?: number) => {
		const query = new URLSearchParams({ grain });
		if (since !== undefined) query.set('since', String(since));
		return call<Point[]>('GET', `/api/apps/${name}/metrics/series?${query}`);
	},
	routes: () => call<Route[]>('GET', '/api/routes'),
	putRoute: (route: Route) => call<null>('PUT', `/api/routes/${route.name}`, route),
	deleteRoute: (name: string) => call<null>('DELETE', `/api/routes/${name}`),
	tasks: (filter: TaskFilter, before?: string, limit = TASK_PAGE_SIZE) =>
		call<Task[]>('GET', `/ledger/tasks${taskQuery(filter, before, limit)}`),
	task: (service: string, id: string) =>
		call<TaskDetail>(
			'GET',
			`/ledger/tasks/${encodeURIComponent(service)}/${encodeURIComponent(id)}`,
		),
	schedules: () => call<Schedule[]>('GET', '/cron/schedules'),
	runSchedule: (service: string, name: string) =>
		call<unknown>(
			'POST',
			`/cron/schedules/${encodeURIComponent(service)}/${encodeURIComponent(name)}/run`,
		),
	pauseSchedule: (service: string, name: string) =>
		call<unknown>(
			'POST',
			`/cron/schedules/${encodeURIComponent(service)}/${encodeURIComponent(name)}/pause`,
		),
	resumeSchedule: (service: string, name: string) =>
		call<unknown>(
			'POST',
			`/cron/schedules/${encodeURIComponent(service)}/${encodeURIComponent(name)}/resume`,
		),
};

/** What the Tasks page narrows the list by, each optional. */
export interface TaskFilter {
	service?: string;
	state?: Task['state'];
}

/** A page's size, at most 500 per spec/architecture/ledger.md, "Read by the panel". */
export const TASK_PAGE_SIZE = 50;

function taskQuery(filter: TaskFilter, before?: string, limit = TASK_PAGE_SIZE): string {
	const query = new URLSearchParams({ limit: String(limit) });
	if (filter.service) query.set('service', filter.service);
	if (filter.state) query.set('state', filter.state);
	if (before) query.set('before', before);
	return `?${query}`;
}

/** An image id as a person reads it. */
export function short(image: string | undefined): string {
	return image ? image.replace(/^sha256:/, '').slice(0, 12) : '';
}

/** A moment as a person reads it, in their own zone. */
export function when(stamp: string | undefined): string {
	return stamp ? new Date(stamp).toLocaleString() : '';
}
