/**
 * Fleet events grouped by the CI run that caused them, and the numbers the Overview draws from
 * them. See spec/architecture/console.md, "The pipeline".
 */
import { ALL, type FleetEvent } from './fleet.ts';
import { type Edge, type Failure, mirrored } from './read.ts';
import type { Node } from './nodes.ts';

/** Where one app on one node got to in a run: its latest event. */
export interface Placement {
	node: Node;
	app: string;
	action: string;
	/** `running`, `succeeded`, `failed` or `skipped`. */
	outcome: string;
	/** Where it failed, where it is, or the last it reached; ../deployments/state.ts orders them. */
	stage?: string;
	detail?: string;
	started_at: string;
	finished_at?: string;
	/** Milliseconds from start to finish; none while it runs. */
	duration?: number;
}

export interface Run {
	run: number;
	commit?: string;
	/** Sorted by app, then node. */
	placements: Placement[];
	apps: string[];
	nodes: Node[];
	/** Counts of placements, by outcome. */
	succeeded: number;
	failed: number;
	skipped: number;
	running: number;
	first_start: string;
	/** The last finish of any placement; none while nothing has finished. */
	last_finish?: string;
	/** Milliseconds from first start to last finish; none while any placement runs. */
	duration?: number;
}

export interface Grouped {
	/** Newest first by first start. */
	runs: Run[];
	/** Uploads and panel actions: no run owns them. */
	apart: FleetEvent[];
}

const ms = Date.parse;

function placed(event: FleetEvent): Placement {
	const duration = event.finished_at ? ms(event.finished_at) - ms(event.started_at) : undefined;
	return {
		node: event.node,
		app: event.app,
		action: event.action,
		outcome: event.outcome,
		stage: event.stage,
		detail: event.detail,
		started_at: event.started_at,
		finished_at: event.finished_at,
		duration,
	};
}

/** Group events by `source.run`, keeping each (node, app)'s latest event as its placement. */
export function group(events: FleetEvent[]): Grouped {
	const latest = new Map<number, Map<string, FleetEvent>>();
	const apart: FleetEvent[] = [];
	for (const event of events) {
		const { kind, run } = event.source;
		if (kind !== 'run' || run === undefined) {
			apart.push(event);
			continue;
		}
		const places = latest.get(run) ?? new Map<string, FleetEvent>();
		const key = `${event.node}/${event.app}`;
		const held = places.get(key);
		if (!held || event.id > held.id) places.set(key, event);
		latest.set(run, places);
	}
	const runs = [...latest].map(([run, places]) => summarize(run, [...places.values()]));
	runs.sort((a, b) => ms(b.first_start) - ms(a.first_start) || b.run - a.run);
	return { runs, apart };
}

function summarize(run: number, events: FleetEvent[]): Run {
	const placements = events
		.map(placed)
		.sort((a, b) => a.app.localeCompare(b.app) || a.node.localeCompare(b.node));
	const count = (outcome: string) => placements.filter((p) => p.outcome === outcome).length;
	const starts = placements.map((p) => ms(p.started_at));
	const finishes = placements.flatMap((p) => (p.finished_at ? [ms(p.finished_at)] : []));
	const first = Math.min(...starts);
	const last = finishes.length ? Math.max(...finishes) : undefined;
	const running = count('running');
	return {
		run,
		commit: events.find((e) => e.source.commit)?.source.commit,
		placements,
		apps: [...new Set(placements.map((p) => p.app))],
		nodes: [...new Set(placements.map((p) => p.node))],
		succeeded: count('succeeded'),
		failed: count('failed'),
		skipped: count('skipped'),
		running,
		first_start: new Date(first).toISOString(),
		last_finish: last === undefined ? undefined : new Date(last).toISOString(),
		duration: last === undefined || running > 0 ? undefined : last - first,
	};
}

export type Runs = Grouped & { failures: Partial<Record<Node, Failure>> };

/**
 * Every node's rows of the last 30 days, one read of the nearest relay's mirror. Where no relay
 * answers, no node's rows were read, and each is said to be unread.
 */
export async function rows(
	edge: Edge,
): Promise<{ events: FleetEvent[]; failures: Runs['failures'] }> {
	const read = await mirrored(edge);
	if (read.ok) return { events: read.data.runs, failures: {} };
	return { events: [], failures: Object.fromEntries(ALL.map((node) => [node, read.failure])) };
}

/** The runs every node's rows of the last 30 days belong to. */
export async function runs(edge: Edge): Promise<Runs> {
	const { events, failures } = await rows(edge);
	return { ...group(events), failures };
}

export interface Aggregates {
	/** Runs started per UTC day, `YYYY-MM-DD`, oldest first, with the days between kept as zero. */
	frequency: { day: string; runs: number }[];
	/** Finished runs with no failed placement, over finished runs with a succeeded or failed one. */
	success_rate: number | null;
	/** Milliseconds. */
	median: number | null;
	p95: number | null;
}

/** The nearest-rank percentile of an ascending list. */
export function percentile(sorted: number[], p: number): number | null {
	if (sorted.length === 0) return null;
	return sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)] ?? null;
}

const DAY = 86_400_000;

export function aggregates(of: Run[]): Aggregates {
	const days = new Map<string, number>();
	for (const run of of) {
		const day = run.first_start.slice(0, 10);
		days.set(day, (days.get(day) ?? 0) + 1);
	}
	const frequency: Aggregates['frequency'] = [];
	if (days.size > 0) {
		const keys = [...days.keys()].sort();
		for (let at = ms(keys[0] as string); at <= ms(keys.at(-1) as string); at += DAY) {
			const day = new Date(at).toISOString().slice(0, 10);
			frequency.push({ day, runs: days.get(day) ?? 0 });
		}
	}
	const done = of.filter((r) => r.running === 0 && r.succeeded + r.failed > 0);
	const durations = done.flatMap((r) => (r.duration === undefined ? [] : [r.duration]));
	durations.sort((a, b) => a - b);
	return {
		frequency,
		success_rate: done.length ? done.filter((r) => r.failed === 0).length / done.length : null,
		median: percentile(durations, 0.5),
		p95: percentile(durations, 0.95),
	};
}
