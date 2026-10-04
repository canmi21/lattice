/**
 * How the panel's server reaches any private service: over the private network, and only once
 * host confirms the visitor's own token still holds, since none of them ask for one themselves.
 * The ledger and cron both forward through this. See spec/architecture/ledger.md, "Read by the
 * panel", and spec/architecture/cron.md, "Seen in the panel".
 */
import type { ApiResponse } from '@canmi/response';
import { read, SignedOut } from './core';

/** How long a confirmed token is trusted before host is asked about it again. */
const CONFIRMED_FOR_MS = 60_000;

/** Token to the moment its confirmation with host expires. Shared by every private service, since
 * what it confirms is the visitor, not any one of them. */
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
 * Ask the private service at `base` for `path` (leading slash, e.g. `/tasks`) with `search`
 * (leading `?` or empty) and `init` (its method and body, GET when left out), once `token` is
 * confirmed. Throws `SignedOut` when it is not; a service that cannot be reached answers as an
 * upstream failure rather than throwing.
 */
export async function askPrivate(
	base: string,
	path: string,
	search: string,
	token: string | undefined,
	init?: RequestInit,
): Promise<Response> {
	await confirm(token);
	try {
		return await fetch(`${base}${path}${search}`, init);
	} catch {
		const body = { status: 'error', code: 'upstream_unavailable', message: 'it did not answer' };
		return Response.json(body, { status: 502 });
	}
}

/** What a private service answers with, unwrapped from its envelope -- for a page rendered
 * server-side. */
async function readPrivateOrThrow<T>(
	base: string,
	path: string,
	search: string,
	token: string | undefined,
): Promise<T> {
	const answer = await askPrivate(base, path, search, token);
	if (answer.status === 401) throw new SignedOut();
	const envelope = (await answer.json()) as ApiResponse<T>;
	if (envelope.status !== 'success') throw new Error(envelope.message);
	return envelope.data;
}

/** What a private service answers, or nothing when it cannot be read: the page reads from the
 * browser instead. */
export async function tryReadPrivate<T>(
	base: string,
	path: string,
	search: string,
	token: string | undefined,
): Promise<T | undefined> {
	return readPrivateOrThrow<T>(base, path, search, token).catch(() => undefined);
}
