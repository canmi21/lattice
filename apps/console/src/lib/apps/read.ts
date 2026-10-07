/**
 * What `/apps/[app]` asks of the nodes: its series, its history and how host shows it, one request
 * each per node that runs it, all at once, each answer or failure kept under its node so a node
 * that is down is unknown on the page and never fails it. See spec/architecture/console.md.
 */
import type { AppDetail, Checked, Point } from '../host.ts';
import { ALL, type Fleet, fan } from '../server/fleet.ts';
import type { Node } from '../server/nodes.ts';
import type { Edge, Read } from '../server/read.ts';
import { type Span, app as appOf, appHealth, appSeries, history } from '../server/reads.ts';
import type { Cluster, Event } from '../wire.ts';
import { placements } from './apps.ts';

/** The events asked of each node; the table pages over what came back. */
export const HISTORY = 100;

async function each<T>(
	nodes: Node[],
	ask: (node: Node) => Promise<Read<T>>,
): Promise<Partial<Record<Node, Read<T>>>> {
	const reads = await Promise.all(nodes.map(ask));
	return Object.fromEntries(nodes.map((node, at) => [node, reads[at]]));
}

export async function appReads(edge: Edge, nodes: Node[], app: string, span: Span) {
	const [series, events, details] = await Promise.all([
		each<Point[]>(nodes, (node) => appSeries(edge, node, app, span)),
		each<Event[]>(nodes, (node) => history(edge, node, app, { limit: HISTORY })),
		each<AppDetail>(nodes, (node) => appOf(edge, node, app)),
	]);
	return { series, events, details };
}

/**
 * The reads asked of every node beside the cluster rather than after it, so the page waits for
 * the slower of the two and not both; once the cluster lands, the nodes that run `app` are kept,
 * or all of them where it could not be read. `where` is empty when no node runs it.
 */
export async function appReadsBeside(
	edge: Edge,
	held: Promise<Read<Cluster>>,
	app: string,
	span: Span,
) {
	const [cluster, reads] = await Promise.all([held, appReads(edge, ALL, app, span)]);
	const where = cluster.ok ? placements(ALL, cluster.data, app).map((one) => one.node) : ALL;
	const kept = <T>(of: Partial<Record<Node, T>>) =>
		Object.fromEntries(where.map((node) => [node, of[node]])) as Partial<Record<Node, T>>;
	return {
		where,
		series: kept(reads.series),
		events: kept(reads.events),
		details: kept(reads.details),
	};
}

/**
 * Every node's check of `app`'s own health, the ones that do not run it among them, so the browser
 * asking again needs no cluster: the page keeps the nodes it runs on. See ./health.ts.
 */
export const healthReads = (edge: Edge, app: string): Promise<Fleet<Checked>> =>
	fan((node) => appHealth(edge, node, app));
