import { PUBLISHED } from '@monoflake/sdk/cache';
import { sitemapXml } from '@canmi/me/robots';
import { ownRoot, peerEntries } from '@canmi/robots';
import type { RequestHandler } from './$types';

// The one page there is, then every other page host by its root. See lib's spec/me/robots.md,
// "Every page host names every other".
export const GET: RequestHandler = () =>
	new Response(
		// Its one page, which on its own scale weighs the most there is.
		sitemapXml([ownRoot('status', '1.0'), ...peerEntries('status')]),
		{ headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': PUBLISHED } },
	);
