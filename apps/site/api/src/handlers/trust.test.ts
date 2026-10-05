import { URLS } from '@monoflake/sdk';
import { Miniflare } from 'miniflare';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import app from '../app';
import type { Bindings } from '../bindings';
import { readTrust, TRUST_COOKIE, TRUST_SECONDS, trustCookie } from '../lib/trust';
import { standUpDatabase } from '../testing/d1.harness';
import type { Quota } from '@monoflake/sdk/limits';

const KEY = 'test-key';
const ID = 'a'.repeat(32);
const IP = '203.0.113.10';
const allow: Quota = { take: async () => ({ allowed: true, retryAfter: 0 }) };
const context = {
	waitUntil: () => {},
	passThroughOnException: () => {},
	props: {},
} as unknown as ExecutionContext;

let miniflare: Miniflare;
let database: Awaited<ReturnType<Miniflare['getD1Database']>>;

beforeAll(async () => {
	({ miniflare, database } = await standUpDatabase());
});

beforeEach(async () => {
	await database.batch([
		database.prepare('DELETE FROM trust_grants'),
		database.prepare('DELETE FROM likes'),
	]);
});

afterEach(() => vi.unstubAllGlobals());

afterAll(async () => {
	await miniflare.dispose();
});

function env(gated: boolean): Bindings {
	return {
		DATABASE: database,
		QUOTA: allow,
		...(gated ? { TURNSTILE_SECRET: 'secret', TRUST_KEY: KEY } : {}),
	} as unknown as Bindings;
}

function ask(path: string, init: RequestInit, bindings: Bindings, cookie?: string) {
	const headers = new Headers(init.headers);
	headers.set('CF-Connecting-IP', IP);
	if (cookie) headers.set('Cookie', cookie);
	return app.request(
		`${URLS.apps.production.site}${path}`,
		{ ...init, headers },
		bindings,
		context,
	);
}

/** Siteverify, answering `outcome` once. */
function siteverify(outcome: Record<string, unknown>) {
	vi.stubGlobal(
		'fetch',
		vi.fn(async () => new Response(JSON.stringify(outcome))),
	);
}

const like = { method: 'PUT', body: JSON.stringify({ liked: true }) };

describe('the trust cookie', () => {
	it('reads back what it signed, and nothing tampered with or past its end', async () => {
		const now = 1_000;
		const cookie = await trustCookie(KEY, ID, now + 60);
		expect(await readTrust(KEY, cookie, now)).toEqual({ id: ID, expiresAt: now + 60 });
		expect(await readTrust('another', cookie, now)).toBeUndefined();
		expect(await readTrust(KEY, cookie.replace(`${now + 60}`, `${now + 99}`), now)).toBeUndefined();
		expect(await readTrust(KEY, cookie, now + 60)).toBeUndefined();
		expect(await readTrust(KEY, undefined, now)).toBeUndefined();
	});
});

describe('the gate', () => {
	it('lets every write through while the secret is unset', async () => {
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		expect((await ask('/like', like, env(false))).status).toBe(200);
	});

	it('lets reads and a batch through, and refuses an untrusted write with 428', async () => {
		expect((await ask('/stats', { method: 'GET' }, env(true))).status).not.toBe(428);
		expect((await ask('/batch', { method: 'POST', body: '{}' }, env(true))).status).not.toBe(428);
		expect((await ask('/like', like, env(true))).status).toBe(428);
	});

	it('refuses a token Siteverify did not pass', async () => {
		siteverify({ success: false, 'error-codes': ['invalid-input-response'] });
		const answer = await ask('/verify', { method: 'POST', body: '{"token":"x"}' }, env(true));
		expect(answer.status).toBe(403);
	});

	it('refuses a pass for another host or action', async () => {
		siteverify({ success: true, hostname: 'example.com', action: 'trust' });
		const elsewhere = await ask('/verify', { method: 'POST', body: '{"token":"x"}' }, env(true));
		expect(elsewhere.status).toBe(403);
		siteverify({ success: true, hostname: 'canmi.net', action: 'login' });
		const other = await ask('/verify', { method: 'POST', body: '{"token":"x"}' }, env(true));
		expect(other.status).toBe(403);
	});

	it('grants a day for a passed token, which then lets a write through', async () => {
		siteverify({ success: true, hostname: 'canmi.net', action: 'trust' });
		const answer = await ask('/verify', { method: 'POST', body: '{"token":"x"}' }, env(true));
		expect(answer.status).toBe(200);
		const cookies = answer.headers.getSetCookie();
		const trust = cookies.find((cookie) => cookie.startsWith(`${TRUST_COOKIE}=`));
		expect(trust).toMatch(/HttpOnly/u);
		expect(trust).toMatch(/Path=\/api/u);
		expect(trust).toMatch(new RegExp(`Max-Age=${TRUST_SECONDS}`, 'u'));
		expect(cookies.some((cookie) => cookie.startsWith('trust_until='))).toBe(true);

		vi.unstubAllGlobals();
		const pair = trust!.split(';')[0]!;
		expect((await ask('/like', like, env(true), pair)).status).toBe(200);

		// Withdrawn on the server, the same cookie is worth nothing.
		await database.prepare('DELETE FROM trust_grants').run();
		expect((await ask('/like', like, env(true), pair)).status).toBe(428);
	});
});
