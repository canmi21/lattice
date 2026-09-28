/**
 * cron, read from the browser: GET forwarded as the ledger's is, and POST allowed only on the
 * three actions the panel takes on a job -- run, pause, resume. See
 * spec/architecture/cron.md, "cron answers on its own `[api]` scope, privately", and
 * spec/architecture/host.md, "The panel is an app of its own".
 */
import { SESSION } from '$lib/server/core';
import { cron } from '$lib/server/cron';
import type { RequestHandler } from './$types';

/** `/schedules/<service>/<name>/run|pause|resume` -- the only paths POST is let through to. */
const ACTION = /^\/schedules\/[^/]+\/[^/]+\/(run|pause|resume)$/;

async function relay(path: string, search: string, token: string | undefined, init?: RequestInit) {
	try {
		const answer = await cron(path, search, token, init);
		return new Response(answer.body, {
			status: answer.status,
			headers: { 'content-type': answer.headers.get('content-type') ?? 'application/json' },
		});
	} catch {
		const body = { status: 'error', code: 'signed_out', message: 'not signed in' };
		return Response.json(body, { status: 401 });
	}
}

export const GET: RequestHandler = async ({ params, url, cookies }) =>
	relay(`/${params.path}`, url.search, cookies.get(SESSION));

export const POST: RequestHandler = async ({ params, url, cookies }) => {
	const path = `/${params.path}`;
	if (!ACTION.test(path)) {
		const body = { status: 'error', code: 'forbidden', message: 'not one of run, pause, resume' };
		return Response.json(body, { status: 403 });
	}
	return relay(path, url.search, cookies.get(SESSION), { method: 'POST' });
};
