import type { Row } from '@monoflake/sdk/limits';

/**
 * The per-address allowances of spec/engagement.md, counted by `quota`. These routes are called by
 * the site's own pages without the gateway, so the Worker asks for them itself, in the same rows a
 * `service.toml` declares. The read counter's minute is not here: it withholds an increment rather
 * than refusing anybody, which makes it part of what `/read` means. See spec/architecture/quota.md.
 */
export const LIMITS: readonly Row[] = [
	{ methods: ['POST', 'DELETE'], path: '/newsletter', count: 5, seconds: 60 },
	{ methods: ['PUT'], path: '/like', count: 10, seconds: 60 },
	{ methods: ['GET', 'HEAD'], path: '/like', count: 60, seconds: 60 },
	{ methods: ['GET', 'HEAD'], path: '/stats', count: 60, seconds: 60 },
	{ methods: ['GET', 'HEAD', 'POST'], path: '/read', count: 60, seconds: 60 },
];
