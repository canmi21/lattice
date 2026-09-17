import { browser, dev } from '$app/environment';
import { unwrap, type LikedAnswer, type StatsAnswer } from '@canmi/artifacts';
import { pageUrls } from '@canmi/urls';
import { createMutation, createQuery, useQueryClient } from '@tanstack/svelte-query';
import { QUERY_CACHE_MAX_AGE, QUERY_STALE_TIME } from '$lib/query';

/**
 * Two keys, because the two answers are not the same kind of fact.
 *
 * The counters belong to the site, are shared-cacheable and are rendered on the server. Whether
 * this visitor has liked belongs to them alone, is never shared and cannot exist before the
 * browser asks. One key held both and made the pair as private as its most private half.
 */
export const STATS_QUERY_KEY = ['stats'] as const;
export const LIKED_QUERY_KEY = ['liked'] as const;

export type Engagement = StatsAnswer;

type NewsletterResult = {
	email: string;
	cancel_token?: string;
	subscriber_count: number;
};

type CancelResult = {
	subscriber_count?: number;
};

/** What the browser holds about its own subscription. See spec/engagement.md. */
export type Subscription = {
	email: string;
	cancel_token: string;
};

const SUBSCRIPTION_KEY = 'email';
const CANCEL_TOKEN = /^[0-9a-f]{32}$/;

type LikeResult = {
	like_count: number;
	liked: boolean;
};

const apiUrl = pageUrls(dev).api;

/**
 * The two public counters, seeded with what the server already rendered.
 *
 * `initialData` and not a fetch on mount: the number is in the HTML, and asking again on every
 * hydration would spend a request to confirm what the reader is already looking at. The stamp
 * beside it is what makes that honest -- the copy is as old as the page, so the five minutes it
 * shares with the API run from when the page was rendered.
 */
export function createStatsQuery(rendered: () => StatsAnswer | undefined) {
	const at = browser ? Date.now() : undefined;
	return createQuery(() => ({
		queryKey: STATS_QUERY_KEY,
		queryFn: fetchStats,
		enabled: browser,
		initialData: rendered(),
		initialDataUpdatedAt: rendered() ? at : undefined,
		staleTime: QUERY_STALE_TIME,
		gcTime: QUERY_CACHE_MAX_AGE,
		retry: 1,
	}));
}

/**
 * Whether this visitor has already liked, asked once the browser exists.
 *
 * Never persisted: everything else here survives a reload in `localStorage`, and this must not --
 * it is keyed by an address the reader may not still have, and a heart wrongly marked is worse
 * than one that takes a moment to arrive. The heart is unmarked until this answers.
 */
export function createLikedQuery() {
	return createQuery(() => ({
		queryKey: LIKED_QUERY_KEY,
		queryFn: fetchLiked,
		enabled: browser,
		staleTime: QUERY_STALE_TIME,
		gcTime: QUERY_CACHE_MAX_AGE,
		meta: { persist: false },
		retry: 1,
	}));
}

export function createNewsletterMutation() {
	const client = useQueryClient();
	return createMutation<NewsletterResult, Error, string>(() => ({
		mutationFn: subscribe,
		onSuccess: (result) => {
			if (result.cancel_token) rememberSubscription(result.email, result.cancel_token);
			client.setQueryData<StatsAnswer>(STATS_QUERY_KEY, (current) => ({
				subscriber_count: result.subscriber_count,
				like_count: current?.like_count ?? 0,
			}));
		},
	}));
}

export function createCancelMutation() {
	const client = useQueryClient();
	return createMutation<CancelResult, Error, Subscription>(() => ({
		mutationFn: cancel,
		onSuccess: (result) => {
			forgetSubscription();
			if (result.subscriber_count === undefined) return;
			client.setQueryData<StatsAnswer>(STATS_QUERY_KEY, (current) => ({
				subscriber_count: result.subscriber_count ?? 0,
				like_count: current?.like_count ?? 0,
			}));
		},
		onSettled: () => client.invalidateQueries({ queryKey: STATS_QUERY_KEY }),
	}));
}

/**
 * Taking or giving back a like, drawn before the server has agreed.
 *
 * Two caches move together now: the count is the site's and the mark is the reader's, and a click
 * changes both. Rolled back together too -- a failure that restored one and not the other would
 * leave a marked heart beside a count that never moved.
 */
