import { themeScript } from '@canmi/theme';
import type { Handle } from '@sveltejs/kit';

/**
 * The theme bootstrap, written into the shell before anything paints -- the same script the site
 * runs, substituted the way the site substitutes it. See spec/architecture/workspace.md.
 *
 * A hook rather than Vite's `transformIndexHtml`, which is what stood here and never ran: SvelteKit
 * renders `app.html` itself and does not hand it to that hook, so the placeholder reached the
 * browser as a script that failed to parse and the theme was never applied. This runs in
 * development on every request, and at build time on the one request adapter-static makes to
 * render the fallback page, which is the page the static build serves.
 */
export const handle: Handle = ({ event, resolve }) =>
	resolve(event, { transformPageChunk: ({ html }) => html.replace('%theme.script%', themeScript) });
