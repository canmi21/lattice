import { error } from '@sveltejs/kit';
import { LIMIT, inView } from '#lib/scope/runs.js';
import { viewOf } from '#lib/scope/scope.js';
import { ALL, fleetEvents } from '#lib/server/fleet.js';
import { edgeOf } from '#lib/server/platform.js';
import { cluster } from '#lib/server/read.js';
import { group } from '#lib/server/runs.js';
import type { PageServerLoad } from './$types';

/**
 * The run's events streamed, so the page stands at once, the cluster held for the document's own
 * response, and only the apps its view shows; see
 * spec/architecture/console.md.
 */
export const load: PageServerLoad = async (event) => {
	const run = Number(event.params.run);
	if (!Number.isSafeInteger(run) || run <= 0) error(404, `No run is numbered ${event.params.run}.`);
	const edge = edgeOf(event);
	const keep = inView(viewOf(event.params.scope));
	return {
		cluster: event.isDataRequest ? cluster(edge) : await cluster(edge),
		run,
		nodes: ALL,
		now: Date.now(),
		read: fleetEvents(edge, { limit: LIMIT }).then((read) => {
			const events = read.events.filter(
				(one) => one.source.kind === 'run' && one.source.run === run && keep(one),
			);
			return { found: group(events).runs[0], events, failures: read.failures };
		}),
	};
};
