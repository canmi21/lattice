/**
 * Every node asked at once: one request per node, in parallel, each answer or failure kept under
 * its node, so one node down never fails a page. See spec/architecture/console.md.
 */
import type { Now, Page, Point } from '../host.ts';
import type { Event } from '../wire.ts';
import { NODES, type Node } from './nodes.ts';
import type { Edge, Failure, Read } from './read.ts';
import { type Series, events, nodeNow, nodeSeries } from './reads.ts';

export type Fleet<T> = Record<Node, Read<T>>;

/** An event with the node it happened on. */
export type FleetEvent = Event & { node: Node };

export const ALL = Object.keys(NODES) as Node[];

/** `ask` of every node at once. */
export async function fan<T>(ask: (name: Node) => Promise<Read<T>>): Promise<Fleet<T>> {
	const reads = await Promise.all(ALL.map((name) => ask(name)));
	return Object.fromEntries(ALL.map((name, at) => [name, reads[at]])) as Fleet<T>;
}

export const fleetNow = (edge: Edge): Promise<Fleet<Now>> => fan((n) => nodeNow(edge, n));

export const fleetSeries = (edge: Edge, series: Series): Promise<Fleet<Point[]>> =>
	fan((n) => nodeSeries(edge, n, series));

/** Where each node's next page starts: the lowest event id of it already shown. */
export type Cursor = Partial<Record<Node, number>>;

export interface Merged {
	events: FleetEvent[];
	/** Pass it back as `before` for the page after this one. */
	next: Cursor;
	failures: Partial<Record<Node, Failure>>;
}

/** Newest first by start; the node's order and then the id keep it stable. */
function newer(a: FleetEvent, b: FleetEvent): number {
	return (
		Date.parse(b.started_at) - Date.parse(a.started_at) ||
		ALL.indexOf(a.node) - ALL.indexOf(b.node) ||
		b.id - a.id
	);
}

/**
 * The newest `limit` events across every node. Event ids are each node's own, so `before` is a
 * cursor per node, which `next` hands back; a node's page asks for `limit` itself, the most any
 * of its events can add to the merged page.
 */
export async function fleetEvents(
	edge: Edge,
	{ limit, before = {} }: { limit: number; before?: Cursor },
): Promise<Merged> {
	const fleet = await fan((n) => events(edge, n, pageOf(limit, before[n])));
	const all: FleetEvent[] = [];
	const failures: Merged['failures'] = {};
	for (const name of ALL) {
		const read = fleet[name];
		if (read.ok) all.push(...read.data.map((event) => ({ ...event, node: name })));
		else failures[name] = read.failure;
	}
	const shown = all.sort(newer).slice(0, limit);
	const next: Cursor = { ...before };
	for (const event of shown) {
		next[event.node] = Math.min(next[event.node] ?? event.id, event.id);
	}
	return { events: shown, next, failures };
}

function pageOf(limit: number, before: number | undefined): Page {
	return before === undefined ? { limit } : { limit, before };
}
