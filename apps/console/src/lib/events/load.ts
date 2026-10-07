/**
 * What the events page loads. The host filters nothing and pages by event id alone, so a page is
 * loaded from every node, the most each serves, and the filters run here over what came back.
 * See spec/architecture/console.md.
 */
import { ALL, type Cursor, type FleetEvent, fan } from '#lib/server/fleet.ts';
import { events as read } from '#lib/server/reads.ts';
import type { Edge, Failure } from '#lib/server/read.ts';
import { days, hours } from './counts.ts';
import { choices, matches, pageOf, parseQuery, type Query } from './query.ts';

/** The most one node answers in a page; host's own limit. */
export const PER_NODE = 500;

interface Pool {
	events: FleetEvent[];
	failures: Record<string, Failure>;
	/** Nodes whose answer was full, so older events may remain. */
	full: string[];
}

/** Which events a page counts at all: the scope's own, as the route says. */
type Keep = (event: FleetEvent) => boolean;

async function pool(edge: Edge, before: Cursor, keep: Keep): Promise<Pool> {
	const fleet = await fan((name) => {
		const at = before[name];
		return read(
			edge,
			name,
			at === undefined ? { limit: PER_NODE } : { limit: PER_NODE, before: at },
		);
	});
	const out: Pool = { events: [], failures: {}, full: [] };
	for (const name of ALL) {
		const answer = fleet[name];
		if (!answer.ok) out.failures[name] = answer.failure;
		else {
			const events = answer.data.map((event) => ({ ...event, node: name }));
			out.events.push(...events.filter(keep));
			if (answer.data.length >= PER_NODE) out.full.push(name);
		}
	}
	return out;
}

/** The query at once, and what the nodes answered streamed; see spec/architecture/console.md. */
export function load(
	edge: Edge,
	params: URLSearchParams,
	zone: string,
	keep: Keep = () => true,
	now = Date.now(),
) {
	const query: Query = parseQuery(params, ALL);
	return { query, nodes: ALL, now, read: gather(edge, query, zone, now, keep) };
}

async function gather(edge: Edge, query: Query, zone: string, now: number, keep: Keep) {
	const paged = Object.keys(query.before).length > 0;
	// Both at once: the charts count the newest, the log shows the page asked for.
	const [newest, older] = await Promise.all([
		pool(edge, {}, keep),
		paged ? pool(edge, query.before, keep) : undefined,
	]);
	const shown = older ?? newest;
	const page = pageOf(shown.events, query, ALL);
	const charted = newest.events.filter((event) => matches(event, query));
	return {
		events: page.events,
		next: page.next,
		more: page.more || shown.full.length > 0,
		failures: { ...newest.failures, ...shown.failures },
		options: {
			app: choices(newest.events, 'app', query.app),
			action: choices(newest.events, 'action', query.action),
			outcome: choices(newest.events, 'outcome', query.outcome),
			stage: choices(newest.events, 'stage', query.stage),
		},
		charts: {
			hours: hours(charted, ALL, now),
			days: days(charted, now, zone),
			covered: charted.length,
			loaded: newest.events.length,
			full: newest.full,
		},
	};
}
