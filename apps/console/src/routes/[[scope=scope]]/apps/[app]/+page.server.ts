import { redirect } from '@sveltejs/kit';
import { appReadsBeside } from '#lib/apps/read.js';
import { scopeOf, viewOf, within } from '#lib/scope/scope.js';
import { ALL } from '#lib/server/fleet.js';
import { edgeOf } from '#lib/server/platform.js';
import { cluster } from '#lib/server/read.js';
import { range } from '#lib/server/reads.js';
import { RANGES } from '#lib/ui/segmented.svelte';
import type { PageServerLoad } from './$types';

/**
 * The span at once, the cluster and the app's reads streamed. A page already sent cannot become a
 * 404, so an app no node runs is said in the page instead. An app asked for in another scope is
 * sent to its own, which the address names; All shows every one. See spec/architecture/console.md.
 */
export const load: PageServerLoad = (event) => {
	const app = event.params.app;
	const own = scopeOf(app);
	const view = viewOf(event.params.scope);
	if (view !== 'all' && own !== view) {
		redirect(307, `${within(own, `/apps/${encodeURIComponent(app)}`)}${event.url.search}`);
	}
	const edge = edgeOf(event);
	const asked = event.url.searchParams.get('range');
	const chosen = RANGES.find((one) => one.key === asked)?.key ?? '24h';
	const span = range(chosen);
	const held = cluster(edge);
	return {
		cluster: held,
		order: ALL,
		app,
		range: chosen,
		span,
		reads: appReadsBeside(edge, held, app, span),
	};
};
