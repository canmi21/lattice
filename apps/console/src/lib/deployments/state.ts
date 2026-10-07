/**
 * Where a run is, per node and per app on a node, as the Deployments pages draw it. Pure, over
 * what `runs()` grouped on the server. See infra's spec/architecture/host.md, "Every event is
 * kept, and none is pruned", for the stages and outcomes.
 */
import type { Node } from '../server/nodes.ts';
import type { Placement, Run } from '../server/runs.ts';
import type { Tone } from '../style.ts';

/**
 * host's stages of a deploy, in the order a deploy passes them. Every deploy passes the first four;
 * one rolled out beside its predecessor goes on to the last three and, succeeding, ends at
 * `draining`. See infra's spec/architecture/host.md, "An app chooses how it is rolled out".
 */
export const STAGES = [
	'downloading',
	'admitting',
	'loading',
	'starting',
	'checking',
	'switching',
	'draining',
] as const;

/** An outcome host wrote; `absent` where a node placed none, `unknown` where it did not answer. */
export type Mark = 'running' | 'succeeded' | 'failed' | 'skipped' | 'absent' | 'unknown';

export type RunState = 'running' | 'failed' | 'succeeded' | 'skipped';

/** How far through the stages `stage` is, from 1; 0 for none, or a word host added since. */
export function depth(stage: string | undefined): number {
	return STAGES.indexOf(stage as (typeof STAGES)[number]) + 1;
}

/**
 * How much of a running deploy is behind it, 0 to 1, over every stage there is: a deploy's rollout
 * is not on its events, so one that will end at `starting` cannot be told from one going on.
 */
export const share = (stage: string | undefined): number => depth(stage) / STAGES.length;

/** How an operator command a skip carries begins: infra's spec/architecture/host.md, "manual". */
const BY_HAND = 'mise run node deploy ';

/**
 * The command a skip left for the operator, where an app rolled out by hand was skipped by a run;
 * none for any other event.
 */
export function handCommand(outcome: string, detail: string | undefined): string | undefined {
	return outcome === 'skipped' && detail?.startsWith(BY_HAND) ? detail : undefined;
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

/**
 * A mark as a word: a running deploy by its stage, a failure by where it happened, and a skip left
 * for the operator, its `detail` the command, as waiting for them.
 */
export function said(mark: Mark, stage?: string, detail?: string): string {
	switch (mark) {
		case 'skipped':
			return handCommand(mark, detail) ? 'By hand' : 'Skipped';
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
