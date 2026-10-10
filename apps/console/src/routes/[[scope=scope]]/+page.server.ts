import { figures } from '#lib/overview/deploys.js';
import { AXES, DIMENSIONS } from '#lib/overview/history.js';
import { SPANS } from '#lib/overview/timeline.js';
import { viewOf } from '#lib/scope/scope.js';
import { FACETS } from '#lib/server/facets.js';
import { edgeOf, facetContext } from '#lib/server/platform.js';
import { primaryOf } from '#lib/server/primary.js';
import { preferred } from '#lib/ui/preference.js';
import type { PageServerLoad } from './$types';

const DAYS = 30;

/**
 * The page's facets held for the document's own response, so the server draws the page whole, and
 * streamed on a move, each part filling as its read lands. What the timeline's hover reads beside
 * its colors is asked by the browser after, not carried here. See spec/architecture/console.md,
 * "The console's server never waits on data; it only draws", and "A component asks for its facet".
 * The map is All's and Infra's, as the nodes are. See spec/console/overview.md.
 */
export const load: PageServerLoad = async (event) => {
	const context = facetContext(event);
	const view = viewOf(event.params.scope);
	const nodes = view === 'all' || view === 'infra';
	const runs = context.sources.runs(view);
	const deploys = runs.then(({ runs: all, failures }) => ({
		seen: all.length,
		figures: figures(all, context.now, context.now - DAYS * 86_400_000),
		missing: Object.entries(failures).map(([node, failure]) => ({
			node,
			message: failure.message,
		})),
	}));
	const back = preferred(
		event.cookies,
		'span',
		SPANS.map((one) => one.key),
		'7d',
	);
	const dimension = preferred(
		event.cookies,
		'dimension',
		DIMENSIONS.map((one) => one.key),
		'overview',
	);
	const by = preferred(
		event.cookies,
		'by',
		AXES.map((one) => one.key),
		'node',
	);
	const cluster = FACETS.nodes.read(context, {});
	const now = FACETS.now.read(context, { view });
	const dry = FACETS.timeline.read(context, { span: back, view, dimension, by });
	const first = !event.isDataRequest;
	return {
		view,
		nodes,
		// The reader's own span and map view, so the first response is drawn as they left it.
		back,
		dimension,
		by,
		shape: preferred(event.cookies, 'map', ['flat', 'globe'] as const, 'flat'),
		cluster: first ? await cluster : cluster,
		deploys: first ? await deploys : deploys,
		now: first ? await now : now,
		dry: first ? await dry : dry,
		// Where each place's latency is to; see spec/console/overview.md.
		primary: nodes ? primaryOf(edgeOf(event)) : Promise.resolve(undefined),
	};
};
