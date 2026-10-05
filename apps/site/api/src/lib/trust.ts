import { and, eq, gt, lt } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import type { Context, MiddlewareHandler } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import type { Bindings } from '../bindings';
import { trustGrants } from '../data/schema';
import { failure } from './respond';

/**
 * A reader who passed Turnstile is trusted to write for a day. The proof is a `trust` cookie the
 * page cannot read, naming a grant the database keeps; `trust_until` says when it ends to the
 * page, which runs the check again only when it has. See spec/architecture/trust.md.
 */
export const TRUST_SECONDS = 24 * 60 * 60;
export const TRUST_COOKIE = 'trust';
export const TRUST_UNTIL_COOKIE = 'trust_until';

/** What Turnstile's tokens are checked against; the token itself is never kept. */
const SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/** The action the page's widget names, so a token minted for another purpose is refused. */
export const TRUST_ACTION = 'trust';

/** The longest token Turnstile issues. */
export const MAX_TOKEN_LENGTH = 2048;

/**
 * The routes a write may reach without trust: the check's own, and `batch`, which is a read sent
 * as a POST because its question does not fit a query -- and is asked by the server rendering a
 * page, which carries no reader's cookie.
 */
const UNGUARDED = new Set(['/verify', '/batch']);

const NO_STORE = { 'Cache-Control': 'no-store' } as const;

type Env = { Bindings: Bindings };

/** HMAC-SHA256 of `value` under `key`, base64url. */
async function sign(key: string, value: string): Promise<string> {
	const material = await crypto.subtle.importKey(
		'raw',
		new TextEncoder().encode(key),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign'],
	);
	const mac = new Uint8Array(
		await crypto.subtle.sign('HMAC', material, new TextEncoder().encode(value)),
	);
	return btoa(String.fromCharCode(...mac))
		.replaceAll('+', '-')
		.replaceAll('/', '_')
		.replace(/=+$/u, '');
}

/** The grant a `trust` cookie names, when it is signed by `key` and not yet past its end. */
export async function readTrust(
	key: string,
	cookie: string | undefined,
	now: number,
): Promise<{ id: string; expiresAt: number } | undefined> {
	const [id, end, mac] = cookie?.split('.') ?? [];
	if (!id || !end || !mac || !/^[0-9a-f]{32}$/u.test(id) || !/^\d+$/u.test(end)) return undefined;
	const expiresAt = Number(end);
	if (expiresAt <= now) return undefined;
	return (await sign(key, `${id}.${end}`)) === mac ? { id, expiresAt } : undefined;
}

/** A `trust` cookie for `id` until `expiresAt`, signed by `key`. */
export async function trustCookie(key: string, id: string, expiresAt: number): Promise<string> {
	const value = `${id}.${expiresAt}`;
	return `${value}.${await sign(key, value)}`;
}

/**
 * Whether the gate is on. It is off until the Turnstile secret is set, so the code can ship before
 * the widget exists without refusing every like; the log says so on every write it lets through.
 */
function gated(env: Bindings): env is Bindings & { TURNSTILE_SECRET: string; TRUST_KEY: string } {
	return Boolean(env.TURNSTILE_SECRET && env.TRUST_KEY);
}

/**
 * Every write needs trust; a read, and the routes in `UNGUARDED`, never do. A write without it is
 * `428 Precondition Required`, which the page answers by running the check and asking again.
 */
export const requireTrust: MiddlewareHandler<Env> = async (c, next) => {
	const { method } = c.req;
	if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return next();
	if (UNGUARDED.has(c.req.path)) return next();
	if (!gated(c.env)) {
		console.warn('trust: TURNSTILE_SECRET is unset, so a write passed unchecked');
		return next();
	}
	const now = Math.floor(Date.now() / 1000);
	const grant = await readTrust(c.env.TRUST_KEY, getCookie(c, TRUST_COOKIE), now);
	if (grant) {
		const kept = await drizzle(c.env.DATABASE)
			.select({ id: trustGrants.id })
			.from(trustGrants)
			.where(and(eq(trustGrants.id, grant.id), gt(trustGrants.expiresAt, now)))
			.limit(1);
		if (kept.length === 1) return next();
	}
	return failure(c, 428, 'invalid_token', NO_STORE, 'This write needs a passed check first');
};

interface Siteverify {
	success: boolean;
	hostname?: string;
	action?: string;
	'error-codes'?: string[];
}

/** A random id for a grant, 128 bits as hex. */
function grantId(): string {
	return [...crypto.getRandomValues(new Uint8Array(16))]
		.map((byte) => byte.toString(16).padStart(2, '0'))
		.join('');
}

/**
 * Check a Turnstile token with Siteverify and, when it passed, grant trust for a day: a row, and
 * the two cookies. The token is checked once and dropped; Siteverify refuses it a second time.
 */
export async function verify(c: Context<Env>, token: string): Promise<Response> {
	if (!gated(c.env)) return failure(c, 503, 'service_unavailable', NO_STORE);
	const asked = await fetch(SITEVERIFY, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			secret: c.env.TURNSTILE_SECRET,
			response: token,
			remoteip: c.req.header('CF-Connecting-IP'),
			idempotency_key: crypto.randomUUID(),
		}),
	}).catch(() => undefined);
	if (!asked?.ok) return failure(c, 502, 'upstream_unavailable', NO_STORE);
	const outcome = (await asked.json()) as Siteverify;
	// A test secret answers for a test hostname and no action, so only a real one is held to both.
	const real = !c.env.TURNSTILE_TEST;
	const host = new URL(c.req.url).hostname;
	if (
		!outcome.success ||
		(real && (outcome.hostname !== host || outcome.action !== TRUST_ACTION))
	) {
		return failure(c, 403, 'invalid_token', NO_STORE, 'The check did not pass');
	}

	const now = Math.floor(Date.now() / 1000);
	const id = grantId();
	const expiresAt = now + TRUST_SECONDS;
	const database = drizzle(c.env.DATABASE);
	await database.insert(trustGrants).values({
		id,
		expiresAt,
		createdAt: now,
		country: c.req.header('CF-IPCountry') ?? null,
	});
	// What has ended goes as something new begins, off the answer's path.
	c.executionCtx.waitUntil(
		database
			.delete(trustGrants)
			.where(lt(trustGrants.expiresAt, now))
			.then(() => undefined),
	);

	const secure = new URL(c.req.url).protocol === 'https:';
	setCookie(c, TRUST_COOKIE, await trustCookie(c.env.TRUST_KEY, id, expiresAt), {
		path: '/api',
		httpOnly: true,
		secure,
		sameSite: 'Lax',
		maxAge: TRUST_SECONDS,
	});
	setCookie(c, TRUST_UNTIL_COOKIE, String(expiresAt), {
		path: '/',
		secure,
		sameSite: 'Lax',
		maxAge: TRUST_SECONDS,
	});
	return c.json({ status: 'success', data: { trusted_until: expiresAt } }, 200, NO_STORE);
}
