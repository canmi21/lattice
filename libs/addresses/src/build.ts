/**
 * A route's contract address, worked out where an app is built: its name, a revision, and its
 * contract as data, hashed, so the address moves with them and with nothing else. Node's alone,
 * kept apart from ./index.ts, which the pages run. See the site's spec/architecture/site-api.md,
 * "The pages ask by contract, not by name".
 */
import { createHash } from 'node:crypto';

/**
 * A schema as data: every field that says what it accepts, in a fixed order, and none of the
 * functions that run it. Two schemas that accept the same shape read the same here, and changing
 * a field, a literal or a limit changes it.
 */
export function canonical(value: unknown): unknown {
	if (value instanceof RegExp) return value.toString();
	if (Array.isArray(value)) return value.map(canonical);
	if (value === null || typeof value !== 'object')
		return typeof value === 'function' ? undefined : value;
	const fields = Object.entries(value)
		.filter(
			([key, field]) => !key.startsWith('~') && key !== 'message' && typeof field !== 'function',
		)
		.toSorted(([a], [b]) => a.localeCompare(b))
		.map(([key, field]) => [key, canonical(field)]);
	return Object.fromEntries(fields);
}

/** The address a route is asked at: its name and contract, hashed, so it moves only with them. */
/** Twelve hex digits of a SHA-256 over `route`, `revision` and `contract` read as data. */
export function contractAddress(route: string, revision: number, contract: unknown): string {
	const text = JSON.stringify([route, revision, canonical(contract)]);
	return createHash('sha256').update(text).digest('hex').slice(0, 12);
}
