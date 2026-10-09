/**
 * What is deploying now and what failed last, kept live: seeded from the events a load read, then
 * overtaken by the events each node's snapshot carries as the relay passes them on. A step is one
 * app on one node at its latest event, within its CI run, or apart from any run where it was done
 * by hand, from an upload or by keeper. Steps are grouped by run, and the rest by node.
 */
import type { FleetEvent } from '../server/fleet.ts';
import type { Run } from '../server/runs.ts';
import type { Event, Held } from '../wire.ts';

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
 * `failures` most recent failed of either and the `finished` most recent that did not fail: enough
 * steps that, a run's placements gathered into one line, the overview's lists still fill.
 */
export function fromHistory(
	runs: Run[],
	apart: FleetEvent[] = [],
	failures = 40,
	finished = 80,
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
	return [
		...steps.filter((step) => step.outcome === 'running'),
		...failed.slice(0, failures),
		...done.slice(0, finished),
	];
}

/**
 * A step that has ended having done something: succeeded, or whatever host adds since. A skip is
 * a node a run had nothing for, which is no activity; see spec/console/overview.md.
 */
const isDone = (step: Step) => !['running', 'failed', 'skipped'].includes(step.outcome);

/** Every event each node's snapshot holds. */
export function fromLive(nodes: Readonly<Record<string, Held>>): Step[] {
	return Object.entries(nodes).flatMap(([node, held]) =>
		held.snapshot.events.map((event) => stepOf(node, event)),
	);
}

/** One step's place: within its run, or, apart from any, its source's on its node. */
const keyOf = (step: Step): string =>
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
export function current(seed: Step[], live: Step[], failures = 40, finished = 80): Now {
	const held = new Map<string, Step>();
	for (const step of seed) held.set(keyOf(step), step);
	for (const step of live) {
		const kept = held.get(keyOf(step));
		if (!kept || kept.id === undefined || (step.id ?? 0) > kept.id) held.set(keyOf(step), step);
	}
	const steps = [...held.values()];
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

/** A run as one line, however many apps and nodes it went to; or one thing done by hand. */
export interface Line {
	key: string;
	/** The run it belongs to; none for what no run started, gathered by its source and moment. */
	run?: number;
	/** Its apps, those that failed first, then in the order their steps came. */
	apps: string[];
	/** What was done, where no run started it: `Redeploy`, `Deploy of an upload`. */
	what?: string;
	/** The commit its run built. */
	commit?: string;
	/** Its nodes, in the order their steps came. */
	nodes: string[];
	/** Going while any step goes; failed if any failed; else what the rest ended as. */
	outcome: 'running' | 'failed' | 'succeeded';
	/** Where it is, or where it stopped. */
	stage?: string;
	/** Why it failed, from the first step that did. */
	detail?: string;
	/** When it last moved. */
	at: string;
	/** Milliseconds from its first start to its last finish, once nothing of it goes. */
	duration?: number;
}

const TEN_MINUTES = 600_000;

/** `steps` gathered a line a run, newest first. See spec/console/overview.md. */
export function lines(steps: Step[]): Line[] {
	const gathered = new Map<string, Step[]>();
	for (const step of steps) {
		// What no run started is gathered by who started it and when, to the ten minutes: one
		// upload's or one panel action's placements land within moments of each other.
		const key =
			step.run === undefined
				? `${step.source} ${step.app} ${Math.floor(Date.parse(step.started_at) / TEN_MINUTES)}`
				: `run ${step.run}`;
		gathered.set(key, [...(gathered.get(key) ?? []), step]);
	}
	return [...gathered]
		.map(([key, group]): Line => {
			const going = group.find((one) => one.outcome === 'running');
			const failed = group.find((one) => one.outcome === 'failed');
			const telling = going ?? failed;
			const first = group[0] as Step;
			const apps = [...new Set(group.map((one) => one.app))];
			const broke = new Set(group.filter((one) => one.outcome === 'failed').map((one) => one.app));
			const ends = group.map((one) => Date.parse(one.finished_at ?? one.started_at));
			const start = Math.min(...group.map((one) => Date.parse(one.started_at)));
			const commit = group.find((one) => one.commit)?.commit;
			return {
				key,
				...(first.run === undefined ? { what: what(first) } : { run: first.run }),
				apps: [...apps.filter((app) => broke.has(app)), ...apps.filter((app) => !broke.has(app))],
				...(commit ? { commit } : {}),
				nodes: [...new Set(group.map((one) => one.node))],
				outcome: going ? 'running' : failed ? 'failed' : 'succeeded',
				...(telling?.stage ? { stage: telling.stage } : {}),
				...(failed?.detail ? { detail: failed.detail } : {}),
				at: new Date(Math.max(...ends)).toISOString(),
				...(going ? {} : { duration: Math.max(...ends) - start }),
			};
		})
		.toSorted((a, b) => Date.parse(b.at) - Date.parse(a.at));
}
