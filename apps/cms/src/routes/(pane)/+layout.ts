import { DRAFTS, listDrafts } from '$lib/collection.ts';
import type { LayoutLoad } from './$types';

/**
 * Every article, for the sidebar's folder and the ledger. Declared under a key rather than read
 * on every navigation, so it is asked for again exactly when something wrote it: a save, a new
 * article, a publication.
 */
export const load: LayoutLoad = async ({ fetch, depends }) => {
	depends(DRAFTS);
	return { articles: await listDrafts(fetch) };
};
