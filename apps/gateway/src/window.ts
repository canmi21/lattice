/**
 * A sliding window over the moments one address was allowed through, the arithmetic a counter keeps
 * its log with. Pure, so it is tested without a Durable Object.
 */

export interface Taken {
	readonly allowed: boolean;
	/** Whole seconds until another call would be allowed; 0 when this one was. */
	readonly retryAfter: number;
}

/**
 * Count one call at `now` against `count` in `seconds`: allowed and logged while the window has
 * room, refused with how long until its oldest call leaves it otherwise. `log` is kept in order and
 * trimmed as it goes.
 */
export function take(log: number[], count: number, seconds: number, now: number): Taken {
	const window = seconds * 1000;
	while (log.length > 0 && (log[0] as number) <= now - window) log.shift();
	if (log.length < count) {
		log.push(now);
		return { allowed: true, retryAfter: 0 };
	}
	return {
		allowed: false,
		retryAfter: Math.max(1, Math.ceil(((log[0] as number) + window - now) / 1000)),
	};
}
