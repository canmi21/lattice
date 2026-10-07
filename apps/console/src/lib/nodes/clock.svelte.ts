/**
 * The time liveness and ages are read against: the server's at first, so the browser's first
 * paint says what the server's did, then this browser's, each second.
 */
import { onMount } from 'svelte';

export class Clock {
	now: number = $state(0);

	constructor(start: number) {
		this.now = start;
		onMount(() => {
			this.now = Date.now();
			const timer = setInterval(() => (this.now = Date.now()), 1000);
			return () => clearInterval(timer);
		});
	}
}
