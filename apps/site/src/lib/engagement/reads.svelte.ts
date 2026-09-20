import { browser, dev } from '$app/environment';
import { ReadAnswerSchema, unwrapAs, type ReadAnswer } from '@canmi/artifacts';
import { pageUrls } from '@canmi/urls';
import { createQuery } from '@tanstack/svelte-query';
import { askBatch } from '$lib/published';
import { createBatcher } from './batch';
import { QUERY_CACHE_MAX_AGE, QUERY_STALE_TIME } from '$lib/query';

export const READS_QUERY_KEY = 'reads';

export type Reads = ReadAnswer;

const apiUrl = pageUrls(dev).api;

/** Which articles this tab has already counted, so a refresh never counts a second time. */
const counted = new Set<string>();

/**
 * The read count, counted once and then watched.
 *
 * The first ask records the visit, every ask after it only looks up -- which is what lets this
 * refresh on a timer at all, since the query used to be `/read` and any refetch would have made
 * one reader into several. Focus and reconnect stay off, because returning to a tab is not opening
 * the article; the interval is the one trigger. See spec/engagement.md.
 */
export function createReadsQuery(slug: () => string, served: () => number | undefined = () => undefined) {
	return createQuery(() => ({
		queryKey: [READS_QUERY_KEY, slug()],
		queryFn: () => readsOf(slug()),
		enabled: browser,
		// A placeholder and not `initialData`: initial data is data, and data is fresh for
		// `staleTime` -- five minutes in which the visit would never be recorded, because
		// recording it is what the fetch does on the way to the answer.
		placeholderData: placeholderOf(slug(), served()),
		staleTime: QUERY_STALE_TIME,
		gcTime: QUERY_CACHE_MAX_AGE,
		// The same five minutes the answer is fresh for, so the timer asks exactly when the cached
		// copy stops being worth serving rather than on a cadence of its own.
		refetchInterval: QUERY_STALE_TIME,
		refetchIntervalInBackground: false,
		refetchOnWindowFocus: false,
		refetchOnReconnect: false,
		retry: 1,
	}));
}

/**
 * The served figure as something to draw, or nothing where there is nothing to draw.
 *
 * Absent rather than zero when the API would not answer: zero is a claim that nobody has read
 * this, and an article's metadata row is already written to leave the figure out entirely rather
 * than show one it does not have.
 */
function placeholderOf(slug: string, served: number | undefined): Reads | undefined {
	return served === undefined ? undefined : { slug, read_count: served };
}

/**
 * The count, recording the visit on the first ask and only looking it up afterwards.
 *
 * Exported because that split is the whole behaviour and is otherwise reachable only by waiting
 * out the refetch interval.
 */
export async function readsOf(slug: string): Promise<Reads> {
	if (!counted.has(slug)) {
		counted.add(slug);
		return countRead(slug);
	}
	const warm = warmedReads(slug);
	const count = (await lookupReads(slug)) ?? warm ?? 0;
	return { slug, read_count: count };
}

async function countRead(slug: string): Promise<Reads> {
	const response = await fetch(`${apiUrl}/read`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ slug }),
	});
	if (!response.ok) throw new Error(`read request failed with ${response.status}`);
	// Parsed against the schema the Worker answers to, then checked for the one thing a schema
	// cannot know: that this is the article that was asked about.
	const result = unwrapAs(ReadAnswerSchema, await response.json(), response.url);
	if (result.slug !== slug) throw new Error('read answer names another article');
	return result;
}

/**
 * How many times an article has been read, without it counting as one.
 *
 * The batch's `reads` question, not `/read`: this is the lookup and that is the visit. A card
 * being pointed at is not a reading of the article behind it, and a number that grew because a
 * pointer crossed a row would not be the number it claims to be. See spec/engagement.md.
 */
const lookupReads = createBatcher<number>({
	// Long enough that a pointer sweeping the list collapses into one request, short enough that
	// a reader who meant one card has the answer before they reach it.
	window: 60,
	// A batch is a POST body, so the ceiling is about what one answer should cost rather than
	// about a URL's length. The homepage lists fewer than this today; see the TODO there.
	limit: 24,
	run: async (slugs) => {
		const { reads } = await askBatch({ type: 'reads', slugs });
		return new Map(Object.entries(reads));
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
