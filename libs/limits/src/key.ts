/**
 * What a call is counted as: the rows that cover it, one per kind of subject, and each one's key --
 * the service, the row and the subject, never the host or the version. See
 * spec/architecture/quota.md, "A key names the service, the route and the subject, never a host".
 */
import type { Rate } from './bucket.ts';

/** The kinds of subject, in the order a call's buckets are taken. */
export const SUBJECTS = ['address', 'account', 'session'] as const;
export type Subject = (typeof SUBJECTS)[number];

/** One row of `[[api.limits]]`: which calls, counted by which subject, at what rate. */
export interface Row extends Rate {
	readonly methods: readonly string[];
	/** After the version, exact or a prefix ending in `/*`. */
	readonly path: string;
	/** `address` when absent. */
	readonly subject?: Subject;
}

/** Who a call is from, as far as is known; a kind left out counts nothing. */
export type Subjects = Partial<Readonly<Record<Subject, string>>>;

/** One bucket a call is to be counted in. */
export interface Check {
	readonly key: string;
	readonly rate: Rate;
}

/** Whether a row's path covers a call's: the same path, or under a prefix ending in `/*`. */
export function covers(path: string, called: string): boolean {
	return path.endsWith('/*') ? called.startsWith(path.slice(0, -1)) : path === called;
}

/**
 * An address as it is counted: IPv4 whole, IPv6 by its `/64`, an IPv4 written as IPv6 as the IPv4
 * it is. Lowercase; undefined for what is no address.
 */
export function addressOf(written: string): string | undefined {
	const address = written.trim().toLowerCase();
	if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(address)) return address;
	const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(address);
	if (mapped) return mapped[1];
	if (!/^[0-9a-f:]+$/.test(address) || address.split('::').length > 2) return undefined;
	const [head = '', tail] = address.split('::');
	const left = head ? head.split(':') : [];
	const right = tail ? tail.split(':') : [];
	const missing = 8 - left.length - right.length;
	if (missing < 0 || (tail === undefined && missing !== 0)) return undefined;
	const groups = [...left, ...Array<string>(missing).fill('0'), ...right];
	if (groups.some((group) => group.length === 0 || group.length > 4)) return undefined;
	return `${groups
		.slice(0, 4)
		.map((group) => group.replace(/^0+(?=.)/, ''))
		.join(':')}::/64`;
}

/** A row's own part of a key: `get-head_capture`, `post_tasks`, `get_any`. */
function rowName(row: Row): string {
	const methods = row.methods.map((method) => method.toLowerCase()).join('-');
	const path = row.path.replace('/*', '/any').split('/').filter(Boolean).join('-') || 'root';
	return `${methods}_${path}`;
}

/**
 * The buckets a call to `service` is counted in, in the order they are taken: for each kind of
 * subject the call carries, the first row of that kind covering its method and path.
 */
export function checksOf(
	service: string,
	rows: readonly Row[],
	call: { readonly method: string; readonly path: string; readonly subjects: Subjects },
): Check[] {
	return SUBJECTS.flatMap((kind) => {
		const value = call.subjects[kind];
		if (!value) return [];
		const row = rows.find(
			(candidate) =>
				(candidate.subject ?? 'address') === kind &&
				candidate.methods.includes(call.method) &&
				covers(candidate.path, call.path),
		);
		if (!row) return [];
		const { count, seconds, burst } = row;
		const key = `${service}_${rowName(row)}_${kind}-${value}`.toLowerCase();
		return [{ key, rate: burst === undefined ? { count, seconds } : { count, seconds, burst } }];
	});
}
