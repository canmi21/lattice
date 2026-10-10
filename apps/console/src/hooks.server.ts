import { env, waitUntil } from 'cloudflare:workers';
import { dev } from '$app/env';
import { fillTheme } from '@canmi/kit/theme';
import { EXTERNAL } from '@canmi/me/urls';
import { serverHandles } from '@canmi/web/sentry/server';
import { stamp } from '@canmi/web/error';
import { handleErrorWithSentry } from '@sentry/sveltekit';
import { sequence, type Handle } from '@sveltejs/kit/hooks';
import { PREFIX } from '#lib/facets.js';
import api from '#lib/server/api.js';

/** Every page, through Sentry's handles first; development loads them and sends nothing. */
const pages = sequence(
	...serverHandles({ dsn: EXTERNAL.sentry.console, dev }),
	async ({ event, resolve }) => {
		const page = await resolve(event, { transformPageChunk: ({ html }) => fillTheme(html) });
		// A patch for Wappalyzer, which knows Hono only by this header and reads the page's alone; the
		// API this Worker answers with is Hono. A page's only: a mark passed through from a `fetch`
		// has headers nobody may change. See lib's spec/web/disclose.md.
		if (page.headers.get('content-type')?.startsWith('text/html')) {
			page.headers.set('X-Powered-By', 'Hono');
		}
		return page;
	},
);

/** The API's context: `waitUntil`, from the Worker's own module, is all a Hono app asks of it. */
const context = { waitUntil, passThroughOnException: () => {}, props: {} } as ExecutionContext;

/**
 * The API under `/api/` before any page and before Sentry too: a response this hook returns itself
 * leaves SvelteKit as it was made, which the live stream's 101 must, and nothing may wrap it first.
 * See src/lib/server/api.ts and spec/architecture/console.md, "Errors go to Sentry, and
 * development sends nothing".
 */
export const handle: Handle = (input) => {
	const { pathname } = input.event.url;
	if (pathname.startsWith(PREFIX)) return api.fetch(input.event.request, env, context);
	return pages(input);
};

/** An unexpected error stamped as the server's; see lib's spec/web/error.md. */
export const handleError = handleErrorWithSentry(stamp('server'));
