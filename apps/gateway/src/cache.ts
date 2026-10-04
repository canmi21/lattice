/**
 * What the gateway keeps of an answer, for how long, and what it tells everything after it: the
 * route's declared lifetime for the kind of answer it is, and nothing else -- a service's own
 * `Cache-Control` is replaced, not read. Kept in the Cache API of the location that answered, so a
 * repeat is answered there without reaching the service. See spec/architecture/gateway.md, "A
 * lifetime is declared for five kinds of answer".
 */
import { UNCHANGING } from '@canmi/cache';
import type { Lifetime, Lifetimes } from './declaration.ts';

/** The header a kept answer is marked with, as it is returned. */
export const CACHE_HEADER = 'x-gateway-cache';

/** A year, which is what `immutable` keeps at the gateway itself. */
const YEAR = 31_536_000;

/**
 * Whether a request may be answered from, and stored in, the cache: a read, from nobody in
 * particular. A request carrying credentials is somebody's, and its answer may be theirs alone.
 */
export function cacheable(request: Request): boolean {
	if (request.method !== 'GET' && request.method !== 'HEAD') return false;
	return !request.headers.has('authorization') && !request.headers.has('cookie');
}

/** Which of the five an answer is: a `202` apart from every other `2xx`, and no answer a fault. */
export function kindOf(status: number, unreached = false): keyof Lifetimes {
	if (unreached || status >= 500) return 'faulted';
	if (status >= 400) return 'rejected';
	if (status >= 300) return 'redirected';
	return status === 202 ? 'accepted' : 'fulfilled';
}

/** Seconds to keep it here, or 0 for none. */
export function secondsOf(lifetime: Lifetime): number {
	return lifetime === 'immutable' ? YEAR : lifetime;
}

/** What an answer kept for `lifetime` tells a browser and every cache after the gateway. */
export function controlOf(lifetime: Lifetime): string {
	if (lifetime === 'immutable') return UNCHANGING;
	return lifetime > 0 ? `public, max-age=${lifetime}` : 'no-store';
}

/** The cache this location keeps, where there is one: a Worker has it, a test may not. */
export function store(): Cache | null {
	return typeof caches === 'undefined' ? null : (caches as unknown as { default: Cache }).default;
}

/** The key an answer is kept under: its full address, as a GET, whatever the method was. */
export function keyOf(url: URL): Request {
	return new Request(url.toString(), { method: 'GET' });
}

/** A copy to keep, marked as kept; its lifetime is already on the answer. */
export function toKeep(answer: Response): Response {
	const kept = new Response(answer.clone().body, answer);
	kept.headers.set(CACHE_HEADER, 'hit');
	return kept;
}
