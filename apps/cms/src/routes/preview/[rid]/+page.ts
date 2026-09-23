import { previewDraft, readDraft } from '$lib/collection.ts';
import type { PageLoad } from './$types';

/** The draft compiled the way the site compiles a published one, rendered with the page. */
export const load: PageLoad = async ({ fetch, params }) => {
	const [draft, preview] = await Promise.all([
		readDraft(params.rid, fetch),
		previewDraft(params.rid, fetch),
	]);
	return { rid: params.rid, title: draft.meta.title ?? '', preview };
};
