import { fillTheme } from '@canmi/theme';
import type { Handle } from '@sveltejs/kit';

/**
 * The script alone, never the class: the render is cached at the edge for every reader, so it
 * cannot carry one reader's cookie. See spec/styling/palettes.md.
 */
export const handle: Handle = ({ event, resolve }) =>
	resolve(event, { transformPageChunk: ({ html }) => fillTheme(html) });
