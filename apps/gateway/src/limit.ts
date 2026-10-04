/**
 * The gateway's side of a limit: the buckets a call is counted in, asked of `quota` at its inside
 * door. Declared in the service's `service.toml` and carried in the scope table. See
 * spec/architecture/quota.md.
 */
import { addressOf, type Check, checksOf, type Row, type Taken } from '@canmi/limits';

export { covers } from '@canmi/limits';

/** `quota`'s inside door, as structure, so a test can stand in for it. */
export interface Quota {
	take(checks: readonly Check[]): Promise<Taken> | Taken;
}

function isQuota(value: unknown): value is Quota {
	return typeof (value as Quota | undefined)?.take === 'function';
}

const ALLOWED: Taken = { allowed: true, retryAfter: 0 };

/**
 * Whether a call is within every row that covers it, one of each kind of subject it carries -- for
 * now its address, IPv6 by its `/64`. A call no row covers, or with no address, is not limited
 * here. A missing binding refuses, as a deploy that went wrong; a `quota` that fails lets the call
 * through, with the zone's rate rule still beneath it.
 */
export async function counted(
	quota: unknown,
	service: string,
	rows: readonly Row[],
	call: { method: string; path: string; address: string | undefined },
): Promise<Taken> {
	const address = call.address === undefined ? undefined : addressOf(call.address);
	const subjects = address === undefined ? {} : { address };
	const checks = checksOf(service, rows, { method: call.method, path: call.path, subjects });
	if (checks.length === 0) return ALLOWED;
	if (!isQuota(quota)) {
		return { allowed: false, retryAfter: Math.max(...checks.map((check) => check.rate.seconds)) };
	}
	try {
		return await quota.take(checks);
	} catch (error) {
		console.error('gateway: quota failed, and the call was let through', error);
		return ALLOWED;
	}
}
