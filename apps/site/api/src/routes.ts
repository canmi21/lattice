/**
 * The routes of the site's API by name, which is the path each answers on. Data alone, so the
 * site's pages import it without the API: it is what they address the API by, and what the
 * Worker resolves an address back to. `app.test.ts` holds it to the routes the app serves.
 */
export const ROUTES = [
	'article',
	'asset',
	'batch',
	'feed',
	'homepage',
	'like',
	'media',
	'newsletter',
	'read',
	'sitemap',
	'source',
	'stats',
] as const;

export type Route = (typeof ROUTES)[number];

/**
 * The routes the public API host serves as the `site` scope, under their names. The rest are the
 * site's own and reached only from its pages. See spec/architecture/services.md, "The site's API
 * runs in the site's Worker".
 */
export const PUBLIC_ROUTES: ReadonlySet<string> = new Set<Route>(['asset', 'media']);
