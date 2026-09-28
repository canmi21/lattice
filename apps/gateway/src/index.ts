/**
 * The public API host, `api.ffoni.com/{scope}/...`: the scope names the service, and the request
 * goes on to it with the scope taken off -- to a Worker by its binding, or to a node's Caddy over
 * Workers VPC, which takes the scope off itself. On the way it answers for the scope what every
 * service would otherwise repeat: CORS, and limits by address. See spec/architecture/services.md,
 * "One API host, scoped by path".
 */
import type { ApiResponse } from '@canmi/artifacts';
import { limited, within } from '@canmi/limits';
import { robotsTxt } from '@canmi/robots';
import { DEVELOPMENT_PORTS, developmentUrl, URLS } from '@canmi/urls';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { MiddlewareHandler } from 'hono/types';
import { POLICIES, type Policy } from './policy.ts';
import { SCOPES } from './scopes.ts';
import { type Scope, WORKERS } from './table.ts';

/** Every binding a scope or a limit names, read by name and checked at the one place it is used. */
export type Env = Readonly<Record<string, unknown>>;

/** The public suffix a node's Caddy answers the API host under on its tunnel's side. */
const NODE_API = `api.${new URL(URLS.internal.app).hostname}`;

/** The same envelope every service behind the gateway answers in. */
function refuse(status: 400 | 404 | 502, message: string, headers: HeadersInit = {}) {
	return Response.json({ status: 'error', message } satisfies ApiResponse<never>, {
		status,
		headers: { 'Cache-Control': 'no-store', ...headers },
	});
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

	app.use('*', async (c, next) => {
		const { scope } = split(new URL(c.req.url));
		// Every path here is under a scope, so one without is malformed, not missing.
		if (scope === '') return refuse(400, 'no_scope');
		if (!Object.hasOwn(scopes, scope)) return refuse(404, 'no_such_scope');
		const handler = corsOf.get(scope);
		return handler ? handler(c, next) : next();
	});

	app.all('*', async (c) => {
		const url = new URL(c.req.url);
		const { scope, rest } = split(url);
		const target = scopes[scope] as Scope;
		const policy = Object.hasOwn(policies, scope) ? (policies[scope] as Policy) : {};
		const address = c.req.header('cf-connecting-ip');
		if (
			!(await within(policy.limits ?? [], c.env, { method: c.req.method, path: rest, address }))
		) {
			return limited();
		}
		const binding = destination(c.env[target.binding], target);
		if (!binding) return refuse(502, 'scope_unbound');

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
		const answer = await (typeof binding === 'string' ? fetch(request) : binding.fetch(request));
		// A fetched response's headers are immutable, and CORS adds to them on the way out.
		return new Response(answer.body, answer);
	});

	return app;
}

export default gateway();
