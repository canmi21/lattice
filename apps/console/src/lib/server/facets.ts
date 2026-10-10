/**
 * The facets: each the least a component draws, cut on the server from the whole reads in
 * ./sources.ts, so the page carries that and nothing more. A page's load takes a facet for the
 * first paint; the browser asks the same facet under `/api/` for whatever comes after, at the
 * address the build works out from its type. Nobody writes a route. See
 * spec/architecture/console.md, "A component asks for its facet".
 */
import { AXES, type Axis, DIMENSIONS, type Dimension, asked } from '../overview/history.ts';
import { type Dry, dried } from '../overview/judge.ts';
import {
	type Step,
	type Trace,
	fromHistory,
	fromLive,
	merged,
	traced,
} from '../overview/moving.ts';
import { DAY, SPANS, type Span } from '../overview/timeline.ts';
import { VIEWS, type View, shows } from '../scope/scope.ts';
import { offsetIn } from '../ui/time-zone.ts';
import type { Zone } from '../chart/series.ts';
import type { Cluster, Entry, History } from '../wire.ts';
import type { Read } from './read.ts';
import type { Sources } from './sources.ts';

/** What every facet is cut with: the request's reads, the reader's zone, and the moment. */
export interface Context {
	sources: Sources;
	zone: Zone;
	now: number;
}

export interface Facet<P, R> {
	/** Raised where what it answers means something new and its type says nothing of it. */
	revision: number;
	/** Its parameters from an address's query; undefined where the query is not one it takes. */
	params: (query: Readonly<Record<string, string>>) => P | undefined;
	read: (context: Context, params: P) => Promise<R>;
}

const facet = <P extends Record<string, string>, R>(one: Facet<P, R>): Facet<P, R> => one;

/** `value` where it is one of `keys`. */
function oneOf<K extends string>(keys: readonly { key: K }[], value: string | undefined) {
	return keys.find((one) => one.key === value)?.key;
}

const spanOf = (query: Readonly<Record<string, string>>) => oneOf(SPANS, query.span);
const viewOf = (query: Readonly<Record<string, string>>) => oneOf(VIEWS, query.view);

/** Every node's minutes over `span`, asked at its finest slot. */
async function minutes(context: Context, span: Span): Promise<History | undefined> {
	const ask = asked(span);
	const read = await context.sources.history(ask.span, ask.slot);
	return read.ok ? read.data : undefined;
}

/** The view's steps since `since`, and every one still running. */
async function stepsSince(context: Context, view: View, since: number): Promise<Step[]> {
	const { runs, apart } = await context.sources.runs(view);
	return fromHistory(runs, apart, 0, 0, since);
}

/** How far back a span's runs are read: the span, or the mirror's 30 days past it. */
const reachOf = (span: Span) =>
	Math.min(SPANS.find((one) => one.key === span)?.span ?? 0, 30 * DAY);

/**
 * A node as the first paint needs it: its snapshot without the events that are not running, which
 * the socket brings whole once it opens. Marked partial, so the socket's equal version replaces it.
 */
function lean(entry: Entry): Entry {
	if (!entry.snapshot) return entry;
	const events = entry.snapshot.events.filter((event) => event.outcome === 'running');
	return { ...entry, partial: true as const, snapshot: { ...entry.snapshot, events } };
}

export const FACETS = {
	/** Every node's minutes over a span, which the timeline's hover and its next minutes read. */
	history: facet({
		revision: 1,
		params: (query) => {
			const span = spanOf(query);
			return span && { span };
		},
		read: (context, { span }) => minutes(context, span),
	}),

	/** The view's deploy steps over a span, which the timeline's runs and hover read. */
	steps: facet({
		revision: 1,
		params: (query) => {
			const span = spanOf(query);
			const view = viewOf(query);
			return span && view && { span, view };
		},
		read: async (context, { span, view }): Promise<Trace[]> => {
			const steps = await stepsSince(context, view, context.now - reachOf(span));
			// A skip draws nothing; see spec/console/overview.md.
			return steps.filter((step) => step.outcome !== 'skipped').map(traced);
		},
	}),

	/** What is running, and what failed in the last day: the page's verdict. */
	now: facet({
		revision: 1,
		params: (query) => {
			const view = viewOf(query);
			return view && { view };
		},
		read: async (context, { view }) => {
			const steps = await stepsSince(context, view, context.now - DAY);
			return steps.filter((step) => step.outcome === 'running' || step.outcome === 'failed');
		},
	}),

	/** Every node, lean: what the shell, the map and the place list draw. */
	nodes: facet({
		revision: 1,
		params: () => ({}),
		read: async (context): Promise<Read<Cluster>> => {
			const read = await context.sources.cluster();
			if (!read.ok) return read;
			const nodes = Object.fromEntries(
				Object.entries(read.data.nodes).map(([code, entry]) => [code, lean(entry)]),
			);
			return { ...read, data: { ...read.data, nodes } };
		},
	}),

	/** The timeline's first paint: its lines and each slot's color, for every count. */
	timeline: facet({
		revision: 1,
		params: (query) => {
			const span = spanOf(query);
			const view = viewOf(query);
			const dimension = oneOf(DIMENSIONS, query.dimension) as Dimension | undefined;
			const by = oneOf(AXES, query.by) as Axis | undefined;
			return span && view && dimension && by && { span, view, dimension, by };
		},
		read: async (context, { span, view, dimension, by }): Promise<Dry> => {
			const [history, steps, cluster] = await Promise.all([
				minutes(context, span),
				stepsSince(context, view, context.now - reachOf(span)),
				context.sources.cluster(),
			]);
			const nodes = cluster.ok ? cluster.data.nodes : {};
			return dried(
				{
					steps: merged<Trace>(steps.map(traced), fromLive(nodes)),
					history,
					nodes,
					keep: (app) => shows(view, app),
					withNodes: view === 'all' || view === 'infra',
					by,
					back: span,
					now: context.now,
					offset: (at) => offsetIn(context.zone, at),
				},
				dimension,
			);
		},
	}),
};

export type Facets = typeof FACETS;
export type FacetName = keyof Facets;
export type ParamsOf<N extends FacetName> = Parameters<Facets[N]['read']>[1];
export type AnswerOf<N extends FacetName> = Awaited<ReturnType<Facets[N]['read']>>;
