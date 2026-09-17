import { URLS } from '@canmi/urls';
import { Miniflare } from 'miniflare';
import { standUpDatabase } from './d1.harness';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import app from './app';
import type { Bindings } from './bindings';
import { forgetRoot } from './root';
import { unwrap } from '@canmi/artifacts';

/**
 * The payload inside an answer, so a test asserts what a route returns rather than the envelope
 * every route shares. `unwrap` is the same one the site uses; a route that stops wrapping fails
 * here first. See libs/artifacts, `ApiResponse`.
 */
async function payload<T = unknown>(response: Response): Promise<T> {
	return unwrap<T>(await response.json(), response.url || 'test');
}

const IP_ONE = '203.0.113.10';
const IP_TWO = '2001:db8::20';
const allow: RateLimit = { limit: async () => ({ success: true }) };

const SLUG = 'architecture/compile-time-rendering';
/** A second published article, so a batch can hold one that has been read and one that has not. */
const UNREAD_SLUG = 'mirror/friends-come-in-phases';

/** Enough of a root for the read counter to recognise these two slugs and refuse every other. */
const ROOT = {
	version: 1,
	generated: '2026-01-02T00:00:00.000Z',
	articles: [
		{
			path: SLUG,
			url: `${URLS.apps.production.site}/${SLUG}`,
			markdown: 'b'.repeat(32),
			alternates: [],
			canonical_urls: [`${URLS.apps.production.site}/${SLUG}`],
			views: {},
		},
		{
			path: UNREAD_SLUG,
			url: `${URLS.apps.production.site}/${UNREAD_SLUG}`,
			markdown: 'd'.repeat(32),
			alternates: [],
			canonical_urls: [`${URLS.apps.production.site}/${UNREAD_SLUG}`],
			views: {},
		},
	],
	pages: {},
	feeds: {},
	llms: 'c'.repeat(32),
};

// `read` takes whichever store is bound, so a fetcher answering with the root is the whole of
// what these routes need from one. See libs/store.
const store = {
	fetch: async () => new Response(JSON.stringify(ROOT)),
} as unknown as Bindings['ASSETS'];

let miniflare: Miniflare;
let database: Awaited<ReturnType<Miniflare['getD1Database']>>;

beforeAll(async () => {
	({ miniflare, database } = await standUpDatabase());
});

beforeEach(async () => {
	forgetRoot();
	await database.batch([
		database.prepare('DELETE FROM newsletter_subscriptions'),
		database.prepare('DELETE FROM likes'),
		database.prepare('DELETE FROM article_reads'),
	]);
});

afterAll(async () => {
	await miniflare.dispose();
});

describe('newsletter', () => {
	it('canonicalizes and deduplicates by email without exposing an existing token', async () => {
		const first = await api('/newsletter', {
			method: 'POST',
			ip: IP_ONE,
			body: { email: ' Alice+notes@Example.com ' },
		});
		expect(first.status).toBe(201);
		const created = await payload<{
			email: string;
			cancel_token: string;
			subscriber_count: number;
		}>(first);
		expect(created).toMatchObject({ email: 'alice@example.com', subscriber_count: 1 });
		expect(created.cancel_token).toMatch(/^[0-9a-f]{32}$/);

		const stored = await database
			.prepare('SELECT email, cancel_token_hash, ip FROM newsletter_subscriptions WHERE email = ?')
			.bind(created.email)
			.first<{ email: string; cancel_token_hash: string; ip: string }>();
		expect(stored).toMatchObject({ email: created.email, ip: IP_ONE });
		expect(stored?.cancel_token_hash).toMatch(/^[a-f0-9]{64}$/);
		expect(stored?.cancel_token_hash).not.toBe(created.cancel_token);

		const duplicate = await api('/newsletter', {
			method: 'POST',
			ip: IP_TWO,
			body: { email: 'alice+different@example.com' },
		});
		expect(duplicate.status).toBe(200);
		expect(await payload(duplicate)).toEqual({
			email: 'alice@example.com',
			subscriber_count: 1,
		});

		const unchanged = await database
			.prepare('SELECT ip FROM newsletter_subscriptions WHERE email = ?')
			.bind(created.email)
			.first<{ ip: string }>();
		expect(unchanged?.ip).toBe(IP_ONE);
	});

	it('cancels only with the capability token', async () => {
		const created = await payload<{ cancel_token: string }>(
			await api('/newsletter', {
				method: 'POST',
				ip: IP_ONE,
				body: { email: 'reader@example.com' },
			}),
		);

		const denied = await api('/newsletter', {
			method: 'DELETE',
			ip: IP_TWO,
			body: { email: 'reader@example.com', cancel_token: '0'.repeat(32) },
		});
		expect(denied.status).toBe(404);

		const cancelled = await api('/newsletter', {
			method: 'DELETE',
			ip: IP_TWO,
			body: { email: 'READER+tag@example.com', cancel_token: created.cancel_token },
		});
		expect(cancelled.status).toBe(200);
		expect(await payload(cancelled)).toEqual({ cancelled: true, subscriber_count: 0 });
	});
});

