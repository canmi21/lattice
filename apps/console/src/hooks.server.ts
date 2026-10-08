import { env } from 'cloudflare:workers';
import { fillTheme } from '@canmi/kit/theme';
import type { Handle } from '@sveltejs/kit/hooks';
import { handle as edge, isRoute } from '#lib/server/edge.js';

/**
 * `/live`, `/state` and `/nearest` before any page: a response this hook returns itself leaves
 * SvelteKit as it was made, which the socket's 101 must. See src/lib/server/edge.ts.
 */
export const handle: Handle = ({ event, resolve }) =>
	isRoute(event.url.pathname)
		? edge(event.request, env)
		: resolve(event, { transformPageChunk: ({ html }) => fillTheme(html) });
