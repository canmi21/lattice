import { error } from '@sveltejs/kit';
import { viewOf } from '#lib/scope/scope.js';
import type { LayoutLoad } from './$types';

/** The nodes are infra's, shown under All and Infra alone; see spec/architecture/console.md. */
export const load: LayoutLoad = ({ params }) => {
	const view = viewOf(params.scope);
	if (view !== 'all' && view !== 'infra') error(404, 'The nodes are read in Infra.');
};
