import { dev } from '$app/environment';
import { pickUrls } from '@canmi/urls';
import { HEADER, TEXT_HEADERS } from '$lib/licenses';
import { publishedAsset } from '$lib/published';
import type { RequestHandler } from './$types';

// Not prerendered, because prerendering means fetching the CDN during the build and CI
// compiles rather than derives. See spec/architecture/data.md.
export const prerender = false;

/**
 * The whole attribution notice: every package, with every license text in full.
 *
 * Assembled by `cms licenses` and published as a single object -- see spec/architecture/data.md,
 * "A dependency's licence is an asset like any other", for why it is an aggregate rather than
 * built per request. Buffered rather than streamed here: a few megabytes, answered from the edge
 * cache almost every time, and a hand-assembled stream to prepend one line buys nothing a reader
 * could notice.
 */
export const GET: RequestHandler = async ({ fetch }) => {
	// Asked of the API rather than of a fixed name on the CDN, and never through the alias layer:
	// nothing on this site's own rendering path resolves. `pickUrls` because this runs on the
	// server, where a page's relative proxy path would be answered by SvelteKit's own router.
	// See spec/architecture/delivery.md.
	const found = await publishedAsset(fetch, 'licenses.txt');
	const upstream = found
		? await fetch(`${pickUrls(dev).cdn}/${found.type}/${found.cid}.${found.extension}`)
		: new Response(null, { status: 404 });
	if (!upstream.ok) {
		// The notice has not been synced to the bucket yet. A missing published object is a
		// known state here rather than a fault, so it is reported as one.
		const status = upstream.status === 404 ? 404 : 502;
		return new Response(`${HEADER}\n\nThe full notice has not been published yet.\n`, {
			status,
			headers: TEXT_HEADERS,
		});
	}

	return new Response(`${HEADER}\n\n${await upstream.text()}`, { headers: TEXT_HEADERS });
};
