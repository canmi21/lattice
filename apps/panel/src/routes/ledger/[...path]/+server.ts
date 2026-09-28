/**
 * The ledger, read from the browser: GET only, forwarded once the visitor's token is confirmed
 * with host. Never under `/api/`, which is host's own. See spec/architecture/ledger.md, "Read by
 * the panel", and spec/architecture/host.md, "The panel is an app of its own".
 */
import { SESSION } from '$lib/server/core';
import { ledger } from '$lib/server/ledger';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, url, cookies }) => {
	try {
		const answer = await ledger(`/${params.path}`, url.search, cookies.get(SESSION));
		return new Response(answer.body, {
			status: answer.status,
			headers: { 'content-type': answer.headers.get('content-type') ?? 'application/json' },
		});
	} catch {
		const body = { status: 'error', code: 'signed_out', message: 'not signed in' };
		return Response.json(body, { status: 401 });
	}
};
