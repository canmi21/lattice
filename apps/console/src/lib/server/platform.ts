import { env } from 'cloudflare:workers';
import type { RequestEvent } from '@sveltejs/kit';
import type { Edge } from './read.ts';
import type { Whereabouts } from './nodes.ts';

/**
 * The bindings come from `cloudflare:workers`, which the adapter emulates under `vite dev`;
 * `event.platform` carries none since SvelteKit 3. Kept apart so the readers stay testable.
 */
export function edgeOf(event: Pick<RequestEvent, 'request'>): Edge {
	return { env, where: event.request.cf as Whereabouts | undefined };
}
