import { figures } from '#lib/overview/deploys.js';
import { fromHistory } from '#lib/overview/moving.js';
import { runsIn } from '#lib/scope/runs.js';
import { viewOf } from '#lib/scope/scope.js';
import { edgeOf } from '#lib/server/platform.js';
import { cluster } from '#lib/server/read.js';
import { primaryOf } from '#lib/server/primary.js';
import type { PageServerLoad } from './$types';

const DAYS = 30;

/**
 * The view's recent runs streamed, the page standing at once and each part filling as its read
 * lands; the cluster held for the document's own response, so the server draws the list and the
 * map, and streamed on a move. See spec/architecture/console.md, "Moving between pages never waits
 * for a node". The map is All's and Infra's, as the nodes are. See spec/console/overview.md.
 */
export const load: PageServerLoad = async (event) => {
	const edge = edgeOf(event);
	const view = viewOf(event.params.scope);
	const history = runsIn(edge, view);
	const now = Date.now();
	const nodes = view === 'all' || view === 'infra';
	return {
		view,
		nodes,
		cluster: event.isDataRequest ? cluster(edge) : await cluster(edge),
		deploys: history.then(({ runs, failures }) => ({
			seen: runs.length,
			figures: figures(runs, now, now - DAYS * 86_400_000),
			missing: Object.entries(failures).map(([node, failure]) => ({
				node,
				message: failure.message,
			})),
		})),
		moving: history.then(({ runs, apart }) => fromHistory(runs, apart)),
		// Where each place's latency is to; see spec/console/overview.md.
		primary: nodes ? primaryOf(edge) : Promise.resolve(undefined),
	};
};
