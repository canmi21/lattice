import { buildLlmsFull } from '#lib/documents/llms.js';
import { articleAgentView } from '#lib/server/agent-pages.js';
import { llmsInput } from '#lib/server/llms.js';
import type { RequestHandler } from './$types';

export const prerender = false;

/**
 * Every article's agent view in one document, for a reader that takes the whole site into its
 * context at once. See spec/architecture/markdown.md, "The index".
 */
export const GET: RequestHandler = async ({ fetch }) => {
	const now = new Date();
	const input = await llmsInput(fetch, now);
	const views = await Promise.all(
		input.articles.map((article) => articleAgentView(fetch, article.slug, undefined, now)),
	);
	return new Response(
		buildLlmsFull(
			input,
			views.flatMap((view) => (view ? [view.body] : [])),
		),
		{
			headers: {
				'Content-Type': 'text/markdown; charset=utf-8',
				'Cache-Control': 'public, max-age=300, s-maxage=300',
			},
		},
	);
};
