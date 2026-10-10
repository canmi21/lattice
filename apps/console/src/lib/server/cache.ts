/**
 * The edge's cache of the backend's reads: each kept for as long as its own data takes to move --
 * runs five seconds, a span's minutes until the next whole minute, the primary half a minute -- and
 * nothing kept but a read that answered. Lost at any moment, it costs a read and nothing else; a
 * request that asks `Cache-Control: no-cache`, as a hard reload and a read after the console's own
 * write do, goes to the backend and keeps what it brings. See spec/architecture/console.md, "The
 * console's server never waits on data; it only draws".
 */

/** Where reads are kept: Cloudflare's cache, shared by the isolates of one place, or a map. */
export interface Store {
	get(key: string): Promise<unknown>;
	put(key: string, value: unknown, seconds: number): Promise<void>;
}

/**
 * A key's address in the cache: under the console's own origin, at a path no route answers, so
 * nothing but this store ever reads or writes it.
 */
const addressOf = (origin: string, key: string) => `${origin}/_cache/${encodeURIComponent(key)}`;

function edgeStore(cache: Cache, origin: string): Store {
	return {
		async get(key) {
			const hit = await cache.match(addressOf(origin, key));
			return hit ? hit.json() : undefined;
		},
		put: (key, value, seconds) =>
			cache.put(
				addressOf(origin, key),
				new Response(JSON.stringify(value), {
					headers: { 'content-type': 'application/json', 'cache-control': `max-age=${seconds}` },
				}),
			),
	};
}

/** Development's, in the one process `vite dev` runs, which has no Cloudflare cache. */
export function memoryStore(): Store {
	const held = new Map<string, { until: number; value: unknown }>();
	return {
		get: async (key) => {
			const one = held.get(key);
			return one && one.until > Date.now() ? one.value : undefined;
		},
		put: async (key, value, seconds) => {
			held.set(key, { until: Date.now() + seconds * 1000, value });
		},
	};
}

let memory: Store | undefined;

/**
 * The store this runtime has: the Cloudflare cache in a Worker, a map under `vite dev`, whose
 * platform stands in a `caches` that keeps nothing.
 */
export function storeOf(dev: boolean, origin: string): Store | undefined {
	if (dev) return (memory ??= memoryStore());
	const caches = (globalThis as { caches?: CacheStorage & { default?: Cache } }).caches;
	return caches?.default ? edgeStore(caches.default, origin) : undefined;
}

/** Whether a request asks past every cache: a hard reload, or a read after a write. */
export const asksFresh = (request: Request): boolean =>
	/no-cache/i.test(request.headers.get('cache-control') ?? '') ||
	/no-cache/i.test(request.headers.get('pragma') ?? '');

/** Seconds until the next whole minute, the most a span's minutes stay what they were. */
export const toMinute = (now = Date.now()): number =>
	Math.max(1, Math.ceil((60_000 - (now % 60_000)) / 1000));

/**
 * `read`'s answer, from the store where it holds one still fresh and `fresh` does not ask past it;
 * otherwise read, and kept for `seconds` where `keep` says it is worth keeping.
 */
export async function kept<T>(
	where: { store?: Store; fresh?: boolean },
	key: string,
	seconds: number,
	read: () => Promise<T>,
	keep: (value: T) => boolean,
): Promise<T> {
	const { store, fresh } = where;
	if (!store) return read();
	if (!fresh) {
		const hit = (await store.get(key).catch(() => undefined)) as T | undefined;
		if (hit !== undefined) return hit;
	}
	const answer = await read();
	if (keep(answer)) await store.put(key, answer, seconds).catch(() => {});
	return answer;
}
