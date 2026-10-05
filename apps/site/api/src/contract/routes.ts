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

const PLACEHOLDER = /^\{([a-z]+)(\*?)\}$/;

/** The placeholders of `shape`, in order, each with whether it may hold a slash. */
export function placeholders(shape: string): { name: string; rest: boolean }[] {
	return shape.split('/').flatMap((segment) => {
		const match = PLACEHOLDER.exec(segment);
		return match ? [{ name: match[1] as string, rest: match[2] === '*' }] : [];
	});
}

/**
 * `shape` filled from `parameters`: its path, and the parameters it does not take in the path,
 * left for the query. Undefined when a placeholder has no value.
 */
export function fill(
	shape: string,
	parameters: Readonly<Record<string, string>> = {},
): { path: string; query: Record<string, string> } | undefined {
	const query: Record<string, string> = { ...parameters };
	const segments: string[] = [];
	for (const segment of shape.split('/')) {
		const match = PLACEHOLDER.exec(segment);
		if (!match) {
			segments.push(segment);
			continue;
		}
		const value = parameters[match[1] as string];
		if (!value) return undefined;
		delete query[match[1] as string];
		segments.push(
			match[2] === '*'
				? value.split('/').map(encodeURIComponent).join('/')
				: encodeURIComponent(value),
		);
	}
	return { path: segments.join('/'), query };
}

/** `path` read against `shape`: the placeholders' values, or undefined when it is not the shape. */
export function read(shape: string, path: string): Record<string, string> | undefined {
	const expected = shape.split('/');
	const asked = path.split('/');
	const values: Record<string, string> = {};
	for (const [index, segment] of expected.entries()) {
		const match = PLACEHOLDER.exec(segment);
		if (!match) {
			if (asked[index] !== segment) return undefined;
			continue;
		}
		const taken = match[2] === '*' ? asked.slice(index).join('/') : asked[index];
		if (!taken) return undefined;
		values[match[1] as string] = decodeURIComponent(taken);
		if (match[2] === '*') return values;
	}
	return asked.length === expected.length ? values : undefined;
}
