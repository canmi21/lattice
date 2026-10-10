/**
 * What is deploying now and what failed last, kept live: seeded from the events a load read, then
 * overtaken by the events each node's snapshot carries as the relay passes them on. A step is one
 * app on one node at its latest event, within its CI run, or apart from any run where it was done
 * by hand, from an upload or by keeper. Steps are grouped by run, and the rest by node.
 */
import type { FleetEvent } from '../server/fleet.ts';
import type { Run } from '../server/runs.ts';
import type { Entry, Event } from '../wire.ts';

export interface Step {
	/** The CI run it belongs to; none for a step no run started. */
	run?: number;
	/** Who started it: `run`, `panel`, `upload`, or a word host adds since. */
	source: string;
	/** `deploy`, `redeploy`, `rollback`, `start`, `stop` and the rest host names. */
	action: string;
	node: string;
	app: string;
	/** `running`, `succeeded`, `failed` or `skipped`. */
	outcome: string;
	stage?: string;
	detail?: string;
	started_at: string;
	finished_at?: string;
	/** The event's id on its node, where the step came from an event rather than a run's summary. */
	id?: number;
	/** The commit its run built. */
	commit?: string;
}

/**
 * A step as the timeline reads it: where it stands, what came of it and when, and why where it
 * failed; nothing a run's page or a node's events read besides.
 */
export type Trace = Pick<
	Step,
	'run' | 'source' | 'node' | 'app' | 'outcome' | 'started_at' | 'finished_at' | 'detail' | 'id'
>;

/** `step` as a trace: its why kept where it failed alone, and nothing left undefined. */
export function traced(step: Step): Trace {
	const { run, source, node, app, outcome, started_at, finished_at, detail } = step;
	return {
		...(run === undefined ? {} : { run }),
		source,
		node,
		app,
		outcome,
		started_at,
		...(finished_at ? { finished_at } : {}),
		...(outcome === 'failed' && detail ? { detail } : {}),
	};
}

/**
 * Traces as the `steps` facet sends them, each name written once: per step seven numbers -- its
 * node, app, source and outcome by their place in `names`, its run or -1, how long after the step
 * before it it started, and how long it took or -1 while it runs -- in the order they started, so
 * the numbers are small and repeat. See spec/architecture/console.md, "A component asks for its
 * facet".
 */
export interface Packed {
	names: { node: string[]; app: string[]; source: string[]; outcome: string[] };
	/** When the first step started, in milliseconds. */
	from: number;
	steps: number[];
	/** Why each failed step failed, by its place in the start order. */
	details: Record<string, string>;
}

/** The numbers one step takes in `Packed.steps`. */
const STRIDE = 7;

export function packed(traces: readonly Trace[]): Packed {
	const timed = traces
		.map((trace) => ({ trace, start: Date.parse(trace.started_at) }))
		.filter((one) => !Number.isNaN(one.start))
		.toSorted((a, b) => a.start - b.start);
	const names: Packed['names'] = { node: [], app: [], source: [], outcome: [] };
	const indexOf = (list: string[], name: string) => {
		const at = list.indexOf(name);
		return at === -1 ? list.push(name) - 1 : at;
	};
	const steps: number[] = [];
	const details: Record<string, string> = {};
	let before = timed[0]?.start ?? 0;
	for (const [at, { trace, start }] of timed.entries()) {
		const end = trace.finished_at ? Date.parse(trace.finished_at) : Number.NaN;
		steps.push(
			indexOf(names.node, trace.node),
			indexOf(names.app, trace.app),
			indexOf(names.source, trace.source),
			indexOf(names.outcome, trace.outcome),
			trace.run ?? -1,
			start - before,
			Number.isNaN(end) ? -1 : end - start,
		);
		if (trace.detail) details[at] = trace.detail;
		before = start;
	}
	return { names, from: timed[0]?.start ?? 0, steps, details };
}

export function unpacked({ names, from, steps, details }: Packed): Trace[] {
	const traces: Trace[] = [];
	let start = from;
	for (let at = 0; at * STRIDE < steps.length; at++) {
		const [node, app, source, outcome, run, after, took] = steps.slice(
			at * STRIDE,
			(at + 1) * STRIDE,
		) as [number, number, number, number, number, number, number];
		start += after;
		traces.push({
			...(run === -1 ? {} : { run }),
			source: names.source[source] ?? '',
			node: names.node[node] ?? '',
			app: names.app[app] ?? '',
			outcome: names.outcome[outcome] ?? '',
			started_at: new Date(start).toISOString(),
			...(took === -1 ? {} : { finished_at: new Date(start + took).toISOString() }),
			...(details[at] ? { detail: details[at] } : {}),
		});
	}
	return traces;
}

/** An event as a step: a run's within it, anything else apart. */
function stepOf(node: string, event: Event): Step {
	const { kind, run, commit } = event.source;
	const { app, action, outcome, stage, detail, started_at, finished_at, id } = event;
	return {
		run: kind === 'run' ? run : undefined,
		...(kind === 'run' && commit ? { commit } : {}),
		source: kind,
		action,
		node,
		app,
		outcome,
		stage,
		detail,
		started_at,
		finished_at,
		id,
	};
}

/**
 * The runs' running placements and the running events no run owns, `apart`, then the
 * `failures` most recent failed of either and the `finished` most recent that did not fail, and
 * every step that started at `since` or later besides: enough for the verdict, and the whole of
 * the day the timeline draws.
 */
