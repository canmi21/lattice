import type { Lifetime } from './cache.ts';

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
	 * How long answers are kept at the gateway when the service does not say: five minutes for a
	 * success and a failure alike unless given here, and `false` for none kept.
	 */
	readonly cache?: Lifetime;
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
	// `internal` reaches the LAN, which is ours alone. See spec/architecture/shot.md.
	shot: {
		forbidden: ['internal'],
	},
};
