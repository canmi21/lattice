import { dev } from '$app/environment';
import api, { PUBLIC_ROUTES } from '@canmi/site-api';
import { failure } from '@canmi/response';
import { URLS } from '@canmi/urls';
import type { RequestEvent } from '@sveltejs/kit';
import { routeOf } from '$lib/api';

/** Where the site's pages ask its API, on the site's own origin. */
export const API_PREFIX = '/api/';

/** The public API host. A request naming it reached this Worker through the gateway's binding. */
const API_HOST = new URL(URLS.apps.production.api).hostname;

/**
 * The public routes as `/v1/` names them, the thing in the path, each read back into the route
 * and the query parameter its handler takes; the rest of the path is the thing, slashes and all,
 * since an asset's name may hold one. See the workspace's spec/addresses.md.
 */
const PUBLIC_V1: readonly { readonly prefix: string; readonly route: string; readonly by: string }[] = [
	{ prefix: 'v1/media/', route: 'media', by: 'resource' },
	{ prefix: 'v1/assets/', route: 'asset', by: 'name' },
];

/** A public `/v1/` path, as the route and the query its handler reads, or undefined for none. */
function publicV1(segment: string): { route: string; by: string; thing: string } | undefined {
	const shape = PUBLIC_V1.find(({ prefix }) => segment.startsWith(prefix));
	const thing = shape ? decodeURIComponent(segment.slice(shape.prefix.length)) : '';
	return shape && thing ? { route: shape.route, by: shape.by, thing } : undefined;
}

/** The API's bindings: the Worker's own, with the records read from the tree in development. */
async function bindings(event: RequestEvent): Promise<Record<string, unknown>> {
	const env: Record<string, unknown> = { ...event.platform?.env };
	// `ASSETS` is the site's build, not the records; the API reads the bucket in production and the
	// tree in development, where the bucket the adapter emulates is empty.
	delete env.ASSETS;
	if (dev) {
		delete env.STORE;
		env.ASSETS = (await import('./local-records')).localRecords;
	}
	return env;
}

/**
 * The API's answer to `event`, or undefined when it is not the API's to answer.
 *
 * Two doors reach it. The site's pages ask under `/api/`, by the name `routeOf` resolves; the
 * gateway asks as the public API host, for the public routes alone. See
 * spec/architecture/services.md, "The site's API runs in the site's Worker".
 */
export async function answer(event: RequestEvent): Promise<Response | undefined> {
	const { url } = event;
	const outside = url.hostname === API_HOST;
	if (!outside && !url.pathname.startsWith(API_PREFIX)) return undefined;
	const segment = url.pathname.startsWith(API_PREFIX) ? url.pathname.slice(API_PREFIX.length) : '';
	// Public by name, so whichever door asks: in development the gateway reaches this Worker on this
	// machine's name rather than the API host's.
	const versioned = publicV1(segment);
	const route =
		versioned?.route ??
		(outside ? (PUBLIC_ROUTES.has(segment) ? segment : undefined) : routeOf(segment));
	if (!route) return failure(404, 'no_such_route');

	const inner = new URL(url);
	inner.pathname = `/${route}`;
	if (versioned) inner.searchParams.set(versioned.by, versioned.thing);
	return api.fetch(
		new Request(inner, event.request),
		await bindings(event),
		event.platform?.context,
	);
}
