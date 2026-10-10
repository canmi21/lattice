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
	'verify',
] as const;

export type Route = (typeof ROUTES)[number];

/**
 * The routes the public API host serves as the `site` scope, under their names. The rest are the
 * site's own and reached only from its pages. See spec/architecture/site-api.md, "The
 * site's API runs in the site's Worker".
 */
export const PUBLIC_ROUTES: ReadonlySet<string> = new Set<Route>(['asset', 'media']);

/**
 * Each route's shape: the path it is asked at, the thing it is about in the path as a placeholder
 * named for the query parameter its handler reads -- `{name*}` for one that may hold a slash -- and
 * whatever else it takes in the query. In development a page asks at the shape itself; in
 * production at the route's contract address followed by the placeholders' values. See the
 * workspace's spec/addresses.md, and spec/architecture/site-api.md, "The pages ask by
 * contract".
 */
export const SHAPES: Readonly<Record<Route, string>> = {
	article: 'articles/{slug}',
	asset: 'assets/{name*}',
	batch: 'batch',
	feed: 'feed',
	homepage: 'homepage',
	like: 'like',
	media: 'media/{resource}',
	newsletter: 'subscriptions',
	read: 'articles/{slug}/reads',
	sitemap: 'sitemap',
	source: 'articles/{slug}/source',
	stats: 'stats',
	verify: 'security/verify',
};

export { fill, placeholders, read } from '@canmi/addresses';
