import { SITE_LANGUAGE } from '$lib/locale';
import { siteStats } from '$lib/published';
import type { LayoutServerLoad } from './$types';

/**
 * The negotiated locale and the two public counters, handed down together.
 *
 * It touches neither `url` nor `params`, so SvelteKit never re-runs it on a client navigation and
 * the answer travels with the hydrated page -- which keeps the negotiation single and on the
 * server, and is why the counters are here rather than in a universal load: that one runs again in
 * the browser and would spend the request it was meant to save. See spec/locale/addressing.md,
 * "Locale is not negotiated twice", and spec/engagement.md.
 */
export const load: LayoutServerLoad = async ({ locals, fetch }) => ({
	locale: locals.locale ?? { code: 'mw' as const, language_tag: SITE_LANGUAGE },
	// Travels with the locale for the same reason: settled on the server, and a control that
	// derived it from the painted class would be answering a question already answered.
	theme: locals.theme ?? ('light' as const),
	stats: await siteStats(fetch).catch(() => undefined),
});
