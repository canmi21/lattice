import { viewOf } from '#lib/scope/scope.js';
import { ALL } from '#lib/server/fleet.js';
import { edgeOf } from '#lib/server/platform.js';
import { cluster } from '#lib/server/read.js';
import type { PageServerLoad } from './$types';

/**
 * The cluster streamed on a move, so the page stands at once, and held for the document's own
 * response, so the server draws it filled; see spec/architecture/console.md.
 */
export const load: PageServerLoad = async (event) => ({
	view: viewOf(event.params.scope),
	cluster: event.isDataRequest ? cluster(edgeOf(event)) : await cluster(edgeOf(event)),
	order: ALL,
});
