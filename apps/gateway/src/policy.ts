import { DEVELOPMENT_PORTS, URLS, isDevHost } from '@canmi/urls';

/**
 * What the gateway enforces for a scope so the service behind it does not: which browsers may call
 * it, and how often one address may. Written here rather than in `service.toml`, because both name
 * origins, and every URL is declared once in libs/urls. See spec/architecture/services.md, "The
 * gateway holds what every API would otherwise repeat".
 */
export interface Policy {
	/**
	 * The origin to answer a browser with, or null to refuse it; absent, no browser may call the
	 * scope at all. `request` is the one the gateway received.
	 */
	readonly origin?: (origin: string, request: Request) => string | null;
	/** Limits by the caller's address, the first matching one applied. */
	readonly limits?: readonly Limit[];
}

export interface Limit {
	readonly methods: readonly string[];
	/** The path as the service sees it, with the scope taken off. */
	readonly path: string;
	/** The rate limit binding in wrangler.jsonc. */
	readonly limiter: string;
}

const SITE_ORIGINS: ReadonlySet<string> = new Set([
	URLS.apps.production.site,
	URLS.apps.development.site,
	URLS.internal.app,
	URLS.internal.infra,
	URLS.internal.alias,
]);

/**
 * The list and nothing else -- except a request with no `Origin`, and except in development.
 *
 * A request with no `Origin` is not a browser asking, so `*` grants it nothing. The site rendering
 * is not that case: SvelteKit sends the page's own origin from `load` and throws on an answer
 * without the header, so an origin missing here is a 500 on the site. The list names no port, and
 * no other port reaches a worker; see spec/architecture/delivery.md, "Only ports 80 and 443 reach
 * a worker".
 */
function siteOrigin(origin: string, request: Request): string | null {
	if (!origin) return '*';
	if (SITE_ORIGINS.has(origin)) return origin;
	// `localhost` and `127.0.0.1` are one machine spelled two ways, and the list names only the
	// first. The port still has to be the development site's, and only a request that arrived at a
	// development host is asked about it, so production's list is untouched.
	const asked = URL.parse(origin);
	if (!asked || !isDevHost(new URL(request.url).hostname)) return null;
	return isDevHost(asked.hostname) && asked.port === String(DEVELOPMENT_PORTS.site) ? origin : null;
}

export const POLICIES: Readonly<Record<string, Policy>> = {
	site: {
		origin: siteOrigin,
		// The per-address allowances of spec/engagement.md. The one limit left to the service is
		// the read counter's, which withholds an increment rather than refusing anybody.
		limits: [
			{ methods: ['POST', 'DELETE'], path: '/newsletter', limiter: 'SITE_NEWSLETTER_LIMIT' },
			{ methods: ['PUT'], path: '/like', limiter: 'SITE_LIKE_LIMIT' },
			{ methods: ['GET', 'HEAD'], path: '/like', limiter: 'SITE_ENGAGEMENT_LIMIT' },
			{ methods: ['GET', 'HEAD'], path: '/stats', limiter: 'SITE_ENGAGEMENT_LIMIT' },
			{ methods: ['GET', 'HEAD', 'POST'], path: '/read', limiter: 'SITE_ENGAGEMENT_LIMIT' },
		],
	},
};
