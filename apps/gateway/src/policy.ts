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
}

/**
 * None yet. The site's public routes are read by servers, not browsers, and are the cacheable
 * records; the routes that write are the site's own and limited in its Worker.
 */
export const POLICIES: Readonly<Record<string, Policy>> = {};
