import { and, count, eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import type { Bindings } from './bindings';
import type { ApiResponse } from '@canmi/artifacts';
import { failure, success } from './respond';
import { canonicalEmail } from './email';
import { findArticle, rootOf } from './root';
import { articleReads, likes, newsletterSubscriptions } from './schema';

const MAX_BODY_SIZE = 1_024;
const CANCEL_TOKEN = /^[0-9a-f]{32}$/;
const NO_STORE = { 'Cache-Control': 'no-store' } as const;
const JSON_LIMIT = bodyLimit({
	maxSize: MAX_BODY_SIZE,
	onError: (c) => failure(c, 413, 'body_too_large', NO_STORE),
});

const engagement = new Hono<{ Bindings: Bindings }>();

engagement.get('/engagement', async (c) => {
	const ip = clientIp(c.req.raw);
	if (!ip) return failure(c, 400, 'client_ip_unavailable', NO_STORE);
	if (!(await withinLimit(c.env.ENGAGEMENT_RATE_LIMITER, ip))) return rateLimited();

	const database = drizzle(c.env.DATABASE);
	const [subscriberCount, likeCount, like] = await Promise.all([
		rowCount(database, newsletterSubscriptions),
		rowCount(database, likes),
		database.select({ ip: likes.ip }).from(likes).where(eq(likes.ip, ip)).limit(1),
	]);

	return success(
		c,
		{ subscriber_count: subscriberCount, like_count: likeCount, liked: like.length === 1 },
		{ 'Cache-Control': 'private, no-cache' },
	);
});

engagement.post('/newsletter', JSON_LIMIT, async (c) => {
	const ip = clientIp(c.req.raw);
	if (!ip) return failure(c, 400, 'client_ip_unavailable', NO_STORE);
	if (!(await withinLimit(c.env.NEWSLETTER_RATE_LIMITER, ip))) {
		return rateLimited();
	}

	const body = await readObject(c.req.raw);
	const email = canonicalEmail(body?.email);
	if (!email) return failure(c, 400, 'invalid_email', NO_STORE);

	const cancelToken = randomToken();
	const cancelTokenHash = await sha256(cancelToken);
	const database = drizzle(c.env.DATABASE);
	const inserted = await database
		.insert(newsletterSubscriptions)
		.values({
			email,
			cancelTokenHash,
			ip,
			createdAt: Date.now(),
		})
		.onConflictDoNothing({ target: newsletterSubscriptions.email })
		.returning({ email: newsletterSubscriptions.email });
	const subscriberCount = await rowCount(database, newsletterSubscriptions);

	if (inserted.length === 0) {
		return success(c, { email, subscriber_count: subscriberCount }, NO_STORE);
	}
	return success(
		c,
		{ email, cancel_token: cancelToken, subscriber_count: subscriberCount },
		NO_STORE,
		201,
	);
});

engagement.delete('/newsletter', JSON_LIMIT, async (c) => {
	const ip = clientIp(c.req.raw);
	if (!ip) return failure(c, 400, 'client_ip_unavailable', NO_STORE);
	if (!(await withinLimit(c.env.NEWSLETTER_RATE_LIMITER, ip))) {
		return rateLimited();
	}

	const body = await readObject(c.req.raw);
	const email = canonicalEmail(body?.email);
	const token = body?.cancel_token;
	if (!email || typeof token !== 'string' || !CANCEL_TOKEN.test(token)) {
		return failure(c, 400, 'invalid_cancellation', NO_STORE);
	}

	const tokenHash = await sha256(token);
	const database = drizzle(c.env.DATABASE);
	const deleted = await database
		.delete(newsletterSubscriptions)
		.where(
			and(
				eq(newsletterSubscriptions.email, email),
				eq(newsletterSubscriptions.cancelTokenHash, tokenHash),
			),
		)
		.returning({ email: newsletterSubscriptions.email });
	if (deleted.length === 0) {
		return failure(c, 404, 'subscription_not_found', NO_STORE);
	}

	const subscriberCount = await rowCount(database, newsletterSubscriptions);
	return success(c, { cancelled: true, subscriber_count: subscriberCount }, NO_STORE);
});

engagement.put('/like', JSON_LIMIT, async (c) => {
	const ip = clientIp(c.req.raw);
	if (!ip) return failure(c, 400, 'client_ip_unavailable', NO_STORE);
	if (!(await withinLimit(c.env.LIKE_RATE_LIMITER, ip))) return rateLimited();

	const body = await readObject(c.req.raw);
	if (typeof body?.liked !== 'boolean') {
		return failure(c, 400, 'invalid_like', NO_STORE);
	}

	const database = drizzle(c.env.DATABASE);
	if (body.liked) {
		await database
			.insert(likes)
			.values({ ip, createdAt: Date.now() })
			.onConflictDoNothing({ target: likes.ip });
	} else {
		await database.delete(likes).where(eq(likes.ip, ip));
	}

	const likeCount = await rowCount(database, likes);
	return success(c, { liked: body.liked, like_count: likeCount }, NO_STORE);
});

/**
 * Count a read of one article, and answer with the count it now has.
 *
 * The slug rides in the body rather than the path because an article path contains a slash --
 * `development/rust-cargo-cranelift-tuning` -- and a route pattern that has to encode one is a
 * worse contract than the JSON body every other mutation here already uses.
 *
 * Which slugs exist comes from the published root, so the database never learns a slug from a
 * request, and a new article no longer needs a deploy of this worker to be countable.
 */
engagement.post('/read', JSON_LIMIT, async (c) => {
	const ip = clientIp(c.req.raw);
	if (!ip) return failure(c, 400, 'client_ip_unavailable', NO_STORE);
	// The coarse per-IP allowance, shared with the state endpoint: this is a read that happens
	// to leave a mark, and what it bounds is somebody walking every slug in turn.
	if (!(await withinLimit(c.env.ENGAGEMENT_RATE_LIMITER, ip))) return rateLimited();

	const body = await readObject(c.req.raw);
	const slug = body?.slug;
	if (typeof slug !== 'string' || !findArticle(await rootOf(c.env), slug)) {
		return failure(c, 404, 'unknown_article', NO_STORE);
	}

	const database = drizzle(c.env.DATABASE);
	// One IP counts a given article once a minute. Refusing the request would be the wrong
	// answer to it: the reader still needs the number to put on the page, and a second look
	// within the minute is the same read rather than a failure. So the count comes back
	// either way and only the increment is withheld.
	if (!(await withinLimit(c.env.READ_RATE_LIMITER, `${ip}:${slug}`))) {
		const [existing] = await database
			.select({ count: articleReads.count })
			.from(articleReads)
			.where(eq(articleReads.slug, slug))
			.limit(1);
		return success(c, { slug, read_count: existing?.count ?? 0 }, NO_STORE);
	}

	// Read and increment in one statement so two concurrent readers cannot land on the same
	// number, and so the row that did not exist yet is the first read rather than a special case.
	const [row] = await database
		.insert(articleReads)
		.values({ slug, count: 1 })
		.onConflictDoUpdate({
			target: articleReads.slug,
			set: { count: sql`${articleReads.count} + 1` },
		})
		.returning({ count: articleReads.count });

	return success(c, { slug, read_count: row?.count ?? 1 }, NO_STORE);
});

function clientIp(request: Request): string | undefined {
	return request.headers.get('CF-Connecting-IP') || undefined;
}

async function withinLimit(limiter: RateLimit, key: string): Promise<boolean> {
	return (await limiter.limit({ key })).success;
}

// A bare Response rather than `failure`, because it is built without a Context -- the envelope is
// still the one every other answer uses.
function rateLimited(): Response {
	return Response.json({ status: 'error', message: 'rate_limited' } satisfies ApiResponse<never>, {
		status: 429,
		headers: { ...NO_STORE, 'Retry-After': '60' },
	});
}

async function readObject(request: Request): Promise<Record<string, unknown> | undefined> {
	try {
		const body: unknown = await request.json();
		if (body && typeof body === 'object' && !Array.isArray(body)) {
			return body as Record<string, unknown>;
		}
	} catch {
		// A malformed or absent JSON body is handled as invalid input by the route.
	}
	return undefined;
}

function randomToken(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(16));
	return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function sha256(value: string): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
	return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

type Database = ReturnType<typeof drizzle>;
type CountableTable = typeof likes | typeof newsletterSubscriptions;

async function rowCount(database: Database, table: CountableTable): Promise<number> {
	const [result] = await database.select({ value: count() }).from(table);
	return result?.value ?? 0;
}

export default engagement;
