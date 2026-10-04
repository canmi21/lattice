import { dev } from '$app/env';
import { serverHandles } from '@canmi/web/sentry/server';
import { fillTheme } from '@canmi/kit/theme';
import { normalizedLocation, URLS } from '@monoflake/sdk';
import { handleErrorWithSentry } from '@sentry/sveltekit';
import { sequence, type Handle } from '@sveltejs/kit/hooks';

/**
 * The script alone, never the class: the render is cached at the edge for every reader, so it
 * cannot carry one reader's cookie. See spec/styling/palettes.md.
 */
const themeHandle: Handle = ({ event, resolve }) =>
	resolve(event, { transformPageChunk: ({ html }) => fillTheme(html) });

// One spelling per address: a path that normalizes differently goes where it should.
// See platform's spec/architecture/delivery.md, "Every address has one spelling".
const spellingHandle: Handle = ({ event, resolve }) => {
	const normal = normalizedLocation(event.url);
	return normal
		? new Response(null, { status: normal.status, headers: { location: normal.location } })
		: resolve(event);
};

// Sentry's handles first, and none when the DSN is unset. The same handles serve both doors; see
// @canmi/web/sentry/server.ts.
export const handle = sequence(
	...serverHandles({ dsn: URLS.external.sentry.status, dev }),
	spellingHandle,
	themeHandle,
);

export const handleError = handleErrorWithSentry();
