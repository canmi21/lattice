import { fillTheme } from '@canmi/kit/theme';
import type { Handle } from '@sveltejs/kit/hooks';

/** Every page with the reader's theme written in before it is sent; see lib's spec/kit/theme.md. */
export const handle: Handle = ({ event, resolve }) =>
	resolve(event, { transformPageChunk: ({ html }) => fillTheme(html) });
