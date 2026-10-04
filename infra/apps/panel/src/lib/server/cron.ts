/**
 * cron, as the panel's server reaches it: over the same confirmed-token path as the ledger. See
 * spec/architecture/cron.md, "Seen in the panel", and ./private.ts.
 */
import { CRON_API } from '$app/env/private';
import { askPrivate, tryReadPrivate } from './private';

/** cron's private scope on the API host, as the node names it; empty where it names none. */
const CRON_BASE = CRON_API;

/**
 * Ask cron at `path` (leading slash, e.g. `/schedules`) with `search` (leading `?` or empty) and
 * `init` (its method and body), once `token` is confirmed. Throws `SignedOut` when it is not; cron
 * unreachable answers as an upstream failure rather than throwing, matching `askPrivate`.
 */
export async function cron(
	path: string,
	search: string,
	token: string | undefined,
	init?: RequestInit,
): Promise<Response> {
	return askPrivate(CRON_BASE, path, search, token, init);
}

/** What cron answers, or nothing when it cannot be read: the page reads from the browser. */
export async function tryReadCron<T>(
	path: string,
	search: string,
	token: string | undefined,
): Promise<T | undefined> {
	return tryReadPrivate<T>(CRON_BASE, path, search, token);
}
