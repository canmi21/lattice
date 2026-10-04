/**
 * The inside door of `quota`, apart from its Durable Object so a test can stand in for the
 * buckets: every bucket of one call, taken in order until one refuses. See
 * spec/architecture/quota.md.
 */
import { type Check, type Rate, type Taken, takeInOrder } from '@canmi/limits';

/** The buckets, as structure, so this module needs no runtime's types. */
export interface Buckets {
	idFromName(name: string): unknown;
	get(id: unknown): { take(rate: Rate): Promise<Taken> | Taken };
}

/** Each check against its own bucket, named by its key, the first refusal ending it. */
export function takeAll(buckets: Buckets, checks: readonly Check[]): Promise<Taken> {
	return takeInOrder(checks, (check) =>
		buckets.get(buckets.idFromName(check.key)).take(check.rate),
	);
}
