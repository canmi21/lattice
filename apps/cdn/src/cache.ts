import { HASH_PATTERN } from '@canmi/artifacts';
import { NAMED, PUBLISHED, UNCHANGING } from '@canmi/cache';
import type { MiddlewareHandler } from 'hono';

/** What may follow the hash: one extension, or the two a derivation names. */
const EXTENSIONS = /^[a-z0-9]+(\.[a-z0-9]+)*$/;

/**
 * Whether the path's last segment is a content hash, which is the whole basis for the year.
 *
 * One predicate over every address this host expresses: `/object/{cid}.{ext}` and
 * `/derive/{cid}.{ext}.{ext}` both end in a hashed name and nothing else here does -- two
 * extensions being as settled as one, since the hash names the source and the pair names the
 * conversion. So a group added later costs no cache decision of its own. See
 * spec/architecture/artifacts.md, "The key says what may cache it".
 */
export function isContentAddressed(path: string): boolean {
	const name = path.slice(path.lastIndexOf('/') + 1);
	const dot = name.indexOf('.');
	if (dot <= 0) return false;
	return HASH_PATTERN.test(name.slice(0, dot)) && EXTENSIONS.test(name.slice(dot + 1));
}

/**
 * The one rule, written once and asked rather than repeated.
 *
 * Two questions: whether the request was answered, and whether the address carries a hash. A
 * hashed address answered is the bytes themselves and keeps the year; a name answered keeps the
 * hour, because what it stands for may move while it does not; anything else is a fact about the
 * bucket or about this moment. A `3xx` counts as answered: `/derive` redirects for an extension
 * it has no work to do on, and that is as settled as the bytes it points at.
 */
/**
 * Not stored at all, for an answer that is about this moment rather than about the corpus.
 *
 * The rule below has no row for it because status alone cannot tell them apart: a 502 from a
 * resolver and a 400 from a malformed address are both "not settled", and only one of them is
 * worth forgetting immediately. A route that knows which it is stamps this over the rule.
 */
export const NEVER = 'no-store';

export function lifetimeFor(path: string, status: number): string {
	const settled = status >= 200 && status < 400;
	if (!settled) return PUBLISHED;
	return isContentAddressed(path) ? UNCHANGING : NAMED;
}

/**
 * The floor, so nothing leaves this host without a lifetime.
 *
 * Mounted over everything rather than over each group, because the rule above covers the three
 * of them and a route added beside them is far likelier to want it than not. The two names that
 * sit outside it -- `/favicon.ico` and `/robots.txt` -- say so by stamping their own before this
 * runs, and a route that stores its own response at the edge asks `lifetimeFor` directly, since
 * the copy it puts there exists before this can reach it.
 */
export const cacheControl: MiddlewareHandler = async (c, next) => {
	await next();
	if (c.res.headers.has('Cache-Control')) return;

	const headers = new Headers(c.res.headers);
	headers.set('Cache-Control', lifetimeFor(new URL(c.req.url).pathname, c.res.status));
	c.res = new Response(c.res.body, {
		status: c.res.status,
		statusText: c.res.statusText,
		headers,
	});
};
