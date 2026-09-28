/**
 * One address's calls to one route, counted in one place wherever in the world they land. The log
 * is memory: nothing is written, so a counter costs a request and nothing else, and one idle long
 * enough to be evicted had nothing left in its window. See spec/architecture/services.md, "A limit
 * is declared once and kept in three places".
 */
import { DurableObject } from 'cloudflare:workers';
import { take, type Taken } from './window.ts';

// Named in lowercase, as the dashboard shows it: `gateway_counter`.
export class counter extends DurableObject {
	#log: number[] = [];

	take(count: number, seconds: number): Taken {
		return take(this.#log, count, seconds, Date.now());
	}
}
