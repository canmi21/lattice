import { PUBLISHED } from '@canmi/cache';
import { peerEntries, sitemapXml } from '@canmi/robots';
import { URLS } from '@canmi/urls';
import type { RequestHandler } from './$types';

// The one page there is, then every other page host by its root. See spec/architecture/robots.md,
// "Every page host names every other".
export const GET: RequestHandler = () =>
	new Response(
		sitemapXml([{ loc: new URL('/', URLS.internal.status.canonical).href }, ...peerEntries('status')]),
		{ headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': PUBLISHED } },
	);
