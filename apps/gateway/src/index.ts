/**
 * The public API host, `api.ffoni.com/{scope}/...`: the scope names the service, and the request
 * goes on to it with the scope taken off -- to a Worker by its binding, or to a node's Caddy over
 * Workers VPC, which takes the scope off itself. On the way it answers for the scope what every
 * service would otherwise repeat: CORS, and limits by address. See spec/architecture/services.md,
 * "One API host, scoped by path".
 */
import { failure } from '@canmi/response';
import { robotsTxt } from '@canmi/robots';
import { SECURITY_TXT_PATH, securityResponse } from '@canmi/security';
import type { Service } from '@canmi/security/agents';
import { followSymlink, symlinkOf } from '@canmi/symlink';
import {
	DEVELOPMENT_PORTS,
	developmentUrl,
	GATEWAY,
	isDevHost,
	normalizedLocation,
	PAGE_ORIGINS,
	pickUrls,
	URLS,
} from '@canmi/urls';
import { type Context, Hono } from 'hono';
import { cors } from 'hono/cors';
import type { MiddlewareHandler } from 'hono/types';
import {
	CACHE_HEADER,
	cacheable,
	controlOf,
	keyOf,
	kindOf,
	secondsOf,
	store,
	toKeep,
	whole,
} from './cache.ts';
import { GATEWAY_DEFAULTS, type Route } from './declaration.ts';
import { counted } from './limit.ts';
import { type Profile, profileOf, readRequest, type Tuple } from './profile.ts';
import { SCOPES } from './scopes.ts';
import { type Scope, WORKERS } from './table.ts';

/** Every binding a scope or a limit names, read by name and checked at the one place it is used. */
export type Env = Readonly<Record<string, unknown>> & {
	/**
	 * The probe's own token, a Worker secret: a request carrying it in `x-probe` is not counted
	 * against any address's limit, as Cloudflare's own rate rules leave it uncounted too. Absent,
	 * nothing is ever exempt. See spec/architecture/probe.md, "The probe passes the limits it is
	 * checking through with a token of its own".
	 */
	readonly PROBE_TOKEN?: string;
};

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

/**
 * Compares two strings without a data-dependent branch, so a mismatch's length or first differing
 * byte cannot be timed out of it. The probe's token is a secret, and this is the one place it is
 * compared against what a caller sent.
 */
function timingSafeEqual(a: string, b: string): boolean {
	const x = new TextEncoder().encode(a);
	const y = new TextEncoder().encode(b);
	let diff = x.length ^ y.length;
	for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
	return diff === 0;
}

/**
 * Whether a request is the probe's, by `x-probe` equaling `env.PROBE_TOKEN`: exempt from the
 * per-address limit here, as from Cloudflare's rate rules too. See spec/architecture/probe.md. An
 * absent secret means nothing is ever exempt, rather than an empty comparison the probe could
 * pass with an empty header.
 */
function isProbe(headers: Headers, env: Env): boolean {
	const token = env.PROBE_TOKEN;
	if (typeof token !== 'string' || token === '') return false;
	const sent = headers.get('x-probe');
	return sent !== null && timingSafeEqual(sent, token);
}

function isFetcher(value: unknown): value is Fetcher {
	return typeof (value as Fetcher | undefined)?.fetch === 'function';
}

/** What a path falls to where its service declares nothing for it. */
const DEFAULT_ROUTE: Route = { path: '/*', ...GATEWAY_DEFAULTS };

/** The route of `scope` that `path` falls under: the first match, most specific first. */
export function routeOf(scope: Scope, path: string): Route {
	for (const route of scope.routes) {
		if (route.path.endsWith('/*') ? path.startsWith(route.path.slice(0, -1)) : path === route.path)
			return route;
	}
	return DEFAULT_ROUTE;
}

/** A route's CORS as a middleware, its service codes read as the origins of their pages. */
function corsFor(route: Route): MiddlewareHandler | undefined {
	const declared = route.cors;
	if (!declared) return undefined;
	const listed =
		declared.origins === 'public'
			? null
			: new Set(declared.origins.flatMap((code) => PAGE_ORIGINS[code] ?? []));
	return cors({
		origin: (asked) => (listed ? (listed.has(asked) ? asked : null) : '*'),
		allowMethods: [...declared.methods, 'OPTIONS'],
		allowHeaders: ['Content-Type', ...declared.headers],
		maxAge: 86_400,
	});
}

/** Which host a profile is, for the files every host answers: its note, its mark, its `ref`. */
function hostOf(profile: Profile): Service {
	if (profile.service === 'cdn') return 'cdn';
	if (profile.service === 'aka') return 'aka';
	return 'api';
}

