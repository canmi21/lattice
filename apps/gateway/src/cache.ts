/**
 * What the gateway keeps of an answer, and for how long: the service's own word when it gives one,
 * and the scope's otherwise. Kept in the Cache API of the location that answered, so a repeat is
 * answered there without reaching the node. See spec/architecture/services.md, "The gateway
 * keeps answers a while".
 */

/** How long an answer is kept when neither the service nor the scope says, in seconds. */
export const DEFAULT_LIFETIME = { success: 300, failure: 300 } as const;

/** The gateway's own failure to reach a service, kept briefly: it may be back soon. */
export const UNREACHED_SECONDS = 30;

/** A scope's say: how long a success and a failure are kept, or `false` for nothing kept. */
export type Lifetime = false | { readonly success?: number; readonly failure?: number };

/** The header a kept answer is marked with, as it is returned. */
export const CACHE_HEADER = 'x-gateway-cache';

/**
 * Whether a request may be answered from, and stored in, the cache: a read, from nobody in
 * particular. A request carrying credentials is somebody's, and its answer may be theirs alone.
 */
export function cacheable(request: Request): boolean {
	if (request.method !== 'GET' && request.method !== 'HEAD') return false;
	return !request.headers.has('authorization') && !request.headers.has('cookie');
}

/**
 * Seconds to keep an answer, or 0 for none. The service's `Cache-Control` wins where it says
 * anything; `lifetime` is the scope's otherwise, and `unreached` marks the gateway's own failure to
 * reach the service at all.
 */
export function secondsFor(
	answer: Response,
	lifetime: Lifetime | undefined,
	unreached = false,
): number {
	if (lifetime === false || answer.headers.has('set-cookie')) return 0;
	if (unreached) return UNREACHED_SECONDS;
	const control = answer.headers.get('cache-control')?.toLowerCase() ?? '';
	if (/(^|,)\s*(no-store|no-cache|private)\b/.test(control)) return 0;
	const stated = /(?:^|,)\s*(?:s-maxage|max-age)\s*=\s*(\d+)/.exec(control);
	if (stated) return Number(stated[1]);
	const ok = answer.status < 400;
	return (
		(ok ? lifetime?.success : lifetime?.failure) ??
		(ok ? DEFAULT_LIFETIME.success : DEFAULT_LIFETIME.failure)
	);
}

/** The cache this location keeps, where there is one: a Worker has it, a test may not. */
export function store(): Cache | null {
	return typeof caches === 'undefined' ? null : (caches as unknown as { default: Cache }).default;
}

/** The key an answer is kept under: its full address, as a GET, whatever the method was. */
export function keyOf(url: URL): Request {
	return new Request(url.toString(), { method: 'GET' });
}

/** A copy to keep, told how long to live; the answer returned is left as the service gave it. */
export function toKeep(answer: Response, seconds: number): Response {
	const kept = new Response(answer.clone().body, answer);
	kept.headers.set('cache-control', `public, max-age=${seconds}`);
	kept.headers.set(CACHE_HEADER, 'hit');
	return kept;
}
