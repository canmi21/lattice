import { PUBLISHED } from '@canmi/cache';
import { sitemapXml } from '@canmi/robots';
import { URLS } from '@canmi/urls';
import type { RequestHandler } from './$types';

// The one page there is, at its one address. See spec/architecture/robots.md.
export const GET: RequestHandler = () =>
	new Response(sitemapXml([{ loc: new URL('/', URLS.internal.status.canonical).href }]), {
		headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': PUBLISHED },
	});
