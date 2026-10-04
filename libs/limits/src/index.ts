/**
 * Limits by the caller's address, as rows: which methods on which path, counted by which rate
 * limit binding. One format for both doors an API has -- the gateway's, for a scope's public
 * routes, and a Worker's own, for routes only its pages call -- so a rule is a line wherever it
 * lives. See spec/architecture/services.md, "The gateway holds what every API would otherwise
 * repeat".
 */

import { failure } from '@canmi/response';
import type { Taken } from './bucket.ts';
import type { Check } from './key.ts';

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
		const taken = await takeOne(check);
		if (!taken.allowed) return taken;
	}
	return ALLOWED;
}

export interface Limit {
	readonly methods: readonly string[];
	/** The path as the service sees it. */
	readonly path: string;
	/** The name of the rate limit binding that counts it. */
	readonly limiter: string;
}

/** What a rate limit binding is, structurally, so this library needs no runtime's types. */
interface Limiter {
	limit(options: { key: string }): Promise<{ success: boolean }>;
}

function isLimiter(value: unknown): value is Limiter {
	return typeof (value as Limiter | undefined)?.limit === 'function';
}

/**
 * Whether a request is within the first limit that covers it. One no limit covers, or one with no
 * address to count, is not limited here. A limit whose binding is missing refuses: that is a deploy
 * that went wrong, and letting everything through would hide it.
 */
export async function within(
	limits: readonly Limit[],
	env: Readonly<Record<string, unknown>>,
	request: { method: string; path: string; address: string | undefined },
): Promise<boolean> {
	const limit = limits.find((l) => l.path === request.path && l.methods.includes(request.method));
	if (!limit || !request.address) return true;
	const limiter = env[limit.limiter];
	if (!isLimiter(limiter)) return false;
	return (await limiter.limit({ key: request.address })).success;
}

/** The answer to a request over its limit, in the envelope every API here answers in. */
export function limited(): Response {
	return failure(429, 'rate_limited', { headers: { 'Retry-After': '60' } });
}
