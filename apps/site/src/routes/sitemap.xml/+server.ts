import { sitemapXml } from '@canmi/robots';
import { URLS } from '@canmi/urls';
import type { Alternate } from '@canmi/artifacts/types';
import { publishedSitemap } from '$lib/published';
import type { RequestHandler } from './$types';

type Entry = {
	loc: string;
	lastmod?: string;
	changefreq: string;
	priority: string;
	alternates?: Alternate[];
};

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

// The landing page has no modification time of its own; what it lists is the corpus, so the
// root's own timestamp is when it last changed. The build time stands in only when the API
// answered nothing at all.
function staticEntries(generated: string): Entry[] {
	return [
		{
			loc: `${URLS.apps.production.site}/`,
			lastmod: generated,
			changefreq: 'daily',
			priority: '1.0',
		},
		// The status page, another of the author's sites, listed here as Search Console allows for
		// a verified one and as its robots.txt confirms for every other engine. It changes as
		// often as it is read, so it names no modification time. See spec/architecture/robots.md.
		{
			loc: new URL('/', URLS.internal.status.canonical).href,
			changefreq: 'always',
			priority: '0.5',
		},
	];
}

function changefreq(ageMs: number): string {
	if (ageMs < HOUR) return 'hourly';
	if (ageMs < DAY) return 'daily';
	if (ageMs < 7 * DAY) return 'weekly';
	if (ageMs < 30 * DAY) return 'monthly';
	if (ageMs < 365 * DAY) return 'yearly';
	return 'never';
}

function priority(ageMs: number): string {
	if (ageMs < 30 * DAY) return '0.9';
	if (ageMs < 90 * DAY) return '0.8';
	if (ageMs < 180 * DAY) return '0.7';
	if (ageMs < 365 * DAY) return '0.6';
	return '0.5';
}

// Still assembled rather than published: it needs only paths and dates, which the API already
// carries, and its changefreq is a function of the time of the request rather than of the
// corpus. See spec/architecture/artifacts.md, "Which objects exist".
export const GET: RequestHandler = async ({ fetch }) => {
	const now = Date.now();
	const published = await publishedSitemap(fetch);

	const entries: Entry[] = [
		...staticEntries(published?.generated ?? import.meta.env.VITE_BUILD_TIME),
		...(published?.views ?? []).map(({ loc, lastmod, alternates }) => {
			const ageMs = now - Date.parse(lastmod);
			return {
				loc,
				lastmod,
				changefreq: changefreq(ageMs),
				priority: priority(ageMs),
				alternates,
			};
		}),
	];

	const body = sitemapXml(entries);
	return new Response(body, {
		headers: {
			'Content-Type': 'application/xml; charset=utf-8',
			'Cache-Control': 'public, max-age=300, s-maxage=300',
		},
	});
};
