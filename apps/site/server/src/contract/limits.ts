import type { Limit } from '@canmi/limits';

/**
 * The per-address allowances of spec/engagement.md. These routes are called by the site's own
 * pages and never through the gateway, so the Worker enforces them itself, in the gateway's
 * format. The read counter's minute is not here: it withholds an increment rather than refusing
 * anybody, which makes it part of what `/read` means.
 */
export const LIMITS: readonly Limit[] = [
	{ methods: ['POST', 'DELETE'], path: '/newsletter', limiter: 'NEWSLETTER_LIMIT' },
	{ methods: ['PUT'], path: '/like', limiter: 'LIKE_LIMIT' },
	{ methods: ['GET', 'HEAD'], path: '/like', limiter: 'ENGAGEMENT_LIMIT' },
	{ methods: ['GET', 'HEAD'], path: '/stats', limiter: 'ENGAGEMENT_LIMIT' },
	{ methods: ['GET', 'HEAD', 'POST'], path: '/read', limiter: 'ENGAGEMENT_LIMIT' },
];
