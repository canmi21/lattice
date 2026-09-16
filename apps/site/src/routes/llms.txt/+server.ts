import { error } from '@sveltejs/kit';
import { publishedLlms } from '$lib/published';
import type { RequestHandler } from './$types';

// Not prerendered, which it used to be. The corpus is no longer built with the site, so a copy
// taken at build time would never gain an article published after it.
export const prerender = false;

export const GET: RequestHandler = async ({ fetch }) => {
	const llms = await publishedLlms(fetch);
	if (!llms) error(404, 'Not found');
	return new Response(llms.body, {
		headers: {
			'Content-Type': 'text/plain; charset=utf-8',
			'Cache-Control': 'public, max-age=300, s-maxage=300',
		},
	});
};
