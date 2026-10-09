/**
 * The overview's day as marks on a line a node: each step that did something in the last
 * `span`, from where it started to where it finished, or to now while it goes, as shares of the
 * span. A skip is a run that had nothing for a node, and draws nothing. See
 * spec/console/overview.md, "The week is a line a node".
 */
import type { Step } from './moving.ts';

export const DAY = 86_400_000;
export const WEEK = 7 * DAY;

export interface Mark {
	key: string;
	node: string;
	app: string;
	run?: number;
	outcome: 'running' | 'failed' | 'succeeded';
	/** Where it starts on the line, 0 the span's start and 1 now. */
	from: number;
	/** Where it ends: where it finished, or now while it goes. */
	to: number;
	started_at: string;
	finished_at?: string;
	detail?: string;
}

const share = (at: number, start: number, span: number) =>
	Math.min(1, Math.max(0, (at - start) / span));

/** `steps` as marks of the `span` ending at `now`, oldest first so the newest is drawn on top. */
export function marks(steps: readonly Step[], now: number, span = DAY): Mark[] {
	const start = now - span;
	return steps
		.filter((step) => step.outcome !== 'skipped')
		.flatMap((step): Mark[] => {
			const began = Date.parse(step.started_at);
			const ended =
				step.outcome === 'running' ? now : Date.parse(step.finished_at ?? step.started_at);
			if (Number.isNaN(began) || ended < start || began > now) return [];
			const outcome =
				step.outcome === 'running' || step.outcome === 'failed' ? step.outcome : 'succeeded';
			return [
				{
					key: `${step.run ?? step.source} ${step.node} ${step.app} ${step.started_at}`,
					node: step.node,
					app: step.app,
					...(step.run === undefined ? {} : { run: step.run }),
					outcome,
					from: share(began, start, span),
					to: share(ended, start, span),
					started_at: step.started_at,
					...(step.finished_at ? { finished_at: step.finished_at } : {}),
					...(step.detail ? { detail: step.detail } : {}),
				},
			];
		})
		.toSorted((a, b) => a.from - b.from);
}
