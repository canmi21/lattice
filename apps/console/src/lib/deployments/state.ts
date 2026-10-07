/**
 * Where a run is, per node and per app on a node, as the Deployments pages draw it. Pure, over
 * what `runs()` grouped on the server. See infra's spec/architecture/host.md, "Every event is
 * kept, and none is pruned", for the stages and outcomes.
 */
import type { Node } from '../server/nodes.ts';
import type { Placement, Run } from '../server/runs.ts';
import type { Tone } from '../style.ts';

/** host's stages of a deploy, in the order a deploy passes them. */
export const STAGES = ['downloading', 'admitting', 'loading', 'starting'] as const;

/** An outcome host wrote; `absent` where a node placed none, `unknown` where it did not answer. */
export type Mark = 'running' | 'succeeded' | 'failed' | 'skipped' | 'absent' | 'unknown';

export type RunState = 'running' | 'failed' | 'succeeded' | 'skipped';

/** How far through the four stages `stage` is, 1 to 4; 0 for none, or a word host added since. */
export function depth(stage: string | undefined): number {
	return STAGES.indexOf(stage as (typeof STAGES)[number]) + 1;
}

/** An outcome as a mark; one host added after this console was written is `unknown`. */
export function markOf(outcome: string): Mark {
	return outcome === 'running' ||
		outcome === 'succeeded' ||
		outcome === 'failed' ||
		outcome === 'skipped'
		? outcome
		: 'unknown';
}

/** Running while anything runs; else failed where anything failed; else whether anything ran. */
export function runState(run: Run): RunState {
	if (run.running > 0) return 'running';
	if (run.failed > 0) return 'failed';
	return run.succeeded > 0 ? 'succeeded' : 'skipped';
}

const ORDER: Mark[] = ['running', 'failed', 'succeeded', 'unknown', 'skipped'];

export interface NodeMark {
	node: Node;
	mark: Mark;
	/** The stage of the least advanced app still running, or where the first failure was. */
	stage?: string;
	placements: number;
}

/**
 * Where one node is with a run, over every app it placed: running before failed before succeeded
 * before skipped. A node that placed nothing is `absent`, or `unknown` when it did not answer.
 */
export function nodeMark(run: Run, node: Node, unknown: ReadonlySet<Node>): NodeMark {
	const own = run.placements.filter((one) => one.node === node);
	if (own.length === 0) {
		return { node, mark: unknown.has(node) ? 'unknown' : 'absent', placements: 0 };
	}
	const mark = ORDER.find((each) => own.some((one) => markOf(one.outcome) === each)) ?? 'unknown';
	const at = own
		.filter((one) => markOf(one.outcome) === mark && one.stage !== undefined)
		.toSorted((a, b) => depth(a.stage) - depth(b.stage))[0];
	return { node, mark, stage: at?.stage, placements: own.length };
}

export interface Cell {
	app: string;
	node: Node;
	mark: Mark;
	placement?: Placement;
}

/** Every app of the run against every node, in `nodes`' order. */
export function matrix(run: Run, nodes: Node[], unknown: ReadonlySet<Node>): Cell[][] {
	return run.apps.map((app) =>
		nodes.map((node) => {
			const placement = run.placements.find((one) => one.app === app && one.node === node);
			if (placement) return { app, node, mark: markOf(placement.outcome), placement };
			return { app, node, mark: unknown.has(node) ? 'unknown' : 'absent' };
		}),
	);
}

const capitalized = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);

/** A mark as a word: a running deploy by its stage, a failure by where it happened. */
export function said(mark: Mark, stage?: string): string {
	switch (mark) {
		case 'running':
			return capitalized(stage ?? 'running');
		case 'failed':
			return stage ? `Failed ${stage}` : 'Failed';
		case 'absent':
			return 'Not placed';
		default:
			return capitalized(mark);
	}
}

export const TONE: Record<Mark, Tone> = {
	running: 'busy',
	succeeded: 'good',
	failed: 'bad',
	skipped: 'quiet',
	absent: 'quiet',
	unknown: 'warn',
};
