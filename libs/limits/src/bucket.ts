/**
 * A limit as a bucket: `burst` calls at once, and room coming back at `count` calls in `seconds`.
 * Counted with GCRA, which admits exactly what a token bucket would while keeping one number per
 * key -- the moment the next call is due. Pure, so every deployment of `quota` runs the same
 * arithmetic. See spec/architecture/quota.md, "A limit is a bucket".
 */

/** How fast room comes back, and how much of it there is. */
export interface Rate {
	readonly count: number;
	readonly seconds: number;
	/** How many calls may come together; `count` when absent. */
	readonly burst?: number;
}

export interface Taken {
	readonly allowed: boolean;
	/** Whole seconds until another call would be allowed; 0 when this one was. */
	readonly retryAfter: number;
}

/**
 * One call at `now`, in milliseconds, against a bucket whose next call was `due`, or never asked
 * when undefined: whether it passes, and the `due` to keep after it. A refused call keeps the old
 * `due`, so refusals spend nothing.
 */
export function take(
	due: number | undefined,
	rate: Rate,
	now: number,
): Taken & { readonly due: number | undefined } {
	const interval = (rate.seconds * 1000) / rate.count;
	const room = (rate.burst ?? rate.count) * interval;
	const next = Math.max(due ?? now, now) + interval;
	if (next - now <= room) return { allowed: true, retryAfter: 0, due: next };
	return { allowed: false, retryAfter: Math.max(1, Math.ceil((next - now - room) / 1000)), due };
}
