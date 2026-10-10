/**
 * The runs as the console counts them: per node by outcome, the overview's headline figures, and
 * the moments drawn down the fleet's charts. Shaped on the server from src/lib/server/runs.ts.
 */
import { aggregates, type Run } from '../server/runs.ts';

const DAY = 86_400_000;
export interface Outcomes {
	nodes: string[];
	succeeded: number[];
	failed: number[];
	skipped: number[];
}

/** Each node's placements started since `since`, in milliseconds, by how they ended. */
export function byNode(of: Run[], nodes: readonly string[], since: number): Outcomes {
	const zero = () => nodes.map(() => 0);
	const counts = { succeeded: zero(), failed: zero(), skipped: zero() };
	for (const run of of) {
		for (const placement of run.placements) {
			const at = nodes.indexOf(placement.node);
			const row = Object.hasOwn(counts, placement.outcome)
				? counts[placement.outcome as keyof typeof counts]
				: undefined;
			if (at === -1 || !row || Date.parse(placement.started_at) < since) continue;
			row[at] = (row[at] ?? 0) + 1;
		}
	}
	return { nodes: [...nodes], ...counts };
}

export interface Figures {
	/** Runs started in the last day. */
	day: number;
	/** Of those that finished, the share with no failed placement. */
	rate: number | null;
	/** Milliseconds, over the runs since `since`. */
	median: number | null;
	p95: number | null;
	/** The last dozen finished runs' durations, oldest first. */
	durations: number[];
}

export function figures(of: Run[], now: number, since: number): Figures {
	const after = (from: number) => of.filter((run) => Date.parse(run.first_start) >= from);
	const day = after(now - DAY);
	const window = aggregates(after(since));
	const durations = of.flatMap((run) => (run.duration === undefined ? [] : [run.duration]));
	return {
		day: day.length,
		rate: aggregates(day).success_rate,
		median: window.median,
		p95: window.p95,
		durations: durations.slice(0, 12).toReversed(),
	};
}

/** Each run started in the span, in seconds, as a moment marked down a chart. */
export function marks(of: Run[], since: number, until: number): { at: number; label: string }[] {
	return of.flatMap((run) => {
		const at = Date.parse(run.first_start) / 1000;
		if (at < since || at > until) return [];
		return [{ at, label: run.commit ? run.commit.slice(0, 7) : `Run ${run.run}` }];
	});
}
