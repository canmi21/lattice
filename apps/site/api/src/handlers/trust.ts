import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import type { Bindings } from '../bindings';
import { failure } from '../lib/respond';
import { MAX_TOKEN_LENGTH, verify } from '../lib/trust';

const NO_STORE = { 'Cache-Control': 'no-store' } as const;

const trust = new Hono<{ Bindings: Bindings }>();

/** A passed Turnstile token, exchanged for a day's trust. See spec/architecture/trust.md. */
trust.post(
	'/verify',
	bodyLimit({
		maxSize: MAX_TOKEN_LENGTH + 64,
		onError: (c) => failure(c, 413, 'invalid_body', NO_STORE),
	}),
	async (c) => {
		const body = (await c.req.json().catch(() => undefined)) as { token?: unknown } | undefined;
		const token = body?.token;
		if (typeof token !== 'string' || token.length === 0 || token.length > MAX_TOKEN_LENGTH) {
			return failure(c, 400, 'invalid_token', NO_STORE);
		}
		return verify(c, token);
	},
);

export default trust;
