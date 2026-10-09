import { figures } from '#lib/overview/deploys.js';
import { fromHistory } from '#lib/overview/moving.js';
import { DAY } from '#lib/overview/timeline.js';
import { runsIn } from '#lib/scope/runs.js';
import { viewOf } from '#lib/scope/scope.js';
import { edgeOf } from '#lib/server/platform.js';
import { cluster } from '#lib/server/read.js';
import { primaryOf } from '#lib/server/primary.js';
import type { PageServerLoad } from './$types';

const DAYS = 30;

/**
 * The cluster and the view's recent runs held for the document's own response, so the server
 * draws the page whole, and streamed on a move, each part filling as its read lands. See
 * spec/architecture/console.md, "The console's server never waits on data; it only draws". The
 * map is All's and Infra's, as the nodes are. See spec/console/overview.md.
 */
export const load: PageServerLoad = async (event) => {
	const edge = edgeOf(event);
	const view = viewOf(event.params.scope);
	const held = cluster(edge);
	const history = runsIn(edge, view);
	const now = Date.now();
	const nodes = view === 'all' || view === 'infra';
	const deploys = history.then(({ runs, failures }) => ({
		seen: runs.length,
		figures: figures(runs, now, now - DAYS * 86_400_000),
		missing: Object.entries(failures).map(([node, failure]) => ({
			node,
			message: failure.message,
		})),
	}));
	// Every step of the last day besides, which the timeline draws; see spec/console/overview.md.
	const moving = history.then(({ runs, apart }) => fromHistory(runs, apart, 40, 80, now - DAY));
	const first = !event.isDataRequest;
	return {
		view,
		nodes,
		cluster: first ? await held : held,
		deploys: first ? await deploys : deploys,
		moving: first ? await moving : moving,
		// Where each place's latency is to; see spec/console/overview.md.
		primary: nodes ? primaryOf(edge) : Promise.resolve(undefined),
	};
};
