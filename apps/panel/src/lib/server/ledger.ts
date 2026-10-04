/**
 * The ledger, as the panel's server reaches it: over the confirmed-token path every private
 * service shares. See spec/architecture/ledger.md, "Read by the panel", and ./private.ts.
 */
import { URLS } from '@monoflake/sdk';
import { askPrivate, tryReadPrivate } from './private';

/**
 * Ask the ledger at `path` (leading slash, e.g. `/tasks`) with `search` (leading `?` or empty),
 * once `token` is confirmed. Throws `SignedOut` when it is not; a ledger that cannot be reached
 * answers as an upstream failure rather than throwing, matching `askPrivate` in `./private`.
 */
export async function ledger(
	path: string,
	search: string,
	token: string | undefined,
): Promise<Response> {
	return askPrivate(URLS.internal.ledger, path, search, token);
}

/** What the ledger answers, or nothing when it cannot be read: the page reads from the browser. */
export async function tryReadLedger<T>(
	path: string,
	search: string,
	token: string | undefined,
): Promise<T | undefined> {
	return tryReadPrivate<T>(URLS.internal.ledger, path, search, token);
}
