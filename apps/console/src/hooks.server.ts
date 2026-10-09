import { env } from 'cloudflare:workers';
import { dev } from '$app/env';
import { fillTheme } from '@canmi/kit/theme';
import { EXTERNAL } from '@canmi/me/urls';
import { serverHandles } from '@canmi/web/sentry/server';
import { stamp } from '@canmi/web/error';
import { handleErrorWithSentry } from '@sentry/sveltekit';
import { sequence, type Handle } from '@sveltejs/kit/hooks';
import { handle as edge, isRoute } from '#lib/server/edge.js';

/** Every page, through Sentry's handles first; development loads them and sends nothing. */
const pages = sequence(
	...serverHandles({ dsn: EXTERNAL.sentry.console, dev }),
	({ event, resolve }) => resolve(event, { transformPageChunk: ({ html }) => fillTheme(html) }),
);

/**
 * `/live`, `/state` and `/nearest` before any page, and before Sentry too: a response this hook
 * returns itself leaves SvelteKit as it was made, which the socket's 101 must, and nothing may wrap
 * it first. See src/lib/server/edge.ts and spec/architecture/console.md, "Errors go to Sentry, and
 * development sends nothing".
 */
export const handle: Handle = (input) =>
	isRoute(input.event.url.pathname) ? edge(input.event.request, env) : pages(input);

/** An unexpected error stamped as the server's; see lib's spec/web/error.md. */
export const handleError = handleErrorWithSentry(stamp('server'));
