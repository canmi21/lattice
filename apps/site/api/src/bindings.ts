import type { Quota } from '@monoflake/sdk/limits';
import type { Bindings as StoreBindings } from '@monoflake/sdk/store';

/**
 * What the site's Worker hands this API: its database, the records bucket, and `quota`'s inside
 * door, which counts the limits in `limits.ts` and the read counter's minute. Written out rather
 * than generated, because the Worker that binds them is the site's and its wrangler.jsonc carries
 * the site's own bindings beside these.
 */
export type Bindings = StoreBindings & {
	DATABASE: D1Database;
	QUOTA: Quota;
};
