/**
 * The public API host, `api.ffoni.com/{scope}/...`: the scope names the service, and the request
 * goes on to it with the scope taken off -- to a Worker by its binding, or to a node's Caddy over
 * Workers VPC, which takes the scope off itself. On the way it answers for the scope what every
 * service would otherwise repeat: CORS, and limits by address. See spec/architecture/services.md,
 * "One API host, scoped by path".
 */
import { UNCHANGING } from '@canmi/cache';
import { failure } from '@canmi/response';
import { SECURITY_TXT_PATH, securityResponse } from '@canmi/security';
import { robotsTxt } from '@canmi/robots';
import { DEVELOPMENT_PORTS, developmentUrl, isDevHost, pickUrls, URLS } from '@canmi/urls';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { MiddlewareHandler } from 'hono/types';
import { CACHE_HEADER, cacheable, keyOf, secondsFor, store, toKeep } from './cache.ts';
import { counted } from './limit.ts';
import { POLICIES, type Policy } from './policy.ts';
import { SCOPES } from './scopes.ts';
import { type Scope, WORKERS } from './table.ts';

/** Every binding a scope or a limit names, read by name and checked at the one place it is used. */
export type Env = Readonly<Record<string, unknown>>;

/**
 * The header every request the gateway passes on carries, set here whatever the caller sent, so a
 * service can tell the public from our own callers, who reach it without the gateway. See
 * spec/architecture/services.md, "The gateway marks what it passes on".
 */
export const MARK = { name: 'x-gateway', value: 'public' } as const;

/** The public suffix a node's Caddy answers the API host under on its tunnel's side. */
const NODE_API = `api.${new URL(URLS.internal.app).hostname}`;

/**
 * Whether an answer is a service's own, rather than a gateway or a proxy on the way saying it
 * could not reach one: every service here answers in the JSON envelope, and a proxy's error page
 * is not JSON.
 */
function serviceOwn(response: Response): boolean {
	if (response.status < 500) return true;
	return response.headers.get('content-type')?.startsWith('application/json') ?? false;
}

/** Every key an object holds, however deep, so a nested one cannot slip a forbidden name past. */
function keysOf(value: unknown): string[] {
	if (Array.isArray(value)) return value.flatMap(keysOf);
	if (value === null || typeof value !== 'object') return [];
	return Object.entries(value).flatMap(([key, inner]) => [key, ...keysOf(inner)]);
}

/**
 * Whether a request sends a name the public may not: as a query parameter, or as a key anywhere in
 * a JSON body. A body that is not JSON is the service's to refuse.
 */
async function forbids(forbidden: readonly string[], url: URL, request: Request): Promise<boolean> {
	if (forbidden.length === 0) return false;
	if (forbidden.some((name) => url.searchParams.has(name))) return true;
	if (!request.headers.get('content-type')?.includes('json')) return false;
	try {
		const keys = keysOf(await request.clone().json());
		return forbidden.some((name) => keys.includes(name));
	} catch {
		return false;
	}
}

function isFetcher(value: unknown): value is Fetcher {
	return typeof (value as Fetcher | undefined)?.fetch === 'function';
}

/** The first path segment, and the path after it as the service sees it. */
function split(url: URL): { scope: string; rest: string } {
	const [, scope = '', ...rest] = url.pathname.split('/');
	return { scope, rest: `/${rest.join('/')}` };
}

function corsFor(policy: Policy): MiddlewareHandler | undefined {
	const { origin } = policy;
	if (!origin) return undefined;
	return cors({
		origin: (asked, c) => origin(asked, c.req.raw),
		allowMethods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
		allowHeaders: ['Content-Type'],
		maxAge: 86_400,
	});
}

/**
 * Where a scope's binding sends the request: the binding itself, or in development, where the
 * bound Worker may be a Vite server rather than a wrangler session, that Worker's development
 * address. See spec/architecture/services.md, "Development goes through the gateway too".
 */
function destination(value: unknown, target: Scope): Fetcher | string | undefined {
	if (isFetcher(value)) return value;
	const worker = target.worker;
	if (value !== DEVELOPMENT || !worker || !Object.hasOwn(DEVELOPMENT_PORTS, worker))
		return undefined;
	return developmentUrl(worker as keyof typeof DEVELOPMENT_PORTS);
}

/** What a scope's binding is set to, as a variable, where the Worker runs in development. */
const DEVELOPMENT = 'development';