/** What the site's analytics is told a visitor typing a host's own address came from. */
const REF: Readonly<Record<Service, string>> = {
	api: 'api',
	cdn: 'cdn',
	aka: 'alias',
	site: 'site',
	status: 'status',
};

/**
 * A declared route as a crawler would match it on `profile`'s host: the version the path names,
 * the service the path names, then the route -- a prefix as itself, an exact path ending in `$`.
 * `undefined` where the host does not reach it.
 */
function publicPath(profile: Profile, service: string, path: string): string | undefined {
	const prefix = profile.prefix ?? '';
	if (prefix && !path.startsWith(`${prefix}/`) && path !== `${prefix}/*`) return undefined;
	const own = path.endsWith('/*') ? path.slice(prefix.length, -1) : `${path.slice(prefix.length)}$`;
	const version = profile.version === undefined ? '/*' : '';
	const named = profile.service === undefined ? `/${service}` : '';
	return `${version}${named}${own.startsWith('/') ? own : `/${own}`}`;
}

/**
 * A host's robots.txt: every crawler refused where the host admits none, and otherwise what the
 * routes it reaches say, refused by default, with each route that differs from its service's own
 * defaults said where it does. See spec/architecture/gateway.md, "A host admits crawlers or does
 * not".
 */
function robotsOf(profile: Profile, scopes: Readonly<Record<string, Scope>>): string {
	if (!profile.crawled) return robotsTxt({ disallow: ['/'], agent: hostOf(profile) });
	const allow: string[] = [];
	const disallow: string[] = [];
	for (const [service, scope] of Object.entries(scopes)) {
		if (profile.service !== undefined && profile.service !== service) continue;
		const base = scope.routes.at(-1) ?? DEFAULT_ROUTE;
		for (const route of scope.routes) {
			if (!route.exposed) continue;
			if (route === base ? !route.crawlable : route.crawlable === base.crawlable) continue;
			const path = publicPath(profile, service, route.path);
			if (path) (route.crawlable ? allow : disallow).push(path);
		}
	}
	return robotsTxt({ allow, disallow: [...disallow, '/'], agent: hostOf(profile) });
}

/**
 * Where a scope's binding sends the request: the binding itself, or in development, where the
 * bound Worker may be a Vite server rather than a wrangler session, that Worker's development
 * address. See spec/architecture/services.md, "Development goes through the gateway too".
 */
function destination(value: unknown, target: Scope): Fetcher | string | undefined {
	if (isFetcher(value)) return value;
	const worker = target.worker && (PORTED[target.worker] ?? target.worker);
	if (value !== DEVELOPMENT || !worker || !Object.hasOwn(DEVELOPMENT_PORTS, worker))
		return undefined;
	return developmentUrl(worker as keyof typeof DEVELOPMENT_PORTS);
}

/** A Worker whose development port is pinned under another name: the alias layer's is `alias`. */
const PORTED: Readonly<Record<string, string>> = { aka: 'alias' };

/** What a scope's binding is set to, as a variable, where the Worker runs in development. */
const DEVELOPMENT = 'development';

/** What the gateway has read of a request by the time it is forwarded. */
interface Read {
	readonly tuple: Tuple;
	readonly target: Scope;
	readonly route: Route;
}

type Gate = Context<{ Bindings: Env; Variables: { read: Read } }>;

/** Whether this is a development session: a binding set to it, or this machine's own host. */
function developing(c: Gate): boolean {
	return Object.values(c.env).includes(DEVELOPMENT) || isDevHost(new URL(c.req.url).hostname);
}

/**
 * The address as the profiles read it. A development session answers on this machine's name, and
 * reads as the API host its callers are written against until they move.
 */
function asked(c: Gate): URL {
	const url = new URL(c.req.url);
	if (isDevHost(url.hostname)) url.host = GATEWAY.retired.api;
	return url;
}

