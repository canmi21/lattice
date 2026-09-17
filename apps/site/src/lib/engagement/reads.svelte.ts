import { browser, dev } from '$app/environment';
import type { ReadsAnswer } from '@canmi/artifacts';
import { pageUrls } from '@canmi/urls';
import { createQuery } from '@tanstack/svelte-query';
import { createBatcher } from './batch';
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

/**
 * How many times an article has been read, without it counting as one.
 *
 * `/read-counts` and not `/read`: this is the lookup, and the other one is the visit. A card being
 * pointed at is not a reading of the article behind it, and a number that grew because a pointer
 * crossed a row would be a different number than the one it claims to be. See spec/engagement.md.
 */
const lookupReads = createBatcher<number>({
	// Long enough that a pointer sweeping the list collapses into one request, short enough that
	// a reader who meant one card has the answer before they reach it.
	window: 60,
	// A batch is a POST body, so the ceiling is about what one answer should cost rather than
	// about a URL's length. The homepage lists fewer than this today; see the TODO there.
	limit: 24,
	run: async (slugs) => {
		const response = await fetch(`${apiUrl}/read-counts`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ slugs }),
		});
		const { reads } = await jsonResponse<ReadsAnswer>(response);
		return new Map(
			Object.entries(reads).filter(([, count]) => Number.isSafeInteger(count) && count >= 0),
		);
	},
});

/**
 * What has already been looked up, so a warmed count can be drawn before the visit is recorded.
 *
 * Browser-only state, for the reason the chosen locale is: a module-level value on the server is
 * shared by every request it handles. Nothing reads this during SSR.
 */
const warmed = new Map<string, number>();

/** Ask for a count and remember it. Failure is silence: a warm is not a request a reader made. */
export async function warmReads(slug: string): Promise<void> {
	if (!browser || warmed.has(slug)) return;
	try {
		const count = await lookupReads(slug);
		if (count !== undefined) warmed.set(slug, count);
	} catch {
		// The article's own request will ask again, and it is the one whose answer is drawn.
	}
}

/** The warmed count for an article, if a pointer reached it before the reader did. */
export function warmedReads(slug: string): number | undefined {
	return browser ? warmed.get(slug) : undefined;
}
