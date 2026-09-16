import { SITE_LANGUAGE } from '$lib/locale';
import type { LayoutServerLoad } from './$types';

/**
 * The negotiated locale, handed down to universal loads, which cannot read `locals`.
 *
 * It touches neither `url` nor `params`, so SvelteKit never re-runs it on a client navigation
 * and the answer travels with the hydrated page. That is what keeps the negotiation single and
 * on the server. See spec/locale/addressing.md, "Locale is not negotiated twice".
 */
export const load: LayoutServerLoad = ({ locals }) => ({
	locale: locals.locale ?? { code: 'mw' as const, languageTag: SITE_LANGUAGE },
});