export function fromHistory(
	runs: Run[],
	apart: FleetEvent[] = [],
	failures = 40,
	finished = 80,
	since = Number.POSITIVE_INFINITY,
): Step[] {
	const steps: Step[] = runs.flatMap((run) =>
		run.placements.map(
			({ node, app, action, outcome, stage, detail, started_at, finished_at }) => ({
				run: run.run,
				...(run.commit ? { commit: run.commit } : {}),
				source: 'run',
				action,
				node,
				app,
				outcome,
				stage,
				detail,
				started_at,
				finished_at,
			}),
		),
	);
	steps.push(...latestApart(apart.map((event) => stepOf(event.node, event))));
	const failed = steps.filter((step) => step.outcome === 'failed').toSorted(latest);
	const done = steps.filter(isDone).toSorted(latest);
	const kept = new Set([
		...steps.filter((step) => step.outcome === 'running'),
		...failed.slice(0, failures),
		...done.slice(0, finished),
	]);
	const recent = steps.filter((step) => !kept.has(step) && Date.parse(step.started_at) >= since);
	return [...kept, ...recent];
}

/**
 * A step that has ended having done something: succeeded, or whatever host adds since. A skip is
 * a node a run had nothing for, which is no activity; see spec/console/overview.md.
 */
const isDone = (step: Step) => !['running', 'failed', 'skipped'].includes(step.outcome);

/** Every event each node's snapshot holds. */
export function fromLive(nodes: Readonly<Record<string, Entry>>): Step[] {
	return Object.entries(nodes).flatMap(([node, held]) =>
		(held.snapshot?.events ?? []).map((event) => stepOf(node, event)),
	);
}

/** One step's place: within its run, or, apart from any, its source's on its node. */
const keyOf = (step: Trace): string =>
	step.run === undefined
		? `${step.source}/${step.node}/${step.app}`
		: `run ${step.run}/${step.node}/${step.app}`;

/** Each place's newest event, by id where both have one. */
function latestApart(steps: Step[]): Step[] {
	const held = new Map<string, Step>();
	for (const step of steps) {
		const kept = held.get(keyOf(step));
		if (!kept || (step.id ?? 0) > (kept.id ?? 0)) held.set(keyOf(step), step);
	}
	return [...held.values()];
}

/** What is deploying under one heading: a run, or a node's steps no run started. */
export interface Group {
	key: string;
	/** The run's number; none for a node's group. */
	run?: number;
	/** The node every step stands on, for a node's group. */
	node?: string;
	steps: Step[];
}

export interface Now {
	/** Groups with a step still going, newest first, each step by app then node. */
	running: Group[];
	/** The most recent failed steps, newest first. */
	failed: Step[];
	/** The most recent steps that ended having done something, newest first. */
	done: Step[];
}

/** Newest first, by when it finished or else when it started. */
function latest(a: Step, b: Step): number {
	return Date.parse(b.finished_at ?? b.started_at) - Date.parse(a.finished_at ?? a.started_at);
}

/** `seed` overtaken by `live` wherever both hold a step: a snapshot's event is the newer. */
export function merged<T extends Trace>(seed: T[], live: T[]): T[] {
	const held = new Map<string, T>();
	for (const step of seed) held.set(keyOf(step), step);
	for (const step of live) {
		const kept = held.get(keyOf(step));
		if (!kept || kept.id === undefined || (step.id ?? 0) > kept.id) held.set(keyOf(step), step);
	}
	return [...held.values()];
}

/** What is going, failed and finished, of `seed` and `live` together; see `merged`. */
export function current(seed: Step[], live: Step[], failures = 40, finished = 80): Now {
	const steps = merged(seed, live);
	const groups = new Map<string, Group>();
	for (const step of steps.filter((one) => one.outcome === 'running')) {
		const key = step.run === undefined ? `node ${step.node}` : `run ${step.run}`;
		const group = groups.get(key) ?? {
			key,
			...(step.run === undefined ? { node: step.node } : { run: step.run }),
			steps: [],
		};
		group.steps.push(step);
		groups.set(key, group);
	}
	for (const group of groups.values()) {
		group.steps = group.steps.toSorted(
			(a, b) => a.app.localeCompare(b.app) || a.node.localeCompare(b.node),
		);
	}
	const running = [...groups.values()].toSorted(
		(a, b) => first(b.steps) - first(a.steps) || (b.run ?? 0) - (a.run ?? 0),
	);
	const failed = steps.filter((one) => one.outcome === 'failed').toSorted(latest);
	const done = steps.filter(isDone).toSorted(latest);
	return { running, failed: failed.slice(0, failures), done: done.slice(0, finished) };
}

const first = (steps: Step[]) => Math.min(...steps.map((step) => Date.parse(step.started_at)));

/**
 * What a step no run started is, in a few words: `Redeploy`, `Rollback with data`, `Deploy of an
 * upload`, and for a source the console does not know, its word beside the action's.
 */
export function what(step: Pick<Step, 'action' | 'source'>): string {
	const action = step.action.replaceAll('_', ' ');
	const said = action.charAt(0).toUpperCase() + action.slice(1);
	if (step.source === 'panel' || step.source === 'run') return said;
	if (step.source === 'upload') return `${said} of an upload`;
	return `${said} by ${step.source}`;
}
