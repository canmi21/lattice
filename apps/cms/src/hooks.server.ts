import { dividerScript } from '@canmi/behavior/resize';
import { themeScript } from '@canmi/theme';
import type { Handle, HandleFetch } from '@sveltejs/kit';
import { LOCAL_ORIGIN } from '$lib/local.ts';
import { foldedScript, SIDEBAR } from '$lib/sidebar.ts';

/**
 * The theme bootstrap, written into the shell before anything paints -- the same script the site
 * runs, substituted the way the site substitutes it. See spec/architecture/workspace.md. The
 * sidebar's remembered width is set the same way and for the same reason: after hydration would
 * be a frame at the fallback width and then a jump.
 *
 * A hook rather than Vite's `transformIndexHtml`, which is what stood here and never ran: SvelteKit
 * renders `app.html` itself and does not hand it to that hook, so the placeholder reached the
 * browser as a script that failed to parse and the theme was never applied. This runs in
 * development on every request, and at build time on the one request adapter-static makes to
 * render the fallback page, which is the page the static build serves.
 */
export const handle: Handle = ({ event, resolve }) =>
	resolve(event, {
		transformPageChunk: ({ html }) =>
			html
				.replace('%theme.script%', themeScript)
				.replace('%sidebar.script%', `${dividerScript(SIDEBAR)};${foldedScript()}`),
	});

/**
 * A page rendered here reads `local` the way the browser does, by asking its own origin for
 * `/collection` -- but the forwarding is the dev server's proxy, which a server-side fetch never
 * passes through. So the request is sent to `local` directly, and to it alone.
 */
export const handleFetch: HandleFetch = ({ event, request, fetch }) => {
	const url = new URL(request.url);
	if (url.origin !== event.url.origin || !url.pathname.startsWith('/collection')) {
		return fetch(request);
	}
	return fetch(new Request(`${LOCAL_ORIGIN}${url.pathname}${url.search}`, request));
};