describe('likes and engagement state', () => {
	it('allows one active like per raw IP and returns per-IP state', async () => {
		const first = await api('/like', { method: 'PUT', ip: IP_ONE, body: { liked: true } });
		expect(await payload(first)).toEqual({ liked: true, like_count: 1 });

		const repeated = await api('/like', { method: 'PUT', ip: IP_ONE, body: { liked: true } });
		expect(await payload(repeated)).toEqual({ liked: true, like_count: 1 });

		const second = await api('/like', { method: 'PUT', ip: IP_TWO, body: { liked: true } });
		expect(await payload(second)).toEqual({ liked: true, like_count: 2 });

		// Two answers now, because one belongs to the site and the other to whoever is asking.
		const counts = await api('/stats', { ip: IP_ONE });
		expect(counts.headers.get('Cache-Control')).toBe('public, max-age=300');
		expect(await payload(counts)).toEqual({ subscriber_count: 0, like_count: 2 });

		const mine = await api('/liked', { ip: IP_ONE });
		expect(mine.headers.get('Cache-Control')).toBe('private, no-cache');
		expect(await payload(mine)).toEqual({ liked: true });
		// The same question from another address is a different answer, which is why it is not
		// shared and never rendered on the server.
		expect(await payload(await api('/liked', { ip: '198.51.100.7' }))).toEqual({ liked: false });

		const removed = await api('/like', { method: 'PUT', ip: IP_ONE, body: { liked: false } });
		expect(await payload(removed)).toEqual({ liked: false, like_count: 1 });
	});

	it('returns a retry hint when Cloudflare rejects a mutation', async () => {
		const deny: RateLimit = { limit: async () => ({ success: false }) };
		const response = await api(
			'/like',
			{ method: 'PUT', ip: IP_ONE, body: { liked: true } },
			{ LIKE_RATE_LIMITER: deny },
		);
		expect(response.status).toBe(429);
		expect(response.headers.get('Retry-After')).toBe('60');
		expect(await response.json()).toEqual({ status: 'error', message: 'rate_limited' });
	});

	it('rate limits the read-heavy state endpoints separately', async () => {
		const deny: RateLimit = { limit: async () => ({ success: false }) };
		expect((await api('/stats', { ip: IP_ONE }, { ENGAGEMENT_RATE_LIMITER: deny })).status).toBe(
			429,
		);
		expect((await api('/liked', { ip: IP_ONE }, { ENGAGEMENT_RATE_LIMITER: deny })).status).toBe(
			429,
		);
	});

	// The counters are about the site, so an unattributable request is answered rather than
	// refused -- a shared cache asking on everyone's behalf carries no address of its own.
	it('answers the counters without a client address, and refuses the personal one', async () => {
		const anonymous = await app.fetch(
			new Request(`${URLS.apps.production.api}/stats`, {
				headers: { Origin: URLS.apps.production.site },
			}),
			{
				DATABASE: database as unknown as Bindings['DATABASE'],
				ENGAGEMENT_RATE_LIMITER: allow,
			} as Bindings,
		);
		expect(anonymous.status).toBe(200);
		expect(await payload(anonymous)).toEqual({ subscriber_count: 0, like_count: 0 });
	});
});

