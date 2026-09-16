import { site } from '$lib/site';
import { error } from '@sveltejs/kit';
import type { EntryGenerator, RequestHandler } from './$types';

export const prerender = true;

/**
 * The IndexNow ownership proof: `/<key>.txt`, containing that key and nothing else.
 *
 * Why the path is a dynamic segment checked against the config rather than a directory named
 * after the key -- see spec/indexing.md, "The path is derived from the key, never written twice".
 *
 * Prerendered to exactly one entry. Any other `<something>.txt` is not this file and must not
 * answer as if it were -- `robots.txt`, `llms.txt` and `licenses.txt` take precedence on names.
 */
export const entries: EntryGenerator = () => [{ key: site.indexnow }];

export const GET: RequestHandler = ({ params }) => {
	if (params.key !== site.indexnow) error(404, 'Not Found');
	return new Response(site.indexnow, {
		headers: { 'Content-Type': 'text/plain; charset=utf-8' },
	});
};
