import { known } from '#lib/ui/time-zone.js';
import { load as events } from '#lib/events/load.js';
import { inView } from '#lib/scope/runs.js';
import { viewOf } from '#lib/scope/scope.js';
import { edgeOf } from '#lib/server/platform.js';
import type { PageServerLoad } from './$types';

/** The view's own events, kept as each node answers; see src/lib/events/load.ts. */
export const load: PageServerLoad = (event) => {
	const zone = known((event.request.cf as { timezone?: string } | undefined)?.timezone);
	const view = viewOf(event.params.scope);
	return { view, ...events(edgeOf(event), event.url.searchParams, zone, inView(view)) };
};
