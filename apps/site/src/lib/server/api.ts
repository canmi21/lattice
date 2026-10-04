import { dev } from '$app/env';
import { env as worker, waitUntil } from 'cloudflare:workers';
import api, { PUBLIC_ROUTES } from '@canmi/site-api';
import { read, SHAPES, type Route } from '@canmi/site-api/routes';
import { failure } from '@canmi/response';
import { URLS } from '@monoflake/sdk';
import type { RequestEvent } from '@sveltejs/kit';
import { readAddress } from '#lib/api.js';

/** Where the site's pages ask its API, on the site's own origin. */
export const API_PREFIX = '/api/';

/** The public API host. A request naming it reached this Worker through the gateway's binding. */
const API_HOST = new URL(URLS.apps.production.api).hostname;

/**
 * A public route as `/v1/` names it, by its shape rather than its contract: the route, and the
 * query its handler reads. See the workspace's spec/addresses.md.
 */
function publicV1(path: string): { route: Route; query: Record<string, string> } | undefined {
	for (const route of PUBLIC_ROUTES as ReadonlySet<Route>) {
		const query = read(SHAPES[route], path);
		if (query) return { route, query };
	}
	return undefined;
}

/**
 * The API's bindings: the Worker's own, with the records read from the tree in development. They
 * come from `cloudflare:workers`, which the adapter emulates under `vite dev`; `event.platform`
 * carries none since SvelteKit 3.
 */
async function bindings(): Promise<Record<string, unknown>> {
	const env: Record<string, unknown> = { ...(worker as unknown as Record<string, unknown>) };
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
 * Two doors reach it. The site's pages ask under `/api/`, by the address `readAddress` reads; the
 * gateway asks as the public API host, for the public routes alone. See
 * platform's spec/architecture/services.md, "The site's API runs in the site's Worker".
 */
export async function answer(event: RequestEvent): Promise<Response | undefined> {
	const { url } = event;
	const outside = url.hostname === API_HOST;
	if (!outside && !url.pathname.startsWith(API_PREFIX)) return undefined;
	const segment = url.pathname.startsWith(API_PREFIX) ? url.pathname.slice(API_PREFIX.length) : '';
	// A public route at `/v1/` is public by name, so whichever door asks: in development the gateway
	// reaches this Worker on this machine's name rather than the API host's.
	const asked = segment.startsWith('v1/')
		? publicV1(segment.slice('v1/'.length))
		: outside
			? undefined
			: readAddress(segment);

	if (!asked) return failure(404, 'no_such_route');

	const inner = new URL(url);
	inner.pathname = `/${asked.route}`;
	for (const [name, value] of Object.entries(asked.query)) inner.searchParams.set(name, value);
	// The API asks only `waitUntil` of its context; the Worker's own comes from the same module.
	const context = { waitUntil, passThroughOnException: () => {}, props: {} } as ExecutionContext;
	return api.fetch(
		withAddress(new Request(inner, event.request), event),
		await bindings(),
		context,
	);
}

/**
 * `request` as the API reads it. Cloudflare states the caller's address in `CF-Connecting-IP`, and
 * the routes that count by it refuse a call without one; nothing states it under `vite dev`, so
 * there the address the dev server was asked from stands in. Production never fills it in.
 */
function withAddress(request: Request, event: RequestEvent): Request {
	if (!dev || request.headers.has('CF-Connecting-IP')) return request;
	const headers = new Headers(request.headers);
	headers.set('CF-Connecting-IP', event.getClientAddress());
	return new Request(request, { headers });
}
