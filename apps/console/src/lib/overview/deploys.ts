/**
 * The runs as the Overview counts them: per day in the reader's zone, per node by outcome, the
 * headline figures, and the moments drawn down the fleet's charts. Shaped on the server from
 * src/lib/server/runs.ts.
 */
import { tickLabel, UTC } from '../chart/series.ts';
import { aggregates, type Run } from '../server/runs.ts';

const DAY = 86_400_000;
const keys = new Map<string, Intl.DateTimeFormat>();

/** The day `at`, in milliseconds, falls on in `zone`, as `YYYY-MM-DD`. */
export function dayKey(at: number, zone: string): string {
	let writer = keys.get(zone);
	if (!writer) {
		const shape = { year: 'numeric', month: '2-digit', day: '2-digit' } as const;
		writer = new Intl.DateTimeFormat('en-US', { ...shape, timeZone: zone });
		keys.set(zone, writer);
	}
	const part = Object.fromEntries(writer.formatToParts(at).map((one) => [one.type, one.value]));
	return `${part.year}-${part.month}-${part.day}`;
}

export interface Daily {
	/** `Oct 6`, oldest first, ending today. */
	labels: string[];
	runs: number[];
}

/** Runs started on each of the last `days` days in `zone`, today last, an empty day as zero. */
export function daily(of: Run[], now: number, zone: string, days = 30): Daily {
	const today = Date.parse(`${dayKey(now, zone)}T00:00:00Z`);
	const label = tickLabel(DAY, UTC);
	const span = Array.from({ length: days }, (_, back) => today - (days - 1 - back) * DAY);
	const index = new Map(span.map((at, place) => [new Date(at).toISOString().slice(0, 10), place]));
	const runs = span.map(() => 0);
	for (const run of of) {
		const at = index.get(dayKey(Date.parse(run.first_start), zone));
		if (at !== undefined) runs[at] = (runs[at] ?? 0) + 1;
	}
	return { labels: span.map((at) => label(new Date(at))), runs };
}

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
		durations: durations.slice(0, 12).reverse(),
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
