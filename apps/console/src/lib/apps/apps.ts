/**
 * An app across the fleet, as the console's two app pages read it: where it runs, whether every
 * node runs the same image, its history merged across nodes, and its series one line per node.
 * Pure and tested apart from the markup; node order is passed in, as the browser runs this too.
 * See spec/architecture/console.md.
 */
import type { Point } from '../host.ts';
import { type Datum, type Line, metric } from '../chart/series.ts';
import type { Node } from '../server/nodes.ts';
import type { Read } from '../server/read.ts';
import type { App, Cluster, Event } from '../wire.ts';

export type State = 'running' | 'held' | 'stopped';

/** A node running an app, and what it runs there. */
export interface Placement {
	node: Node;
	app: App;
	state: State;
}

export interface AppRow {
	name: string;
	placements: Placement[];
	/** Each distinct image the nodes run, in node order. */
	images: string[];
	/** The nodes do not all run one image. */
	drift: boolean;
	/** The newest deploy time among its nodes. */
	deployed: string;
	running: number;
}

/** Every node, in the order a chart's colors follow. */
export type Order = readonly Node[];

export const stateOf = (app: Pick<App, 'held' | 'running'>): State =>
	app.held ? 'held' : app.running ? 'running' : 'stopped';

/** Whether `images` holds more than one distinct image. */
export const drifts = (images: string[]): boolean => new Set(images).size > 1;

/** Where `name` runs, in node order. */
export function placements(order: Order, cluster: Cluster, name: string): Placement[] {
	return order.flatMap((node) =>
		(cluster.nodes[node]?.snapshot.apps ?? [])
			.filter((app) => app.name === name)
			.map((app) => ({ node, app, state: stateOf(app) })),
	);
}

/** Every app the cluster holds, once, by name. */
export function rowsOf(order: Order, cluster: Cluster): AppRow[] {
	const names = new Set(
		order.flatMap((node) => cluster.nodes[node]?.snapshot.apps.map((app) => app.name) ?? []),
	);
	return [...names].sort((a, b) => a.localeCompare(b)).map((name) => rowOf(order, cluster, name));
}

function rowOf(order: Order, cluster: Cluster, name: string): AppRow {
	const held = placements(order, cluster, name);
	const images = [...new Set(held.map(({ app }) => app.image))];
	const times = held.map(({ app }) => app.deployed_at);
	return {
		name,
		placements: held,
		images,
		drift: drifts(images),
		deployed: times.reduce((a, b) => (Date.parse(b) > Date.parse(a) ? b : a), times[0] ?? ''),
		running: held.filter(({ state }) => state === 'running').length,
	};
}

/** An event with the node it happened on. */
export type NodeEvent = Event & { node: Node };

/** Newest first by start; the node's order and then the id keep it stable. */
function newer(order: Order, a: NodeEvent, b: NodeEvent): number {
	return (
		Date.parse(b.started_at) - Date.parse(a.started_at) ||
		order.indexOf(a.node) - order.indexOf(b.node) ||
		b.id - a.id
	);
}

/** Each node's history as one list, newest first, and the nodes that did not answer. */
export function merge(
	order: Order,
	reads: Partial<Record<Node, Read<Event[]>>>,
): {
	events: NodeEvent[];
	unknown: Node[];
} {
	const events: NodeEvent[] = [];
	const unknown: Node[] = [];
	for (const node of order) {
		const read = reads[node];
		if (!read) continue;
		if (read.ok) events.push(...read.data.map((event) => ({ ...event, node })));
		else unknown.push(node);
	}
	return { events: events.sort((a, b) => newer(order, a, b)), unknown };
}

/** A node's color, the same on every chart: its place in node order, never its rank. */
export const colorOf = (order: Order, node: Node): string =>
	`var(--color-series-${order.indexOf(node) + 1})`;

/** `name` of each node's series as one line a node, those that answered; the rest are unknown. */
export function lines(
	order: Order,
	reads: Partial<Record<Node, Read<Point[]>>>,
	name: string,
): { lines: Line[]; unknown: Node[] } {
	const made: Line[] = [];
	const unknown: Node[] = [];
	for (const node of order) {
		const read = reads[node];
		if (!read) continue;
		if (read.ok) {
			made.push({
				key: node,
				label: node,
				color: colorOf(order, node),
				points: metric(read.data, name),
			});
		} else unknown.push(node);
	}
	return { lines: made, unknown };
}

/** Each line's last value, by node; none for a line with no point. */
export function latest(of: Line[]): Partial<Record<Node, number>> {
	const now: Partial<Record<Node, number>> = {};
	for (const line of of) {
		const last = line.points.findLast((point) => !Number.isNaN(point.value));
		if (last) now[line.key as Node] = last.value;
	}
	return now;
}

/** The lines added together moment by moment, for a figure across every node. */
export function total(of: Line[]): Datum[] {
	const sums = new Map<number, number>();
	for (const line of of) {
		for (const point of line.points) sums.set(point.at, (sums.get(point.at) ?? 0) + point.value);
	}
	return [...sums].sort(([a], [b]) => a - b).map(([at, value]) => ({ at, value }));
}