export function gateway(scopes: Readonly<Record<string, Scope>> = SCOPES) {
	const corsOf = new Map<Route, MiddlewareHandler | undefined>();
	const app = new Hono<{ Bindings: Env; Variables: { read: Read } }>();

	// One spelling per address: a path that normalizes differently goes where it should.
	// See spec/architecture/delivery.md, "Every address has one spelling".
	app.use('*', async (c, next) => {
		const normal = normalizedLocation(new URL(c.req.url));
		return normal ? c.redirect(normal.location, normal.status) : next();
	});

	// Every host's own files, from its profile, before any service is read. See
	// spec/architecture/gateway.md, "Every host's files and firewall are derived".
	app.use('*', async (c, next) => {
		const profile = profileOf(asked(c).hostname);
		if (!profile) return failure(404, 'no_such_host');
		const host = hostOf(profile);
		const { pathname } = new URL(c.req.url);
		if (c.req.method !== 'GET' && c.req.method !== 'HEAD') return next();
		if (pathname === '/robots.txt') return c.text(robotsOf(profile, scopes));
		if (pathname === SECURITY_TXT_PATH) return securityResponse(c.req.raw, host);
		// The name a browser asks every origin for, followed in one hop. See
		// spec/architecture/delivery.md, "A page follows the name for the browser".
		if (pathname === '/favicon.ico') {
			// Through the alias layer's binding where there is one: once the gateway answers the alias
			// layer's own host, asking that host would be asking itself.
			const aka = c.env.AKA;
			const fetcher: typeof fetch = isFetcher(aka)
				? (input, init) => aka.fetch(new Request(input, init))
				: fetch;
			return followSymlink(symlinkOf(pickUrls(developing(c)).alias, host, 'favicon.ico'), fetcher);
		}
		// The host's own address is somebody typing it: they go to the site, and `ref` tells the
		// site's analytics where from.
		if (pathname === '/') {
			return c.redirect(`${pickUrls(developing(c)).site}/?ref=${REF[host]}`, 301);
		}
		return next();
	});

	app.use('*', async (c, next) => {
		const tuple = readRequest(asked(c));
		// A path that names no version or no service is malformed, not missing.
		if (tuple === 'no_such_host') return failure(404, 'no_such_host');
		if (typeof tuple === 'string') return failure(400, 'invalid_path');
		if (!Object.hasOwn(scopes, tuple.service)) return failure(404, 'no_such_scope');
		const target = scopes[tuple.service] as Scope;
		const route = routeOf(target, tuple.path);
		// A path the service does not open is no address, before a limit or the service is asked.
		if (!route.exposed) return failure(404, 'no_such_route');
		c.set('read', { tuple, target, route });
		if (!corsOf.has(route)) corsOf.set(route, corsFor(route));
		const handler = corsOf.get(route);
		return handler ? handler(c, next) : next();
	});

	app.all('*', async (c) => {
		const url = new URL(c.req.url);
		const { tuple, target, route } = c.get('read');
		const address = c.req.header('cf-connecting-ip');
		if (await forbids(route.forbidden, url, c.req.raw)) {
			return failure(403, 'forbidden_parameter');
		}
		// A kept answer is given before any limit is counted: it costs the node nothing.
		const shared = cacheable(c.req.raw);
		const shelf = shared ? store() : null;
		const key = keyOf(url);
		const hit = shelf ? await shelf.match(key) : undefined;
		if (hit) return new Response(c.req.method === 'HEAD' ? null : hit.body, hit);
		/**
		 * The answer as the route declares it is kept: its lifetime stamped over the service's own,
		 * and kept here too where a GET from nobody in particular asked for it.
		 */
		const answered = (answer: Response, unreached = false): Response => {
			const lifetime = answer.headers.has('set-cookie')
				? 0
				: route.cache[kindOf(answer.status, unreached)];
			const returned = new Response(answer.body, answer);
			const personal = c.req.raw.headers.has('authorization') || c.req.raw.headers.has('cookie');
			returned.headers.set(
				'cache-control',
				personal && c.req.method === 'GET' ? 'private, no-store' : controlOf(lifetime),
			);
			const seconds = shelf && c.req.method === 'GET' && whole(answer) ? secondsOf(lifetime) : 0;
			if (shelf && seconds > 0) {
				const kept = shelf.put(key, toKeep(returned));
				try {
					c.executionCtx.waitUntil(kept);
				} catch {
					// No execution context outside a Worker; the put simply runs on its own.
				}
			}
			returned.headers.set(CACHE_HEADER, 'miss');
			return returned;
		};
		const taken = isProbe(c.req.raw.headers, c.env)
			? { allowed: true, retryAfter: 0 }
			: await counted(c.env.limits, tuple.service, target.limits ?? [], {
					method: c.req.method,
					path: tuple.path,
					address,
				});
		if (!taken.allowed) {
			return failure(429, 'rate_limited', { headers: { 'Retry-After': String(taken.retryAfter) } });
		}
		const binding = destination(c.env[target.binding], target);
		if (!binding) return failure(502, 'scope_unavailable');

		let forwarded = new URL(url);
		if (target.placement === WORKERS) {
			forwarded.pathname = `${target.prefix ?? ''}${tuple.forward}`;
			if (typeof binding === 'string')
				forwarded = new URL(`${forwarded.pathname}${url.search}`, binding);
		} else {
			// Caddy takes the scope off itself; see spec/architecture/services.md, "One door per node".
			forwarded.protocol = 'http:';
			forwarded.host = NODE_API;
			forwarded.pathname = `/${tuple.service}${tuple.forward}`;
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
		return answered(answer);
	});

	return app;
}
