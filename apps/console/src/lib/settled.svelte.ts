/**
 * A value that follows `read` and changes only when `key` of it does: what reads `current` is
 * woken by a change of what it holds, not by every change of what `read` reads. A `$derived` that
 * returns the value it held still wakes everything downstream for Svelte to check, which is what
 * a clock ticking each second or a node's every message must not do to the timeline's thousands of
 * slots. See spec/console/overview.md, "The row is laid out again a minute at most".
 */
import { untrack } from 'svelte';

export class Settled<T> {
	current: T = $state.raw() as T;

	constructor(read: () => T, key: (value: T) => unknown = (value) => value) {
		const first = untrack(read);
		this.current = first;
		let held = key(first);
		$effect.pre(() => {
			const next = read();
			const written = key(next);
			if (Object.is(written, held)) return;
			held = written;
			this.current = next;
		});
	}
}