export function gateway(
	scopes: Readonly<Record<string, Scope>> = SCOPES,
	policies: Readonly<Record<string, Policy>> = POLICIES,
) {
	const corsOf = new Map(
		Object.entries(policies).flatMap(([scope, policy]) => {
			const handler = corsFor(policy);
			return handler ? [[scope, handler] as const] : [];
		}),
	);
	const app = new Hono<{ Bindings: Env }>();

	// An API has nothing to index, and its URLs in search results would compete with the pages
	// that call them.
	app.get('/robots.txt', (c) => c.text(robotsTxt({ disallow: ['/'] })));
	app.get(SECURITY_TXT_PATH, (c) => securityResponse(c.req.raw));
	// The name a browser asks every origin for, sent where the CDN and the site send it.
	app.get('/favicon.ico', (c) => {
		const urls = pickUrls(isDevHost(new URL(c.req.url).hostname));
		c.header('Cache-Control', UNCHANGING);
		return c.redirect(`${urls.alias}/symlink/favicon.ico`, 301);
	});

	// The host's own address is somebody typing it, not a malformed call: they go to the site, and
	// `ref` tells the site's analytics where from.
	app.get('/', (c) => {
		const urls = pickUrls(isDevHost(new URL(c.req.url).hostname));
		return c.redirect(`${urls.site}/?ref=api`, 301);
	});

	app.use('*', async (c, next) => {
		const { scope } = split(new URL(c.req.url));
		// Every path here is under a scope, so one without is malformed, not missing.
		if (scope === '') return failure(400, 'invalid_path');
		if (!Object.hasOwn(scopes, scope)) return failure(404, 'no_such_scope');
		const handler = corsOf.get(scope);
		return handler ? handler(c, next) : next();
	});

	app.all('*', async (c) => {
		const url = new URL(c.req.url);
		const { scope, rest } = split(url);
		const target = scopes[scope] as Scope;
		const policy = Object.hasOwn(policies, scope) ? (policies[scope] as Policy) : {};
		const address = c.req.header('cf-connecting-ip');
		if (await forbids(policy.forbidden ?? [], url, c.req.raw)) {
			return failure(403, 'forbidden_parameter');
		}
		// A kept answer is given before any limit is counted: it costs the node nothing.
		const shelf = cacheable(c.req.raw) ? store() : null;
		const key = keyOf(url);
		const hit = shelf ? await shelf.match(key) : undefined;
		if (hit) return new Response(c.req.method === 'HEAD' ? null : hit.body, hit);
		/** Keep what may be kept, where a GET asked for it, and say it was not already kept. */
		const answered = (answer: Response, unreached = false): Response => {
			const seconds =
				shelf && c.req.method === 'GET' ? secondsFor(answer, policy.cache, unreached) : 0;
			if (shelf && seconds > 0) {
				const kept = shelf.put(key, toKeep(answer, seconds));
				try {
					c.executionCtx.waitUntil(kept);
				} catch {
					// No execution context outside a Worker; the put simply runs on its own.
				}
			}
			const returned = new Response(answer.body, answer);
			returned.headers.set(CACHE_HEADER, 'miss');
			return returned;
		};
		const taken = await counted(c.env.limits, scope, target.limits ?? [], {
			method: c.req.method,
			path: rest,
			address,
		});
		if (!taken.allowed) {
			return failure(429, 'rate_limited', { headers: { 'Retry-After': String(taken.retryAfter) } });
		}
		const binding = destination(c.env[target.binding], target);
		if (!binding) return failure(502, 'scope_unavailable');

		let forwarded = new URL(url);
		if (target.placement === WORKERS) {
			forwarded.pathname = `${target.prefix ?? ''}${rest}`;
			if (typeof binding === 'string')
				forwarded = new URL(`${forwarded.pathname}${url.search}`, binding);
		} else {
			forwarded.protocol = 'http:';
			forwarded.host = NODE_API;
		}
		const request = new Request(forwarded, c.req.raw);
		request.headers.set(MARK.name, MARK.value);
		// The machine at home can be off, or its tunnel down; either is the service being out of
		// reach, which is what the caller is told, in the envelope, rather than a proxy's page.
		let answer: Response;
		try {
			answer = await (typeof binding === 'string' ? fetch(request) : binding.fetch(request));
		} catch {
			return answered(failure(502, 'upstream_unavailable'), true);
		}
		if (!serviceOwn(answer)) return answered(failure(502, 'upstream_unavailable'), true);
		// A fetched response's headers are immutable, and CORS adds to them on the way out.
		return answered(answer);
	});

	return app;
}
