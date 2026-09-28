/**
 * The gateway's side of a limit: which allowance a request falls under, and asking that address's
 * counter. Declared in the service's `service.toml` and carried in the scope table. See
 * spec/architecture/services.md, "A limit is declared once and kept in three places".
 */
import type { Allowance } from './table.ts';
import type { Taken } from './window.ts';

/** The binding the counters are reached through, as structure, so a test can stand in for it. */
export interface Counters {
	idFromName(name: string): unknown;
	get(id: unknown): { take(count: number, seconds: number): Promise<Taken> | Taken };
}

function isCounters(value: unknown): value is Counters {
	const counters = value as Counters | undefined;
	return typeof counters?.idFromName === 'function' && typeof counters.get === 'function';
}

const ALLOWED: Taken = { allowed: true, retryAfter: 0 };

/** A counter's name, lowercase: scope, methods, path, address, `shot_get-head_capture_1.2.3.4`. */
export function counterName(scope: string, allowance: Allowance, address: string): string {
	const methods = allowance.methods.map((method) => method.toLowerCase()).join('-');
	const path = allowance.path.split('/').filter(Boolean).join('-') || 'root';
	return [scope, methods, path, address.toLowerCase()].join('_');
}

/**
 * Whether a call is within the allowance that covers it. One no allowance covers, or with no
 * address to count, is not limited here. A missing binding refuses, as a deploy that went wrong; a
 * counter that fails lets the call through, with the zone's rate rule still beneath it.
 */
export async function counted(
	counters: unknown,
	scope: string,
	limits: readonly Allowance[],
	request: { method: string; path: string; address: string | undefined },
): Promise<Taken> {
	const allowance = limits.find(
		(limit) => limit.path === request.path && limit.methods.includes(request.method),
	);
	if (!allowance || !request.address) return ALLOWED;
	if (!isCounters(counters)) return { allowed: false, retryAfter: allowance.seconds };
	const name = counterName(scope, allowance, request.address);
	try {
		return await counters.get(counters.idFromName(name)).take(allowance.count, allowance.seconds);
	} catch (error) {
		console.error('gateway: a counter failed, and the call was let through', error);
		return ALLOWED;
	}
}
