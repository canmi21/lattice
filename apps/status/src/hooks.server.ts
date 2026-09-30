import { dev } from '$app/environment';
import { serverHandles } from '@canmi/sentry/server';
import { fillTheme } from '@canmi/theme';
import { URLS } from '@canmi/urls';
import { handleErrorWithSentry } from '@sentry/sveltekit';
import type { Handle } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';

/**
 * The script alone, never the class: the render is cached at the edge for every reader, so it
 * cannot carry one reader's cookie. See spec/styling/palettes.md.
 */
const themeHandle: Handle = ({ event, resolve }) =>
	resolve(event, { transformPageChunk: ({ html }) => fillTheme(html) });

// Sentry's handles first, and none when the DSN is unset. The same handles serve both doors; see
// libs/sentry/src/server.ts.
export const handle = sequence(
	...serverHandles({ dsn: URLS.external.sentry.status, dev }),
	themeHandle,
);

export const handleError = handleErrorWithSentry();
