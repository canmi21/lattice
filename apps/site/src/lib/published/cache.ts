/**
 * How an API answer is held, and how long past its life it may still answer a failure.
 *
 * Two layers. The isolate's own memo makes the hook and the load that follows it one request;
 * the colo cache outlives an isolate and is what actually keeps the site serving when the API
 * does not. Neither applies to a CDN object, which is immutable and needs no policy of its own.
 * See spec/architecture/artifacts.md, "The site keeps serving when the API does not".
 */

import { browser } from '$app/environment';
import { unwrap } from '@canmi/artifacts';
import { queryClient, QUERY_CACHE_MAX_AGE, QUERY_STALE_TIME } from '$lib/query';

type Fetch = typeof fetch;

type Held = { at: number; body: string };

/** The API's own max-age, restated: past it an answer is asked for again rather than served. */
export const FRESH_MS = 5 * 60 * 1_000;

/**
 * How old an answer may be and still be served when the API will not answer at all.
 *
 * Hours, because a root this old names objects that are all still there and still immutable, so
 * what it renders is a coherent older page rather than a broken one.
 */
export const STALE_MS = 3 * 60 * 60 * 1_000;

/** When this copy was taken. `Date` belongs to whichever cache wrote it, and is not ours. */
const STAMP = 'x-published-at';

/** Bounded, so a long-lived isolate cannot accumulate one entry per slug per locale forever. */
const MEMO_LIMIT = 64;

const memo = new Map<string, Held>();

/**
 * Stored where a body would be, so "no such thing" is cached rather than asked again.
 *
 * Exported because a batch learns the same fact: a rid the answer omits is a fact about the
 * corpus, and it keeps the publication delay like every other one. See
 * spec/architecture/resource.md, "Two failures, and only one of them is about the corpus".
 */
export const MISSING = '\u0000missing';

/** The colo cache, which only a Worker has: a browser's `caches` carries no `default`. */
function colo(): Cache | undefined {
	return (globalThis as { caches?: { default?: Cache } }).caches?.default;
}

function remember(url: string, body: string): void {
	memo.delete(url);
	memo.set(url, { at: Date.now(), body });
	for (const oldest of memo.keys()) {
		if (memo.size <= MEMO_LIMIT) break;
		memo.delete(oldest);
	}
}

async function held(url: string): Promise<Held | undefined> {
	const remembered = memo.get(url);
	if (remembered) return remembered;
	const stored = await colo()?.match(url);
	if (!stored) return undefined;
	const at = Number(stored.headers.get(STAMP));
	return at > 0 ? { at, body: await stored.text() } : undefined;
}

/**
 * Keep an answer for the whole stale window, not for its freshness.
 *
 * No edge cache honours `stale-if-error`, so what one is asked to hold is the outer window and
 * the age above decides the rest. A cache that refuses the write is not a failed request.
 */
async function store(url: string, body: string): Promise<void> {
	try {
		await colo()?.put(
			url,
			new Response(body, {
				headers: {
					'Content-Type': 'application/json',
					'Cache-Control': `public, max-age=${Math.round(STALE_MS / 1_000)}`,
					[STAMP]: String(Date.now()),
				},
			}),
		);
	} catch {
		return;
	}
}

/**
 * What this side already holds for a key, and how old it is, without asking upstream.
 *
 * The two caches answer differently and the caller does not care which: the Worker's memo and
 * colo store carry their own stamp, and the browser's query client has one already. `undefined`
 * is "nothing held", which is not the same as the `MISSING` body -- that one is an answer.
 */
export async function heldBody(url: string): Promise<{ body: string; age: number } | undefined> {
	if (browser) {
		const state = queryClient().getQueryState<string>(['api', url]);
		const body = state?.data;
		if (body === undefined) return undefined;
		return { body, age: Date.now() - state!.dataUpdatedAt };
	}
	const stored = await held(url);
	return stored ? { body: stored.body, age: Date.now() - stored.at } : undefined;
}

