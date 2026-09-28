/**
 * The public API host, `api.ffoni.com/{scope}/...`: the scope names the service, and the request
 * goes on to it with the scope taken off -- to a Worker by its binding, or to a node's Caddy over
 * Workers VPC, which takes the scope off itself. On the way it answers for the scope what every
 * service would otherwise repeat: CORS, and limits by address. See spec/architecture/services.md,
 * "One API host, scoped by path".
 */
import type { ApiResponse } from '@canmi/artifacts';
import { URLS } from '@canmi/urls';
import { type Context, Hono } from 'hono';
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
function refuse(status: 400 | 404 | 429 | 502, message: string, headers: HeadersInit = {}) {
	return Response.json({ status: 'error', message } satisfies ApiResponse<never>, {
		status,
		headers: { 'Cache-Control': 'no-store', ...headers },
	});
}

function isFetcher(value: unknown): value is Fetcher {
	return typeof (value as Fetcher | undefined)?.fetch === 'function';
}

function isLimiter(value: unknown): value is RateLimit {
	return typeof (value as RateLimit | undefined)?.limit === 'function';
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

/** Whether the caller is within its allowance. One with no address is not limited here. */
async function allowed(c: Context<{ Bindings: Env }>, policy: Policy, rest: string) {
	const method = c.req.method;
	const limit = policy.limits?.find((l) => l.path === rest && l.methods.includes(method));
	const address = c.req.header('cf-connecting-ip');
	if (!limit || !address) return true;
	const limiter = c.env[limit.limiter];
	// A limit whose binding is missing is a deploy that went wrong, and failing open would hide it.
	if (!isLimiter(limiter)) return false;
	return (await limiter.limit({ key: address })).success;
}

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
		if (!(await allowed(c, policy, rest))) {
			return refuse(429, 'rate_limited', { 'Retry-After': '60' });
		}
		const binding = c.env[target.binding];
		if (!isFetcher(binding)) return refuse(502, 'scope_unbound');

		const forwarded = new URL(url);
		if (target.placement === WORKERS) {
			forwarded.pathname = rest;
		} else {
			forwarded.protocol = 'http:';
			forwarded.host = NODE_API;
		}
		const answer = await binding.fetch(new Request(forwarded, c.req.raw));
		// A fetched response's headers are immutable, and CORS adds to them on the way out.
		return new Response(answer.body, answer);
	});

	return app;
}

export default gateway();
