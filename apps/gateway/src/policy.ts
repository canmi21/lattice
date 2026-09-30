import { URLS } from '@canmi/urls';
import type { Lifetime } from './cache.ts';

/**
 * Where a page that reports to umami is served: the status page's two doors and the platform
 * door it links to, since each loads this tracker. Not the site: it reports to both clouds from
 * its own tracker load and never reaches this scope. See spec/analytics.md.
 */
const UMAMI_ORIGINS: ReadonlySet<string> = new Set([
	URLS.internal.status.canonical,
	URLS.internal.status.mirror,
	URLS.internal.app,
]);

/**
 * What the gateway does for a scope that is not a limit: which browsers may call it, what the
 * public may not send, how long answers are kept. Written here rather than in `service.toml`,
 * because an origin is a URL and every URL is declared once in libs/urls; a limit is the service's
 * own row. See spec/architecture/services.md, "The gateway holds what every API would otherwise
 * repeat".
 */
export interface Policy {
	/**
	 * The origin to answer a browser with, or null to refuse it; absent, no browser may call the
	 * scope at all. `request` is the one the gateway received.
	 */
	readonly origin?: (origin: string, request: Request) => string | null;
	/**
	 * Query parameters the public may not send, refused with a 403 before the service sees them:
	 * what a service offers our own callers alone.
	 */
	readonly forbidden?: readonly string[];
	/**
	 * Which paths of the scope the public may reach, as the service sees them: an entry ending in
	 * `/` is a prefix, anything else is exact. Absent, every path is forwarded. A path outside it is
	 * `no_such_route` before a limit is counted or the service is asked -- unlike `forbidden`, which
	 * assumes the route exists. See spec/analytics.md, "umami, self-hosted, for the pages that
	 * matter less".
	 */
	readonly paths?: readonly string[];
	/**
	 * Request headers a browser may send to the scope, besides `Content-Type`, which every scope
	 * already allows: what a preflight is answered with in `Access-Control-Allow-Headers`. Absent,
	 * none besides `Content-Type`.
	 */
	readonly headers?: readonly string[];
	/**
	 * How long answers are kept at the gateway when the service does not say: five minutes for a
	 * success and a failure alike unless given here, and `false` for none kept.
	 */
	readonly cache?: Lifetime;
}

/** Whether `path` is let through by `paths`: an exact match, or under a prefix ending in `/`. */
export function pathAllowed(paths: readonly string[] | undefined, path: string): boolean {
	if (!paths) return true;
	return paths.some((allowed) =>
		allowed.endsWith('/') ? path.startsWith(allowed) : path === allowed,
	);
}

/**
 * The site has none: its public routes are read by servers, not browsers, and the routes that write
 * are its own and limited in its Worker.
 */
export const POLICIES: Readonly<Record<string, Policy>> = {
	// A free lookup: any page may call it.
	geo: {
		origin: () => '*',
		// A place's address changes only when the gazetteer is deployed again.
		cache: { success: 86_400 },
	},
	// `internal` reaches the LAN, and `fresh` skips the thirty-minute reuse -- both ours alone.
	// See spec/architecture/shot.md.
	shot: {
		forbidden: ['internal', 'fresh'],
	},
	// A reporting page's one call: where the tracker posts. The script itself is umami's own
	// cloud, not served here -- see spec/analytics.md, "A page loads umami's own tracker from its
	// cloud, as the site does". Nothing else of umami's API is public -- its dashboard is
	// `umami.canmi.app`, behind Access. See spec/analytics.md, "umami, self-hosted, for the pages
	// that matter less".
	umami: {
		paths: ['/api/send'],
		origin: (origin) => (UMAMI_ORIGINS.has(origin) ? origin : null),
		// What v3's tracker sends beside `Content-Type`, from its one `fetch` in `send` --
		// github.com/umami-software/umami, src/tracker/index.ts.
		headers: ['x-umami-website-id', 'x-umami-hostname', 'x-umami-cache'],
	},
};