/**
 * Put a body where a later read of the same key will find it, whichever cache that is.
 *
 * The exact bytes, not a payload to wrap: what is stored has to be what the reader of that key
 * opens, so a copy written by a batch and one written by the fetch it saved are the same thing.
 */
export async function rememberBody(url: string, body: string): Promise<void> {
	if (browser) {
		queryClient().setQueryData(['api', url], body);
		return;
	}
	remember(url, body);
	await store(url, body);
}

/**
 * Put an answer the site already holds where `answer` will find it.
 *
 * A batch gets back something no single-answer URL was used to fetch. Writing each piece under the
 * URL it would have come from is what makes a warm worth anything: the fetch it was meant to save
 * never happens. The envelope goes back on, because a stale copy has to be opened by the same code
 * that opens a fresh one.
 */
export async function rememberAnswer<T>(url: string, payload: T): Promise<void> {
	// Into whichever cache `answer` would read from, which is not the same one on both sides.
	await rememberBody(url, JSON.stringify({ status: 'success', data: payload }));
}

/**
 * The browser's half: the same five minutes, held by the one cache everything else uses.
 *
 * `fetchQuery` is what the memo below does by hand -- serve what is fresh, share one request
 * between two callers -- except this cache is also the components', survives a reload, and can be
 * looked at. The memo stays for the Worker, which has no client and wants the colo cache. Stale
 * on failure is kept by hand: `fetchQuery` throws rather than hand back what it still holds.
 */
async function throughQuery<T>(
	fetch: Fetch,
	url: string,
	opened: (body: string) => T,
): Promise<T | undefined> {
	const client = queryClient();
	const queryKey = ['api', url];
	try {
		const body = await client.fetchQuery({
			queryKey,
			queryFn: async () => {
				const response = await fetch(url);
				// A 404 is an answer, so it is stored as one rather than thrown: throwing would
				// reach the stale copy and the document-navigation fallback, neither of which is
				// what "no such thing" means.
				if (response.status === 404) return MISSING;
				if (!response.ok) throw new Error(`${url} answered ${response.status}`);
				return response.text();
			},
			staleTime: QUERY_STALE_TIME,
			gcTime: QUERY_CACHE_MAX_AGE,
		});
		return body === MISSING ? undefined : opened(body);
	} catch (failure) {
		const held = client.getQueryData<string>(queryKey);
		if (held !== undefined && held !== MISSING) return opened(held);
		throw failure;
	}
}

/**
 * One API answer: fresh from upstream, or stale from a cache when upstream will not answer.
 *
 * `undefined` is "no such thing", which a 404 says and which is an ordinary event rather than a
 * failure. Anything else throws, and the caller decides what a failure costs.
 */
export async function answer<T>(fetch: Fetch, url: string): Promise<T | undefined> {
	// The envelope is opened here and nowhere else, so a caller receives the payload its own
	// route defines and never sees `status`. What is cached is the whole body, envelope included,
	// so a stale copy is opened by the same code that opened the fresh one.
	const opened = (body: string): T => unwrap<T>(JSON.parse(body), url);
	if (browser) return throughQuery<T>(fetch, url, opened);
	const previous = await held(url);
	const age = previous ? Date.now() - previous.at : Number.POSITIVE_INFINITY;
	if (previous && age < FRESH_MS) return opened(previous.body);
	try {
		const response = await fetch(url);
		// Before the failure check on purpose. A 404 is an answer, so it must never reach a stale
		// copy or the document-navigation fallback that a failure triggers.
		if (response.status === 404) return undefined;
		if (!response.ok) throw new Error(`${url} answered ${response.status}`);
		const body = await response.text();
		remember(url, body);
		await store(url, body);
		return opened(body);
	} catch (failure) {
		if (previous && age < STALE_MS) return opened(previous.body);
		throw failure;
	}
}
