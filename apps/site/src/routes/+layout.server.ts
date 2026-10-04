import { dev } from '$app/env';
import { marksOf } from '@monoflake/sdk/symlink';
import { pickUrls } from '@monoflake/sdk';
import { SITE_LANGUAGE } from '#lib/locale/index.js';
import { siteStats } from '#lib/published/index.js';
import type { LayoutServerLoad } from './$types';

// The path's spelling is the entry point's to settle, by the one rule every server shares, before
// any route reads it; SvelteKit's own trailing-slash redirect would answer first and by another.
// See spec/architecture/delivery.md, "Every address has one spelling".
export const trailingSlash = 'ignore';

/**
 * The negotiated locale and the two public counters, handed down together.
 *
 * It touches neither `url` nor `params`, so SvelteKit never re-runs it on a client navigation and
 * the answer travels with the hydrated page -- which keeps the negotiation single and on the
 * server, and is why the counters are here rather than in a universal load: that one runs again in
 * the browser and would spend the request it was meant to save. See spec/locale/addressing.md,
 * "Locale is not negotiated twice", and spec/engagement.md.
 */
export const load: LayoutServerLoad = async ({ locals, fetch }) => {
	const [stats, marks] = await Promise.all([
		siteStats(fetch).catch(() => undefined),
		marksOf(pickUrls(dev).symlink, 'site', MARKS),
	]);
	return {
		locale: locals.locale ?? { code: 'mw' as const, language_tag: SITE_LANGUAGE },
		// Travels with the locale for the same reason: settled on the server, and a control that
		// derived it from the painted class would be answering a question already answered.
		theme: locals.theme ?? ('light' as const),
		stats,
		marks,
	};
};

/**
 * The marks the head names, as the objects the alias layer resolves them to at render. See
 * spec/architecture/delivery.md, "A page follows the name for the browser".
 */
const MARKS = [
	'favicon-96x96.png',
	'favicon-512x512.png',
	'favicon.svg',
	'apple-touch-icon.png',
] as const;
