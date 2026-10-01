import { buildLlms } from '$lib/documents/llms';
import { llmsInput } from '$lib/server/llms';
import type { RequestHandler } from './$types';

// Not prerendered, which it used to be. The corpus is no longer built with the site, so a copy
// taken at build time would never gain an article published after it.
export const prerender = false;

/**
 * The source view's listing, so no negotiation and no `?lang=`: the document tells a machine how
 * to ask for a translation rather than being served as one. See spec/locale/addressing.md,
 * "Every page negotiates; the exceptions are documents".
 */
export const GET: RequestHandler = async ({ fetch }) =>
	new Response(buildLlms(await llmsInput(fetch, new Date())), {
		headers: {
			'Content-Type': 'text/markdown; charset=utf-8',
			'Cache-Control': 'public, max-age=300, s-maxage=300',
		},
	});
