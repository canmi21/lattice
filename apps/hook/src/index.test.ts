import { describe, expect, it } from 'vitest';
import { type Env, RECEIVERS, handle } from './index';
import { REPOSITORY, WORKFLOW } from './github';

const SECRET = 'test-secret';

async function sign(body: string): Promise<string> {
	const encoder = new TextEncoder();
	const key = await crypto.subtle.importKey(
		'raw',
		encoder.encode(SECRET),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign'],
	);
	const bytes = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(body)));
	return `sha256=${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

/** A VPC binding that records what it was sent and answers with `status`. */
function home(status = 204) {
	const sent: { url: string; body: string }[] = [];
	const binding = {
		fetch: async (url: string, init: RequestInit) => {
			sent.push({ url, body: String(init.body) });
			return new Response(null, { status });
		},
	} as unknown as Fetcher;
	return { sent, env: { WEBHOOK_SECRET: SECRET, HOME: binding } satisfies Env };
}

const DELIVERY = JSON.stringify({
	action: 'completed',
	repository: { full_name: REPOSITORY },
	workflow_run: {
		id: 7,
		path: WORKFLOW,
		head_branch: 'main',
		event: 'push',
		status: 'completed',
		conclusion: 'success',
	},
});

async function deliver(
	body: string,
	event = 'workflow_run',
	signature?: string,
	path = '/v1/github',
) {
	return new Request(new URL(path, 'https://api.example.com'), {
		method: 'POST',
		headers: { 'x-github-event': event, 'x-hub-signature-256': signature ?? (await sign(body)) },
		body,
	});
}

describe('handle', () => {
	it('passes a deployable run to host and keeper', async () => {
		const { sent, env } = home();
		const response = await handle(await deliver(DELIVERY), env);
		expect(response.status).toBe(202);
		expect(sent.map((notice) => notice.url)).toEqual(RECEIVERS);
		expect(sent.every((notice) => JSON.parse(notice.body).run === 7)).toBe(true);
	});

	it('takes the same delivery at /v1/github', async () => {
		const { sent, env } = home();
		const response = await handle(await deliver(DELIVERY, 'workflow_run', undefined, '/v1/github'), env);
		expect(response.status).toBe(202);
		expect(sent.map((notice) => notice.url)).toEqual(RECEIVERS);
	});

	it('refuses a delivery whose signature is not the secret', async () => {
		const { sent, env } = home();
		const response = await handle(await deliver(DELIVERY, 'workflow_run', 'sha256=00'), env);
		expect(response.status).toBe(401);
		expect(await response.json()).toMatchObject({ code: 'invalid_signature' });
		expect(sent).toHaveLength(0);
	});

	it('answers a ping and any other event without passing it on', async () => {
		const { sent, env } = home();
		expect((await handle(await deliver('{}', 'ping'), env)).status).toBe(204);
		expect(sent).toHaveLength(0);
	});

	it('fails the delivery when a receiver does not take it, so GitHub can redeliver', async () => {
		const { env } = home(502);
		const refused = await handle(await deliver(DELIVERY), env);
		expect(refused.status).toBe(502);
		expect(await refused.json()).toMatchObject({ status: 'error', code: 'upstream_unavailable' });
	});

	it('answers nothing but its own path', async () => {
		const { env } = home();
		const elsewhere = new Request('https://api.example.com/other', { method: 'POST' });
		expect((await handle(elsewhere, env)).status).toBe(404);
	});
});
