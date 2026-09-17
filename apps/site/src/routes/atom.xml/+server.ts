import { error } from '@sveltejs/kit';
import { publishedFeedEntries } from '$lib/published';
import { buildFeed } from '$lib/documents/feed';
import { feedLocale } from '$lib/server/feed';
import { site } from '$lib/site';
import type { RequestHandler } from './$types';

export const prerender = false;

/**
 * Assembled here rather than fetched: every field is a projection of objects the bucket already
 * holds, and publishing the document meant rewriting the whole corpus into nine immutable
 * quarter-megabyte objects on every edit. See spec/architecture/artifacts.md, "Which objects
 * exist".
 *
 * Shared-cacheable because the URL decides the whole answer -- `?lang=` and nothing else. No
 * cookie is read and no header is negotiated, which is what `feedLocale` exists to guarantee.
 */
export const GET: RequestHandler = async ({ request, fetch }) => {
	const locale = feedLocale(request);
	const entries = await publishedFeedEntries(fetch, locale);
	if (!entries) error(404, 'Not found');
	return new Response(buildFeed(entries, locale, site), {
		headers: {
			'Content-Type': 'application/atom+xml; charset=utf-8',
			'Cache-Control': 'public, max-age=300, s-maxage=300',
		},
	});
};
