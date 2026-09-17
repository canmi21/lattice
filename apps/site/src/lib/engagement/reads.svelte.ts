import { browser, dev } from '$app/environment';
import { pageUrls } from '@canmi/urls';
import { createQuery } from '@tanstack/svelte-query';
import { jsonResponse } from './engagement.svelte';
import { QUERY_CACHE_MAX_AGE, QUERY_STALE_TIME } from '$lib/query';

export const READS_QUERY_KEY = 'reads';

export type Reads = {
	slug: string;
	read_count: number;
};

const apiUrl = pageUrls(dev).api;

/**
 * The article's read count, counting this visit as one of them.
 *
 * A query rather than a mutation, even though the request has an effect: mutations are never
 * persisted, and the number has to survive a reload, so it lands in the same query cache as
 * everything else instead. Counting is tied to the query firing, so refetch triggers are turned
 * off -- a read is opening the article, not returning to the tab. See spec/engagement.md for the
 * server's own deduplication.
 */
export function createReadsQuery(slug: () => string) {
	return createQuery(() => ({
		queryKey: [READS_QUERY_KEY, slug()],
		queryFn: () => countRead(slug()),
		enabled: browser,
		staleTime: QUERY_STALE_TIME,
		gcTime: QUERY_CACHE_MAX_AGE,
		refetchOnWindowFocus: false,
		refetchOnReconnect: false,
		retry: 1,
	}));
}

async function countRead(slug: string): Promise<Reads> {
	const response = await fetch(`${apiUrl}/read`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ slug }),
	});
	// The same opener the rest of engagement uses, so the envelope is read in one place and this
	// function checks only what a read answer should contain.
	const result = await jsonResponse<Reads>(response);
	if (result.slug !== slug || !Number.isSafeInteger(result.read_count) || result.read_count < 0) {
		throw new Error('invalid read response');
	}
	return result;
}