describe('read counts', () => {
	it('answers a count per slug, in one query, and drops a slug that names no article', async () => {
		await database
			.prepare('INSERT INTO article_reads (slug, count) VALUES (?, ?)')
			.bind(SLUG, 42)
			.run();

		const response = await api('/read-counts', {
			method: 'POST',
			ip: IP_ONE,
			body: { slugs: [SLUG, UNREAD_SLUG, 'made/up'] },
		});
		expect(response.status).toBe(200);
		expect(response.headers.get('Cache-Control')).toBe('no-store');
		// Zero for an article nobody has opened, and nothing at all for one that does not exist.
		expect(await payload(response)).toEqual({
			reads: { [SLUG]: 42, [UNREAD_SLUG]: 0 },
		});
	});

	it('counts nothing, because asking is not reading', async () => {
		await api('/read-counts', { method: 'POST', ip: IP_ONE, body: { slugs: [SLUG] } });
		const rows = await database
			.prepare('SELECT count(*) as rows FROM article_reads')
			.all<{ rows: number }>();
		expect(rows.results[0]?.rows).toBe(0);
	});

	it('refuses a body that is not a list of slugs', async () => {
		const response = await api('/read-counts', {
			method: 'POST',
			ip: IP_ONE,
			body: { slugs: 'architecture/one' },
		});
		expect(response.status).toBe(400);
	});
});

describe('article reads', () => {
	const slug = SLUG;

	it('counts from the first read and answers with the running total', async () => {
		const first = await api('/read', { method: 'POST', ip: IP_ONE, body: { slug } });
		expect(first.status).toBe(200);
		expect(await payload(first)).toEqual({ slug, read_count: 1 });

		const second = await api('/read', { method: 'POST', ip: IP_TWO, body: { slug } });
		expect(await payload(second)).toEqual({ slug, read_count: 2 });
	});

	it('refuses a slug that does not name an article', async () => {
		const response = await api('/read', {
			method: 'POST',
			ip: IP_ONE,
			body: { slug: 'made/up' },
		});
		expect(response.status).toBe(404);
		expect(await response.json()).toEqual({ status: 'error', message: 'unknown_article' });

		const rows = await database
			.prepare('SELECT COUNT(*) AS rows FROM article_reads')
			.first<{ rows: number }>();
		expect(rows?.rows).toBe(0);
	});

	// A second look inside the minute is the same read. The reader still needs the number to
	// put on the page, so the request is answered rather than refused.
	it('returns the unchanged count instead of an error once deduplicated', async () => {
		await api('/read', { method: 'POST', ip: IP_ONE, body: { slug } });

		const deny: RateLimit = { limit: async () => ({ success: false }) };
		const repeated = await api(
			'/read',
			{ method: 'POST', ip: IP_ONE, body: { slug } },
			{ READ_RATE_LIMITER: deny },
		);
		expect(repeated.status).toBe(200);
		expect(await payload(repeated)).toEqual({ slug, read_count: 1 });
	});

	it('reports an unread article as zero rather than creating its row', async () => {
		const deny: RateLimit = { limit: async () => ({ success: false }) };
		const response = await api(
			'/read',
			{ method: 'POST', ip: IP_ONE, body: { slug } },
			{ READ_RATE_LIMITER: deny },
		);
		expect(await payload(response)).toEqual({ slug, read_count: 0 });

		const rows = await database
			.prepare('SELECT COUNT(*) AS rows FROM article_reads')
			.first<{ rows: number }>();
		expect(rows?.rows).toBe(0);
	});

	it('rejects an IP walking every slug in turn', async () => {
		const deny: RateLimit = { limit: async () => ({ success: false }) };
		const response = await api(
			'/read',
			{ method: 'POST', ip: IP_ONE, body: { slug } },
			{ ENGAGEMENT_RATE_LIMITER: deny },
		);
		expect(response.status).toBe(429);
	});
});

type ApiOptions = {
	method?: string;
	ip: string;
	body?: Record<string, unknown>;
};

async function api(
	path: string,
	options: ApiOptions,
	overrides: Partial<Bindings> = {},
): Promise<Response> {
	const bindings = {
		ASSETS: store,
		DATABASE: database as unknown as Bindings['DATABASE'],
		ENGAGEMENT_RATE_LIMITER: allow,
		NEWSLETTER_RATE_LIMITER: allow,
		LIKE_RATE_LIMITER: allow,
		READ_RATE_LIMITER: allow,
		...overrides,
	} satisfies Bindings;
	return app.fetch(
		new Request(`${URLS.apps.production.api}${path}`, {
			method: options.method,
			headers: {
				'CF-Connecting-IP': options.ip,
				'Content-Type': 'application/json',
				Origin: URLS.apps.production.site,
			},
			body: options.body ? JSON.stringify(options.body) : undefined,
		}),
		bindings,
	);
}