export function createLikeMutation() {
	const client = useQueryClient();
	type Rollback = { stats?: StatsAnswer; liked?: LikedAnswer };
	return createMutation<LikeResult, Error, boolean, Rollback>(() => ({
		mutationFn: setLike,
		onMutate: async (liked) => {
			await Promise.all([
				client.cancelQueries({ queryKey: STATS_QUERY_KEY }),
				client.cancelQueries({ queryKey: LIKED_QUERY_KEY }),
			]);
			const previous: Rollback = {
				stats: client.getQueryData<StatsAnswer>(STATS_QUERY_KEY),
				liked: client.getQueryData<LikedAnswer>(LIKED_QUERY_KEY),
			};
			const was = previous.liked?.liked ?? false;
			client.setQueryData<StatsAnswer>(STATS_QUERY_KEY, (current) => ({
				subscriber_count: current?.subscriber_count ?? 0,
				like_count: Math.max(0, (current?.like_count ?? 0) + (liked === was ? 0 : liked ? 1 : -1)),
			}));
			client.setQueryData<LikedAnswer>(LIKED_QUERY_KEY, { liked });
			return previous;
		},
		onError: (_error, _liked, context) => {
			if (context?.stats) client.setQueryData(STATS_QUERY_KEY, context.stats);
			else client.removeQueries({ queryKey: STATS_QUERY_KEY, exact: true });
			if (context?.liked) client.setQueryData(LIKED_QUERY_KEY, context.liked);
			else client.removeQueries({ queryKey: LIKED_QUERY_KEY, exact: true });
		},
		onSuccess: (result) => {
			client.setQueryData<StatsAnswer>(STATS_QUERY_KEY, (current) => ({
				subscriber_count: current?.subscriber_count ?? 0,
				like_count: result.like_count,
			}));
			client.setQueryData<LikedAnswer>(LIKED_QUERY_KEY, { liked: result.liked });
		},
		onSettled: () => {
			void client.invalidateQueries({ queryKey: STATS_QUERY_KEY });
			void client.invalidateQueries({ queryKey: LIKED_QUERY_KEY });
		},
	}));
}

async function fetchStats(): Promise<StatsAnswer> {
	const result = await jsonResponse<StatsAnswer>(await fetch(`${apiUrl}/stats`));
	if (!validCount(result.subscriber_count) || !validCount(result.like_count)) {
		throw new Error('invalid stats response');
	}
	return result;
}

async function fetchLiked(): Promise<LikedAnswer> {
	const result = await jsonResponse<LikedAnswer>(await fetch(`${apiUrl}/liked`));
	if (typeof result.liked !== 'boolean') throw new Error('invalid liked response');
	return result;
}

async function subscribe(email: string): Promise<NewsletterResult> {
	const response = await fetch(`${apiUrl}/newsletter`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ email }),
	});
	const result = await jsonResponse<NewsletterResult>(response);
	if (
		typeof result.email !== 'string' ||
		!validCount(result.subscriber_count) ||
		(result.cancel_token !== undefined && !CANCEL_TOKEN.test(result.cancel_token))
	) {
		throw new Error('invalid newsletter response');
	}
	return result;
}

async function cancel(subscription: Subscription): Promise<CancelResult> {
	const response = await fetch(`${apiUrl}/newsletter`, {
		method: 'DELETE',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(subscription),
	});
	// A subscription the server no longer has is the state being asked for, not a failure. The
	// record is stale -- most likely cancelled from another browser -- and reporting an error
	// would leave the reader looking at a subscription they cannot get rid of.
	if (response.status === 404) return {};

	const result = await jsonResponse<CancelResult>(response);
	if (!validCount(result.subscriber_count)) throw new Error('invalid cancellation response');
	return result;
}

async function setLike(liked: boolean): Promise<LikeResult> {
	const response = await fetch(`${apiUrl}/like`, {
		method: 'PUT',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ liked }),
	});
	const result = await jsonResponse<LikeResult>(response);
	if (typeof result.liked !== 'boolean' || !validCount(result.like_count)) {
		throw new Error('invalid like response');
	}
	return result;
}

/**
 * The one place an engagement answer is opened.
 *
 * `unwrap` decides whether the call worked; every caller below checks only the shape of what it
 * asked for. See libs/artifacts, `ApiResponse`.
 */
export async function jsonResponse<T>(response: Response): Promise<T> {
	if (!response.ok) throw new Error(`engagement request failed with ${response.status}`);
	return unwrap<T>(await response.json(), response.url);
}

function validCount(value: unknown): value is number {
	return Number.isSafeInteger(value) && (value as number) >= 0;
}

function rememberSubscription(email: string, cancelToken: string): void {
	if (!browser) return;
	try {
		localStorage.setItem(SUBSCRIPTION_KEY, JSON.stringify({ email, cancel_token: cancelToken }));
	} catch {
		// Storage can be unavailable in privacy modes. The server-side subscription still worked.
	}
}

/**
 * Only ever called after mount: this record is the reader's own device state, so the server
 * cannot render it and must not try.
 */
export function readSubscription(): Subscription | undefined {
	if (!browser) return undefined;
	let stored: string | null = null;
	try {
		stored = localStorage.getItem(SUBSCRIPTION_KEY);
	} catch {
		return undefined;
	}
	if (stored === null) return undefined;

	try {
		const record: unknown = JSON.parse(stored);
		if (!record || typeof record !== 'object') return undefined;
		const { email, cancel_token: token } = record as Partial<Subscription>;
		// A token that cannot be spent is worse than none: it would render an unsubscribe control
		// whose every use fails. An unreadable record is dropped rather than shown.
		if (
			typeof email !== 'string' ||
			!email ||
			typeof token !== 'string' ||
			!CANCEL_TOKEN.test(token)
		) {
			forgetSubscription();
			return undefined;
		}
		return { email, cancel_token: token };
	} catch {
		forgetSubscription();
		return undefined;
	}
}

export function forgetSubscription(): void {
	if (!browser) return;
	try {
		localStorage.removeItem(SUBSCRIPTION_KEY);
	} catch {
		// Nothing to do: the record is unreachable, which is the state being asked for.
	}
}
