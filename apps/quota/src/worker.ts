/**
 * `quota` as deployed on Workers: a bucket a key, the inside door Workers bind to, and an HTTP door
 * that refuses until there are accounts. See spec/architecture/quota.md.
 */
import { DurableObject, WorkerEntrypoint } from 'cloudflare:workers';
import { type Check, type Rate, type Taken, take } from '@canmi/limits';
import { failure } from '@canmi/response';
import { type Buckets, takeAll } from './index.ts';

interface Env {
	readonly buckets: Buckets;
}

/**
 * One key's bucket, counted in one place wherever its calls land. The moment its next call is due
 * is memory: nothing is written, and one idle long enough to be evicted had a full bucket anyway.
 */
// Named in lowercase, as the dashboard shows it: `quota_bucket`.
export class bucket extends DurableObject {
	#due: number | undefined;

	take(rate: Rate): Taken {
		const taken = take(this.#due, rate, Date.now());
		this.#due = taken.due;
		return { allowed: taken.allowed, retryAfter: taken.retryAfter };
	}
}

/** The inside door: any key, so nothing outside the platform reaches it. */
export class Internal extends WorkerEntrypoint<Env> {
	take(checks: readonly Check[]): Promise<Taken> {
		return takeAll(this.env.buckets, checks);
	}
}

export default {
	fetch: () => failure(404, 'no_such_route'),
} satisfies ExportedHandler<Env>;
