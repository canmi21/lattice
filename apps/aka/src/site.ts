import { isDevHost, pickUrls } from '@monoflake/sdk';
import type { Context } from 'hono';

/**
 * Asking one of the site's public routes, `path` after the site's scope and version. By the
 * site's binding in production: the gateway answers this layer, so asking the gateway's own host
 * from behind it would be asking in a circle, which Cloudflare refuses. In development, through
 * the development API host, since the site runs there in no Worker a binding could reach. See
 * spec/architecture/gateway.md, "Where a request goes".
 */
export function askSite(c: Context, path: string): Promise<Response> {
	const developing = isDevHost(new URL(c.req.url).hostname);
	const api = pickUrls(developing).api;
	const site = (c.env as { SITE?: { fetch?: unknown } } | undefined)?.SITE;
	if (developing || typeof site?.fetch !== 'function') return fetch(`${api}${path}`);
	// The API host's own name, the site's API prefix and the version, as the gateway would send it:
	// the site reads a request on that name as one through the public door.
	return (site as Fetcher).fetch(new Request(`${new URL(api).origin}/api/v1${path}`));
}
