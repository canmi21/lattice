/**
 * Everything under `/api`, and CI's `/notice`, is host's and is passed on to it; every other path
 * is a page of the panel's own. See spec/architecture/host.md, "The panel is an app of its own".
 */
import { normalizedLocation } from '@canmi/urls';
import type { Handle } from '@sveltejs/kit';
import { forward, SESSION } from '$lib/server/core';

function host(path: string): boolean {
	return path.startsWith('/api/') || path === '/notice';
}

export const handle: Handle = async ({ event, resolve }) => {
	// One spelling per address, method kept. See spec/architecture/delivery.md, "Every address has
	// one spelling".
	const location = normalizedLocation(event.url);
	if (location) return new Response(null, { status: 308, headers: { location } });
	if (host(event.url.pathname)) {
		return forward(event.request, event.url, event.cookies.get(SESSION));
	}
	return resolve(event);
};
