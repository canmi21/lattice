import { byNode } from '#lib/overview/deploys.js';
import { runsIn } from '#lib/scope/runs.js';
import { viewOf } from '#lib/scope/scope.js';
import { ALL } from '#lib/server/fleet.js';
import { edgeOf } from '#lib/server/platform.js';
import { cluster } from '#lib/server/read.js';
import { aggregates } from '#lib/server/runs.js';
import type { PageServerLoad } from './$types';

/** The span the chart and the tiles read, in days. */
const DAYS = 30;

/**
 * The view's runs and the cluster held for the document's own response and streamed on a move;
 * see spec/architecture/console.md.
 */
export const load: PageServerLoad = async (event) => {
	const edge = edgeOf(event);
	const view = viewOf(event.params.scope);
	const now = Date.now();
	const runs = runsIn(edge, view).then((read) => ({
		...read,
		aggregates: aggregates(
			read.runs.filter((run) => now - Date.parse(run.first_start) < DAYS * 86_400_000),
		),
		// Came from the overview; see spec/console/overview.md, "Charts are their pages'".
		outcomes: byNode(read.runs, ALL, now - DAYS * 86_400_000),
	}));
	return {
		view,
		cluster: event.isDataRequest ? cluster(edge) : await cluster(edge),
		nodes: ALL,
		days: DAYS,
		now,
		runs: event.isDataRequest ? runs : await runs,
	};
};
