import { themeScript } from '@canmi/theme';
import type { Handle } from '@sveltejs/kit';

/**
 * The theme is settled by the inline script before the first frame, never by the server: the
 * render is cached at the edge for every reader, so it cannot carry one reader's cookie.
 */
export const handle: Handle = ({ event, resolve }) =>
	resolve(event, {
		transformPageChunk: ({ html }) => html.replace('%theme.script%', themeScript),
	});
