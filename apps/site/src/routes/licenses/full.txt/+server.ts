import { dev } from '$app/environment';
import { pageUrls } from '@canmi/urls';
import { HEADER, TEXT_HEADERS, fullUrl } from '$lib/licenses';
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
export const GET: RequestHandler = async () => {
	const upstream = await fetch(fullUrl(pageUrls(dev).cdn));
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
