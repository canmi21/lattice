/**
 * The one client cache, and the window it shares with the API.
 *
 * Five minutes because that is what the API's own `max-age` is: a browser holding an answer longer
 * than a shared cache would is claiming to know something it was not told. Three days of `gcTime`
 * is how long an answer stays worth restoring from storage after the tab is gone -- a different
 * question from whether it is still fresh, which is what the five minutes answers.
 */
import { browser } from '$app/environment';
import { PUBLICATION_DELAY } from '@canmi/cache';
import { QueryClient } from '@tanstack/svelte-query';

/** The publication delay itself, not a copy of it: see libs/cache for why there is one number. */
export const QUERY_STALE_TIME = PUBLICATION_DELAY * 1_000;

/**
 * How long an answer stays worth restoring after the tab is gone, which `@canmi/cache` does not
 * own: nothing stamps it on a response, and it answers retention rather than freshness.
 */
export const QUERY_CACHE_MAX_AGE = 3 * 24 * 60 * 60 * 1_000;

/**
 * One client for the whole browser, reachable without Svelte context.
 *
 * A component asks for it through the provider as usual. A universal `load` cannot: it runs before
 * any component and has no context, and it is where every corpus request starts -- so the cache
 * those requests share has to be a module-level thing rather than a component-level one.
 *
 * Created per call on the server, where a module-level client would be one cache shared by every
 * reader the isolate serves. See spec/engagement.md.
 */
let client: QueryClient | undefined;

export function queryClient(): QueryClient {
	const made = new QueryClient({
		defaultOptions: {
			queries: {
				staleTime: QUERY_STALE_TIME,
				gcTime: QUERY_CACHE_MAX_AGE,
			},
		},
	});
	if (!browser) return made;
	client ??= made;
	return client;
}
