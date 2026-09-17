import { browser } from '$app/environment';
import { invalidate } from '$app/navigation';
import { contentLanguageCookie, type LocaleCode } from './index';

/**
 * The key a page load declares so that choosing a language re-runs it.
 *
 * `invalidate` re-runs only the loads that depend on this, and a universal one re-runs in the
 * browser -- so the interface and the article change together without asking this site's Worker
 * for a new document. See spec/locale/addressing.md.
 */
export const LOCALE_DEPENDENCY = 'app:locale';

/**
 * What this browser is showing, once a reader has chosen something other than what arrived.
 *
 * Browser-only, and that is load-bearing rather than tidy: module state on the server is shared
 * by every request it handles, so one reader's language would leak into the next reader's page.
 * On the server this answers with what the server negotiated and nothing is ever written.
 */
let chosen = $state<LocaleCode | undefined>(undefined);

export function currentLocale(negotiated: LocaleCode): LocaleCode {
	if (!browser) return negotiated;
	chosen ??= negotiated;
	return chosen;
}

/**
 * Take a language, and let the page follow.
 *
 * The cookie goes first because it is what the server negotiates from, so this predicts the
 * server's next answer rather than being a second negotiation. Nothing on the page moves until
 * `invalidate` resolves, which is what makes the swap atomic: the interface reads its locale out
 * of page data, and page data changes only when the load has the new article. See
 * spec/locale/addressing.md.
 */
export async function chooseLocale(code: LocaleCode): Promise<void> {
	if (!browser) return;
	chosen = code;
	document.cookie = contentLanguageCookie(code, window.location.protocol === 'https:');
	document.documentElement.dataset.locale = code;
	await invalidate(LOCALE_DEPENDENCY);
}
