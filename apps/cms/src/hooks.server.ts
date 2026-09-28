import { dividerScript } from '@canmi/behavior/resize';
import { themeScript } from '@canmi/theme';
import type { Handle, HandleFetch } from '@sveltejs/kit';
import { LOCAL_ORIGIN } from '$lib/local.ts';
import { foldedScript, SIDEBAR } from '$lib/sidebar.ts';

/**
 * The theme bootstrap and the sidebar's remembered width, written into the shell before anything
 * paints, as the site does it (spec/architecture/workspace.md); after hydration would be a frame of
 * the fallback and then a jump. A hook, not Vite's `transformIndexHtml`: SvelteKit renders
 * `app.html` itself and never hands it to that hook, so the placeholder reached the browser
 * unparsed. It runs on every request in development, and at build time on the one request
 * adapter-static makes for the fallback page the static build serves.
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
