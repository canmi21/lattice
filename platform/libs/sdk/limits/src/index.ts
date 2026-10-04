/**
 * Limits, as rows: which methods on which path, counted by which kind of subject, at what rate, and
 * how a caller asks `quota` for them. One format for both doors an API has -- a gateway's, and a
 * Worker's own for the routes only its pages call -- so a rule is a line wherever it lives. See
 * spec/architecture/quota.md.
 */

import { failure } from '@canmi/response';
import type { Taken } from './bucket.ts';
import { addressOf, type Check, checksOf, type Row } from './key.ts';

export { type Rate, type Taken, take } from './bucket.ts';
export {
	addressOf,
	type Check,
	checksOf,
	covers,
	type Row,
	type Subject,
	SUBJECTS,
	type Subjects,
} from './key.ts';

const ALLOWED: Taken = { allowed: true, retryAfter: 0 };

/**
 * A call's buckets taken in order, the first refusal ending it: what was taken before it stays
 * taken, and the ones after it are never asked. See spec/architecture/quota.md, "The buckets of one
 * call are taken in order, and the first refusal ends it".
 */
export async function takeInOrder(
	checks: readonly Check[],
	takeOne: (check: Check) => Promise<Taken> | Taken,
): Promise<Taken> {
	for (const check of checks) {
		// oxlint-disable-next-line no-await-in-loop -- a bucket after a refusal is never asked
		const taken = await takeOne(check);
		if (!taken.allowed) return taken;
	}
	return ALLOWED;
}

/** `quota`'s inside door, as structure: a caller needs no runtime's types, and a test stands in. */
export interface Quota {
	take(checks: readonly Check[]): Promise<Taken> | Taken;
}

function isQuota(value: unknown): value is Quota {
	return typeof (value as Quota | undefined)?.take === 'function';
}

/**
 * Whether a call to `service` is within every row that covers it, one of each kind of subject it
 * carries -- for now its address, IPv6 by its `/64` -- asked of `quota`. A call no row covers, or
 * with no address, is not limited. A missing binding refuses, as a deploy that went wrong; a
 * `quota` that fails lets the call through, with the zone's rate rule still beneath it. See
 * spec/architecture/quota.md, "A caller depends on it softly".
 */
export async function counted(
	quota: unknown,
	service: string,
	rows: readonly Row[],
	call: { readonly method: string; readonly path: string; readonly address: string | undefined },
): Promise<Taken> {
	const address = call.address === undefined ? undefined : addressOf(call.address);
	const subjects = address === undefined ? {} : { address };
	const checks = checksOf(service, rows, { method: call.method, path: call.path, subjects });
	if (checks.length === 0) return ALLOWED;
	try {
		// Inside the `try`: a binding to a Worker that is not running throws on being looked at.
		if (!isQuota(quota)) {
			return { allowed: false, retryAfter: Math.max(...checks.map((check) => check.rate.seconds)) };
		}
		return await quota.take(checks);
	} catch (error) {
		console.error(`${service}: quota failed, and the call was let through`, error);
		return ALLOWED;
	}
}

/** The answer to a call over its limit, in the envelope every API here answers in. */
export function limited(taken: Taken): Response {
	return failure(429, 'rate_limited', { headers: { 'Retry-After': String(taken.retryAfter) } });
}
