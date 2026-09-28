import type { Limit } from '@canmi/limits';

/**
 * What the gateway enforces for a scope so the service behind it does not: which browsers may call
 * it, and how often one address may. Written here rather than in `service.toml`, because an origin
 * is a URL and every URL is declared once in libs/urls. See spec/architecture/services.md, "The
 * gateway holds what every API would otherwise repeat".
 */
export interface Policy {
	/**
	 * The origin to answer a browser with, or null to refuse it; absent, no browser may call the
	 * scope at all. `request` is the one the gateway received.
	 */
	readonly origin?: (origin: string, request: Request) => string | null;
	/** Limits by the caller's address, on the path as the service sees it. */
	readonly limits?: readonly Limit[];
	/**
	 * Query parameters the public may not send, refused with a 403 before the service sees them:
	 * what a service offers our own callers alone.
	 */
	readonly forbidden?: readonly string[];
}

/**
 * The site has none: its public routes are read by servers, not browsers, and the routes that write
 * are its own and limited in its Worker.
 */
export const POLICIES: Readonly<Record<string, Policy>> = {
	// A free lookup: any page may call it, and one address may ask about once a second. It answers
	// from memory, so the limit is what keeps a crawler from the machine at home, not the cost of
	// one answer. Our own Workers and the private host ask without it.
	geo: {
		origin: () => '*',
		limits: [{ methods: ['GET', 'HEAD'], path: '/address', limiter: 'GEO_LIMIT' }],
	},
	// Screenshots: a capture costs the machine seconds of a browser, so one address may start three a
	// minute, while asking after one and fetching it are free. `internal` reaches the LAN, which is
	// ours alone. See spec/architecture/shot.md.
	shot: {
		limits: [{ methods: ['GET', 'HEAD'], path: '/capture', limiter: 'SHOT_LIMIT' }],
		forbidden: ['internal'],
	},
};
