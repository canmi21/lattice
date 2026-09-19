import { HASH_PATTERN } from '@canmi/artifacts';
import { PUBLISHED, UNCHANGING } from '@canmi/cache';
import type { MiddlewareHandler } from 'hono';

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

/**
 * The floor: this worker's one cache rule, derived from the key rather than looked up.
 *
 * A route that stores its own response stamps `UNCHANGING` itself, which it has to do before
 * the response is put in the cache and therefore earlier than this runs. Everything else
 * arrives here unstamped and is decided by the shape of the name it was asked for.
 */
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
	const unchanging =
		ok && (isContentAddressed(path) || PROMISED.some((prefix) => path.startsWith(prefix)));

	const headers = new Headers(c.res.headers);
	headers.set('Cache-Control', unchanging ? UNCHANGING : PUBLISHED);
	c.res = new Response(c.res.body, {
		status: c.res.status,
		statusText: c.res.statusText,
		headers,
	});
};

/**
 * The same rule for the two routes whose whole answer is settled by the address.
 *
 * `/object` and `/derive` part company with the floor above on one status class: a `3xx` here
 * earns the year too. A `/derive` redirect is a function of the input -- the two extensions were
 * the same -- so it can no more change than the bytes can, and five minutes would make a client
 * re-ask a question already written in the URL. Everything else is a fact about the bucket or
 * about this moment and keeps the short life. See spec/architecture/delivery.md.
 */
export const objectCache: MiddlewareHandler = async (c, next) => {
	await next();
	if (c.res.headers.has('Cache-Control')) return;

	const settled = c.res.status >= 200 && c.res.status < 400;
	const headers = new Headers(c.res.headers);
	headers.set('Cache-Control', settled ? UNCHANGING : PUBLISHED);
	c.res = new Response(c.res.body, {
		status: c.res.status,
		statusText: c.res.statusText,
		headers,
	});
};
