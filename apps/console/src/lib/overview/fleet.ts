/**
 * The fleet's series as the Overview draws them, shaped on the server: a line per node in node
 * order, each node in its own series color on every chart, and a node that did not answer left
 * out of the lines and named instead, each by its city and code. See spec/architecture/console.md.
 */
import { metric, type Line } from '../chart/series.ts';
import type { Point } from '../host.ts';
import { nodeLabel } from '../map/places.ts';
import type { Fleet } from '../server/fleet.ts';

/** A node's color, by its place in the fixed node order: it follows the node, never its rank. */
export const nodeColor = (index: number): string => `var(--color-series-${index + 1})`;

/** A node that did not answer, and what it said. */
export interface Missing {
	node: string;
	message: string;
}

export function missing(fleet: Fleet<unknown>): Missing[] {
	return Object.entries(fleet).flatMap(([node, read]) =>
		read.ok ? [] : [{ node, message: read.failure.message }],
	);
}

/** One metric as a line per node that answered, in node order. */
export function perNode(fleet: Fleet<Point[]>, name: string): Line[] {
	return Object.entries(fleet).flatMap(([node, read], index) =>
		read.ok
			? [
					{
						key: node,
						label: nodeLabel(node, 'lead'),
						color: nodeColor(index),
						points: metric(read.data, name),
					},
				]
			: [],
	);
}

export interface Heat {
	rows: { key: string; label: string }[];
	/** Each bucket's start, in seconds, oldest first. */
	times: number[];
	/** A row per node, NaN where it read nothing: a node that did not answer is a row of gaps. */
	values: number[][];
}

/** One metric per node per bucket of `step` seconds, from `since` to `until`. */
export function heat(
	fleet: Fleet<Point[]>,
	name: string,
	{ since, until, step }: { since: number; until: number; step: number },
): Heat {
	const times: number[] = [];
	for (let at = Math.floor(since / step) * step; at < until; at += step) times.push(at);
	const entries = Object.entries(fleet);
	return {
		rows: entries.map(([node]) => ({ key: node, label: nodeLabel(node, 'lead') })),
		times,
		values: entries.map(([, read]) => {
			const found = new Map(read.ok ? metric(read.data, name).map((p) => [p.at, p.value]) : []);
			return times.map((at) => found.get(at) ?? Number.NaN);
		}),
	};
}
