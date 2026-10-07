import { runsIn } from '#lib/scope/runs.js';
import { viewOf } from '#lib/scope/scope.js';
import { ALL } from '#lib/server/fleet.js';
import { edgeOf } from '#lib/server/platform.js';
import { cluster } from '#lib/server/read.js';
import { aggregates } from '#lib/server/runs.js';
import type { PageServerLoad } from './$types';

/** The span the chart and the tiles read, in days. */
const DAYS = 30;

/** The view's runs streamed, so the page stands at once; see spec/architecture/console.md. */
export const load: PageServerLoad = (event) => {
	const edge = edgeOf(event);
	const view = viewOf(event.params.scope);
	const now = Date.now();
	return {
		view,
		cluster: cluster(edge),
		nodes: ALL,
		days: DAYS,
		now,
		runs: runsIn(edge, view).then((read) => ({
			...read,
			aggregates: aggregates(
				read.runs.filter((run) => now - Date.parse(run.first_start) < DAYS * 86_400_000),
			),
		})),
	};
};
