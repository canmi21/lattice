/**
 * A page that moves while a run deploys: the clock its elapsed times are written against ticks
 * every second, and the page's load runs again every EVERY, both only while `active` holds. Made
 * while a component starts, since it owns an effect.
 */
import { invalidateAll } from '$app/navigation';

const EVERY = 4000;

export class Fresh {
	/** Milliseconds; the server's moment until the first tick, so both renders agree. */
	now: number = $state(0);

	constructor(start: () => number, active: () => boolean) {
		this.now = start();
		$effect(() => {
			if (!active()) return;
			const tick = setInterval(() => (this.now = Date.now()), 1000);
			const read = setInterval(() => void invalidateAll(), EVERY);
			return () => {
				clearInterval(tick);
				clearInterval(read);
			};
		});
	}
}
