import type { MiddlewareHandler } from 'hono';

/**
 * How long an answer from this layer may be kept.
 *
 * **This layer's answer is exactly as fresh as the API answer behind it**, so a resolved redirect
 * takes the same life the `/asset` answer takes. Any other number would be a second publication
 * delay on one resource, which is the thing the arrangement exists to avoid. See
 * spec/architecture/delivery.md.
 */

/** Five minutes, the one publication delay. Written out in apps/api and apps/cdn too. */
const BRIEF = 300;

/**
 * A resolved name, and a miss that is a fact about the corpus.
 *
 * `stale-if-error` because this is the most fragile of the three hosts -- it is the only one that
 * has to reach another to answer at all -- and a redirect it last resolved is a better answer
 * during an outage than no answer. The target is content-addressed, so a stale one is still bytes.
 */
export const RESOLVED = `public, max-age=${BRIEF}, stale-if-error=10800`;

/** A name the corpus does not publish, or an address that could never name one. */
export const REFUSED = `public, max-age=${BRIEF}`;

/**
 * Anything that says something about this moment rather than about the corpus.
 *
 * The API being unreachable is not a fact worth keeping: every icon on a page comes through here,
 * so holding one blip for five minutes turns it into an outage. The same asymmetry apps/cdn keeps
 * between a 404 and a 500.
 */
export const NEVER = 'no-store';

/**
 * The floor, so nothing leaves here unstamped.
 *
 * A route that knows better sets its own before this runs -- a resolved redirect takes `RESOLVED`
 * and anything about this moment takes `NEVER`. Everything else is a fact about the corpus and
 * gets the corpus lifetime, which is the right default because a route added later is far more
 * likely to be one of those than not.
 */
export const cacheControl: MiddlewareHandler = async (c, next) => {
	await next();
	if (c.res.headers.has('Cache-Control')) return;
	const headers = new Headers(c.res.headers);
	headers.set('Cache-Control', REFUSED);
	c.res = new Response(c.res.body, { status: c.res.status, statusText: c.res.statusText, headers });
};
