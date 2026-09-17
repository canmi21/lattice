import { publishedHome } from '$lib/published';
import { buildLlms } from '$lib/documents/llms';
import { site } from '$lib/site';
import type { RequestHandler } from './$types';

// Not prerendered, which it used to be. The corpus is no longer built with the site, so a copy
// taken at build time would never gain an article published after it.
export const prerender = false;

/**
 * The source view's listing, so no negotiation and no `?lang=`: the document tells a machine how
 * to ask for a translation rather than being served as one. See spec/locale/addressing.md,
 * "Every page negotiates; the exceptions are documents".
 *
 * Built from the homepage answer, which already carries every article's URL and copy -- so this
 * needs no object of its own, and the two share one cached answer.
 */
export const GET: RequestHandler = async ({ fetch }) => {
	const { articles } = await publishedHome(fetch, 'mw');
	return new Response(buildLlms(articles, site), {
		headers: {
			'Content-Type': 'text/plain; charset=utf-8',
			'Cache-Control': 'public, max-age=300, s-maxage=300',
		},
	});
};
