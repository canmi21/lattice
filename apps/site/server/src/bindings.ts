import type { Bindings as StoreBindings } from '@canmi/store';

/**
 * What the site's Worker hands this API: its database, the records bucket, and the limits in
 * `limits.ts`. Written out rather than generated, because the Worker that binds them is the site's
 * and its wrangler.jsonc carries the site's own bindings beside these.
 */
export type Bindings = StoreBindings & {
	DATABASE: D1Database;
	ENGAGEMENT_LIMIT: RateLimit;
	NEWSLETTER_LIMIT: RateLimit;
	LIKE_LIMIT: RateLimit;
	/** The read counter's own minute, which withholds an increment rather than refusing. */
	READ_RATE_LIMITER: RateLimit;
};
