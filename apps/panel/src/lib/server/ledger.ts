/**
 * The ledger, as the panel's server reaches it: over the private network, and only once host
 * confirms the visitor's own token still holds, since the ledger itself asks for none. See
 * spec/architecture/ledger.md, "Read by the panel", and "Pushed to, never asking".
 */
import { URLS } from '@canmi/urls';
import type { ApiResponse } from '@canmi/response';
import { read, SignedOut } from './core';

/** How long a confirmed token is trusted before host is asked about it again. */
const CONFIRMED_FOR_MS = 60_000;

/** Token to the moment its confirmation with host expires. */
const confirmed = new Map<string, number>();

/** A cheap read that only a signed-in visitor's token answers, so confirming it costs little. */
async function confirm(token: string | undefined): Promise<void> {
	if (!token) throw new SignedOut();
	const expires = confirmed.get(token);
	if (expires && expires > Date.now()) return;
	await read('/api/apps', token);
	confirmed.set(token, Date.now() + CONFIRMED_FOR_MS);
}

/**
 * Ask the ledger at `path` (leading slash, e.g. `/tasks`) with `search` (leading `?` or empty),
 * once `token` is confirmed. Throws `SignedOut` when it is not; a ledger that cannot be reached
 * answers as an upstream failure rather than throwing, matching `forward` in `./core`.
 */
export async function ledger(path: string, search: string, token: string | undefined): Promise<Response> {
	await confirm(token);
	try {
		return await fetch(`${URLS.internal.ledger}${path}${search}`);
	} catch {
		const body = { status: 'error', code: 'upstream_unavailable', message: 'the ledger did not answer' };
		return Response.json(body, { status: 502 });
	}
}

/** What the ledger answers with, unwrapped from its envelope -- for a page rendered server-side. */
async function readLedger<T>(path: string, search: string, token: string | undefined): Promise<T> {
	const answer = await ledger(path, search, token);
	if (answer.status === 401) throw new SignedOut();
	const envelope = (await answer.json()) as ApiResponse<T>;
	if (envelope.status !== 'success') throw new Error(envelope.message);
	return envelope.data;
}

/** What the ledger answers, or nothing when it cannot be read: the page reads from the browser. */
export async function tryReadLedger<T>(
	path: string,
	search: string,
	token: string | undefined,
): Promise<T | undefined> {
	return readLedger<T>(path, search, token).catch(() => undefined);
}
