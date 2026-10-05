import { fillTheme } from '@canmi/kit/theme';
import { normalizedLocation } from '@monoflake/sdk';
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

export const handle = sequence(spellingHandle, themeHandle);
