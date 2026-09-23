import { listRevisions, readDraft } from '$lib/collection.ts';
import type { PageLoad } from './$types';

/** The draft and its revisions, so the fields render with the page and not after it. */
export const load: PageLoad = async ({ fetch, params }) => {
	const [draft, revisions] = await Promise.all([
		readDraft(params.rid, fetch),
		listRevisions(params.rid, fetch),
	]);
	return { draft, revisions };
};
