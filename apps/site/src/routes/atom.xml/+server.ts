import { error } from '@sveltejs/kit';
import { publishedFeed } from '$lib/published';
import { feedLocale } from '$lib/server/feed';
import type { RequestHandler } from './$types';

export const prerender = false;

// The whole document is published as one object rather than assembled here: building it from
// the root would mean fetching every article's view to reach one field, which is the one shape
// this design must not have. See spec/architecture/artifacts.md, "Which objects exist".
export const GET: RequestHandler = async ({ request, fetch }) => {
	const feed = await publishedFeed(fetch, feedLocale(request));
	if (!feed) error(404, 'Not found');
	return new Response(feed.body, {
		headers: {
			'Content-Type': 'application/atom+xml; charset=utf-8',
			'Cache-Control': 'public, max-age=360, s-maxage=360',
		},
	});
};
