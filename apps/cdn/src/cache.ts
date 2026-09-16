import { HASH_PATTERN } from '@canmi/artifacts';
import type { MiddlewareHandler } from 'hono';

/** One year. The longest value browsers honour, and what `immutable` implies. */
const IMMUTABLE = 31_536_000;
const WEEK = 604_800;
const BRIEF = 300;

/**
 * What a hashed name earns. Exported because a route that caches its own response has to
 * stamp this before the response is stored, which is earlier than this middleware runs.
 */
export const FOREVER = `public, max-age=${IMMUTABLE}, immutable`;

/** Everything the year does not reach: a name whose bytes may change, and every error. */
export const BRIEFLY = `public, max-age=${BRIEF}`;

/**
 * What an OpenGraph card earns, and nothing else.
 *
 * A card is addressed by the slug of the page it belongs to, so editing a title rewrites the
 * bytes under an unchanged URL. A week is the accepted staleness and is also how long X holds a
 * card, so a shorter value would only cost fetches without shortening the wait. That route
 * stamps it rather than deriving it here, because this middleware reads shapes, not reasons.
 */
export const WEEKLY = `public, max-age=${WEEK}`;

/**
 * Whether the path's last segment is a content hash, which is the whole basis for the year.
 *
 * One predicate over two shapes that are one shape from here: an artifact key,
 * `/content/{hash}.json`, and an asset the bucket fans out, `/image/{cid}.avif`, both end in
 * `{hash}.{ext}`. So a new object type inherits its lifetime from the shape of its own name and
 * costs no cache decision -- see spec/architecture/artifacts.md, "The key says what may cache it".
 */
export function isContentAddressed(path: string): boolean {
	const name = path.slice(path.lastIndexOf('/') + 1);
	const dot = name.indexOf('.');
	if (dot <= 0) return false;
	return HASH_PATTERN.test(name.slice(0, dot)) && /^[a-z0-9]+$/.test(name.slice(dot + 1));
}

/**
 * Kept forever without a hash to justify it: a name, plus the promise that earns it.
 *
 * A Latin font filename carries no content hash, so a year on `IoskeleyMono-Regular-latin.woff2`
 * is a promise that re-subsetting produces a new filename rather than an observation about the
 * bytes. Inherited from the `_headers` file the old static-assets deployment used. See
 * spec/architecture/artifacts.md, "There is one exception, and it carries a promise".
 */
const PROMISED = ['/fonts/'];

export const cacheControl: MiddlewareHandler = async (c, next) => {
	await next();
	if (c.res.headers.has('Cache-Control')) return;

	const path = new URL(c.req.url).pathname;
	// The long life is conditional on the answer having one. A 404 on a hashed name means the
	// object was not uploaded or has been swept, and neither is a fact worth keeping for a year --
	// it is also why publication uploads everything before it writes the root.
	//
	// A 304 is not an error and is counted: its headers replace the stored response's, so five
	// minutes there would cut a year-old copy down on every revalidation.
	const ok = (c.res.status >= 200 && c.res.status < 300) || c.res.status === 304;
	const forever =
		ok && (isContentAddressed(path) || PROMISED.some((prefix) => path.startsWith(prefix)));

	const headers = new Headers(c.res.headers);
	headers.set('Cache-Control', forever ? FOREVER : BRIEFLY);
	c.res = new Response(c.res.body, {
		status: c.res.status,
		statusText: c.res.statusText,
		headers,
	});
};
