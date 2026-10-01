import { PUBLISHED } from '@canmi/cache';
import { peerEntries, rootEntry, sitemapXml } from '@canmi/robots';
import type { RequestHandler } from './$types';

// The one page there is, then every other page host by its root. See spec/architecture/robots.md,
// "Every page host names every other".
export const GET: RequestHandler = () =>
	new Response(
		sitemapXml([rootEntry('status'), ...peerEntries('status')]),
		{ headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': PUBLISHED } },
	);
