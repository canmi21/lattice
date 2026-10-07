/**
 * The events page's state as its URL carries it: the filters, the page size and the cursor, parsed
 * with anything unknown dropped, written back with defaults left out, and applied to events. Pure,
 * so a linked view and a reloaded one are the same and every step is tested apart from the page.
 */
import type { Cursor, FleetEvent } from '#lib/server/fleet.ts';

export const SIZES = [25, 50, 100, 200] as const;
export const DEFAULT_SIZE = 50;

/** The filters; an empty string leaves that field alone. */
export interface Filters {
	node: string;
	app: string;
	action: string;
	outcome: string;
	stage: string;
	/** Searches the detail, case aside. */
	q: string;
}

export interface Query extends Filters {
	size: number;
	before: Cursor;
}

const FILTERS = ['node', 'app', 'action', 'outcome', 'stage', 'q'] as const;

/** `tyo:120,gvx:98` as a cursor over `nodes`; a node it does not know or a bad id is dropped. */
export function parseCursor(text: string | null, nodes: readonly string[]): Cursor {
	const cursor: Record<string, number> = {};
	for (const part of (text ?? '').split(',')) {
		const [name, id] = part.split(':');
		const at = Number(id);
		if (name && nodes.includes(name) && Number.isInteger(at) && at > 0) cursor[name] = at;
	}
	return cursor;
}

export function writeCursor(cursor: Cursor): string {
	return Object.entries(cursor)
		.map(([name, id]) => `${name}:${id}`)
		.join(',');
}

export function parseQuery(params: URLSearchParams, nodes: readonly string[]): Query {
	const filters = Object.fromEntries(
		FILTERS.map((key) => [key, (params.get(key) ?? '').trim()]),
	) as unknown as Filters;
	if (!nodes.includes(filters.node)) filters.node = '';
	const size = Number(params.get('size'));
	return {
		...filters,
		size: (SIZES as readonly number[]).includes(size) ? size : DEFAULT_SIZE,
		before: parseCursor(params.get('before'), nodes),
	};
}

/** The query string for `query`, with `before` as given, and nothing that is a default. */
export function search(query: Query, before: Cursor = query.before): string {
	const params = new URLSearchParams();
	for (const key of FILTERS) if (query[key]) params.set(key, query[key]);
	if (query.size !== DEFAULT_SIZE) params.set('size', String(query.size));
	const cursor = writeCursor(before);
	if (cursor) params.set('before', cursor);
	const text = params.toString();
	return text && `?${text}`;
}

export function matches(event: FleetEvent, query: Filters): boolean {
	if (query.node && event.node !== query.node) return false;
	if (query.app && event.app !== query.app) return false;
	if (query.action && event.action !== query.action) return false;
	if (query.outcome && event.outcome !== query.outcome) return false;
	if (query.stage && event.stage !== query.stage) return false;
	const wanted = query.q.toLowerCase();
	return !wanted || (event.detail ?? '').toLowerCase().includes(wanted);
}

/** Newest first by start; the node's order and then the id keep it stable, as the host's merge. */
export function newest(nodes: readonly string[]) {
	return (a: FleetEvent, b: FleetEvent): number =>
		Date.parse(b.started_at) - Date.parse(a.started_at) ||
		nodes.indexOf(a.node) - nodes.indexOf(b.node) ||
		b.id - a.id;
}

export interface Shown {
	events: FleetEvent[];
	/** Where the page after this one starts. */
	next: Cursor;
	/** Whether the filtered events held run past this page. */
	more: boolean;
}

/** The first `query.size` events of `pool` the filters let through, and the cursor after them. */
export function pageOf(pool: FleetEvent[], query: Query, nodes: readonly string[]): Shown {
	const kept = pool.filter((event) => matches(event, query)).sort(newest(nodes));
	const events = kept.slice(0, query.size);
	const next: Cursor = { ...query.before };
	for (const event of events) next[event.node] = Math.min(next[event.node] ?? event.id, event.id);
	return { events, next, more: kept.length > events.length };
}

/** The distinct values of a field in `events`, plus the one selected, sorted. */
export function choices(
	events: FleetEvent[],
	field: 'app' | 'action' | 'outcome' | 'stage',
	selected: string,
): string[] {
	const seen = new Set(events.map((event) => event[field]).filter((value) => value !== undefined));
	if (selected) seen.add(selected);
	return [...seen].sort();
}
