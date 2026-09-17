/**
 * The one client cache, and the window it shares with the API.
 *
 * Five minutes because that is what the API's own `max-age` is: a browser holding an answer longer
 * than a shared cache would is claiming to know something it was not told. Three days of `gcTime`
 * is how long an answer stays worth restoring from storage after the tab is gone -- a different
 * question from whether it is still fresh, which is what the five minutes answers.
 */
import { browser } from '$app/environment';
import { QueryClient } from '@tanstack/svelte-query';

export const QUERY_STALE_TIME = 5 * 60 * 1_000;
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
