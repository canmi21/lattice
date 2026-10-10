import { env } from 'cloudflare:workers';
import type { RequestEvent } from '@sveltejs/kit';
import type { Edge } from './read.ts';
import type { Whereabouts } from './nodes.ts';
import { served } from '../ui/time-zone.ts';
import type { Context } from './facets.ts';
import { sourcesOf } from './sources.ts';

/**
 * The bindings come from `cloudflare:workers`, which the adapter emulates under `vite dev`;
 * `event.platform` carries none since SvelteKit 3. Kept apart so the readers stay testable.
 */
export function edgeOf(event: Pick<RequestEvent, 'request'>): Edge {
	return { env, where: event.request.cf as Whereabouts | undefined };
}

/** What a page's load cuts its facets with: this request's reads, the reader's zone, and now. */
export function facetContext(event: Pick<RequestEvent, 'request' | 'cookies'>): Context {
	const edge = edgeOf(event);
	return {
		sources: sourcesOf(event.request, edge),
		zone: served(event.cookies, event.request.cf as { timezone?: string } | undefined),
		now: Date.now(),
	};
}
