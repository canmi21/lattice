/**
 * What is deploying now and what failed last, kept live: seeded from the runs a load read, then
 * overtaken by the events each node's snapshot carries as the relay passes them on. A step is
 * one app on one node in one run, at its latest event.
 */
import type { Run } from '../server/runs.ts';
import type { Held } from '../wire.ts';

export interface Step {
	run: number;
	node: string;
	app: string;
	/** `running`, `succeeded`, `failed` or `skipped`. */
	outcome: string;
	stage?: string;
	detail?: string;
	started_at: string;
	finished_at?: string;
	/** The event's id on its node, where the step came from a snapshot. */
	id?: number;
}

/** The runs' running placements, and their `failures` most recent failed ones. */
export function fromRuns(of: Run[], failures = 5): Step[] {
	const steps: Step[] = of.flatMap((run) =>
		run.placements.map(({ node, app, outcome, stage, detail, started_at, finished_at }) => ({
			run: run.run,
			node,
			app,
			outcome,
			stage,
			detail,
			started_at,
			finished_at,
		})),
	);
	const failed = steps.filter((step) => step.outcome === 'failed').sort(latest);
	return [...steps.filter((step) => step.outcome === 'running'), ...failed.slice(0, failures)];
}

/** Every run's event each node's snapshot holds. */
export function fromLive(nodes: Readonly<Record<string, Held>>): Step[] {
	return Object.entries(nodes).flatMap(([node, held]) =>
		held.snapshot.events.flatMap((event) => {
			const { kind, run } = event.source;
			if (kind !== 'run' || run === undefined) return [];
			const { app, outcome, stage, detail, started_at, finished_at, id } = event;
			return [{ run, node, app, outcome, stage, detail, started_at, finished_at, id }];
		}),
	);
}

export interface Now {
	/** Runs with a step still going, newest first, each step by app then node. */
	running: { run: number; steps: Step[] }[];
	/** The most recent failed steps, newest first. */
	failed: Step[];
}

/** Newest first, by when it finished or else when it started. */
function latest(a: Step, b: Step): number {
	return Date.parse(b.finished_at ?? b.started_at) - Date.parse(a.finished_at ?? a.started_at);
}

/** `seed` overtaken by `live` wherever both hold a step: a snapshot's event is the newer. */
export function current(seed: Step[], live: Step[], failures = 5): Now {
	const held = new Map<string, Step>();
	const key = (step: Step) => `${step.run}/${step.node}/${step.app}`;
	for (const step of seed) held.set(key(step), step);
	for (const step of live) {
		const kept = held.get(key(step));
		if (!kept || kept.id === undefined || (step.id ?? 0) > kept.id) held.set(key(step), step);
	}
	const steps = [...held.values()];
	const runs = new Map<number, Step[]>();
	for (const step of steps.filter((one) => one.outcome === 'running')) {
		runs.set(step.run, [...(runs.get(step.run) ?? []), step]);
	}
	const running = [...runs]
		.map(([run, of]) => ({
			run,
			steps: of.sort((a, b) => a.app.localeCompare(b.app) || a.node.localeCompare(b.node)),
		}))
		.sort((a, b) => first(b.steps) - first(a.steps) || b.run - a.run);
	const failed = steps.filter((one) => one.outcome === 'failed').sort(latest);
	return { running, failed: failed.slice(0, failures) };
}

const first = (steps: Step[]) => Math.min(...steps.map((step) => Date.parse(step.started_at)));
