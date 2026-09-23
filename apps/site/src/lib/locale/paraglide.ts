import { defineCustomClientStrategy, defineCustomServerStrategy } from '@canmi/messages/runtime';
import { localeCode } from './index';

/**
 * The name Paraglide knows our negotiation by. Its `custom-` prefix is required by the compiler.
 */
export const STRATEGY = 'custom-negotiated';

/**
 * Hand Paraglide the locale this request already resolved to, and let it decide nothing.
 *
 * `resolveLocale` reads a query parameter, a cookie, `Accept-Language` and finally the article
 * itself; the last of those is content-dependent and no library strategy can see it. Rather
 * than approximate that with `cookie` plus `preferredLanguage` and have two negotiations
 * disagree in the cases that matter, the strategy array holds this alone -- no built-in
 * fallback -- and the answer is read back off the request. See spec/locale/addressing.md.
 */
export function registerServerStrategy(): void {
	defineCustomServerStrategy(STRATEGY, {
		getLocale: (request) => {
			const header = request?.headers.get('cookie') ?? '';
			const match = /(?:^|;)\s*language=([^;]*)/.exec(header);
			return localeCode(match?.[1] && decodeURIComponent(match[1]));
		},
	});
}

/**
 * The same answer on the client, read from the document the server just rendered.
 *
 * The server stamps its code onto `<html data-locale>` and `chooseLocale` re-stamps it. Nothing
 * renders through this -- every message call passes an explicit locale from page data, which is
 * what changes the interface with the article rather than ahead of it -- so it is the fallback
 * for a call that does not, kept current so such a call is redundant and not a language behind.
 * `setLocale` is a no-op: the choice is a cookie, a load and a re-render, all `chooseLocale`'s.
 */
export function registerClientStrategy(): void {
	defineCustomClientStrategy(STRATEGY, {
		getLocale: () => localeCode(document.documentElement.dataset.locale),
		setLocale: () => {},
	});
}
