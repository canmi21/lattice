/**
 * A run's placements as the Timeline draws them. host records when a deploy started and ended and
 * the last stage it reached, not when each stage began, so a placement is one segment over its
 * whole span, in the color of the stage it reached. Skipped placements took no time and are left
 * to the matrix.
 */
import type { Stage, Track } from '../chart/timeline.svelte';
import type { Key } from '../chart/series.ts';
import { nodeLabel } from '../map/places.ts';
import { displayOf } from '../scope/scope.ts';
import type { Node } from '../server/nodes.ts';
import type { Placement, Run } from '../server/runs.ts';
import { STAGES, markOf, said } from './state.ts';

/** The four stages, each its series color in the fixed order. */
export const STAGE_KEYS: Key[] = STAGES.map((stage, index) => ({
	key: stage,
	label: said('running', stage),
	color: `var(--color-series-${index + 1})`,
}));

/** Up to this many placements are a track each; more are a track per node. */
export const FEW = 12;

const seconds = (stamp: string) => Date.parse(stamp) / 1000;

/** A placement as a segment; a success reached the last stage, a deploy with none the first. */
export function segment(placement: Placement): Stage | undefined {
	const mark = markOf(placement.outcome);
	if (mark === 'skipped') return undefined;
	return {
		stage: placement.stage ?? (mark === 'succeeded' ? 'starting' : 'downloading'),
		start: seconds(placement.started_at),
		end: placement.finished_at ? seconds(placement.finished_at) : undefined,
		failed: mark === 'failed',
	};
}

/** One track per placement while they are few, else one per node; in `nodes`' order. */
export function tracks(run: Run, nodes: Node[]): Track[] {
	const drawn = run.placements
		.flatMap((placement) => {
			const one = segment(placement);
			return one ? [{ placement, one }] : [];
		})
		.toSorted(
			(a, b) =>
				nodes.indexOf(a.placement.node) - nodes.indexOf(b.placement.node) ||
				a.placement.app.localeCompare(b.placement.app),
		);
	if (drawn.length <= FEW) {
		return drawn.map(({ placement, one }) => ({
			key: `${placement.node}/${placement.app}`,
			label: `${nodeLabel(placement.node, 'lead')} · ${displayOf(placement.app)}`,
			stages: [one],
		}));
	}
	return nodes.flatMap((node) => {
		const stages = drawn.filter(({ placement }) => placement.node === node).map(({ one }) => one);
		return stages.length ? [{ key: node, label: nodeLabel(node, 'lead'), stages }] : [];
	});
}
