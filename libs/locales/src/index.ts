/**
 * What each language calls itself, keyed by the tag the corpus stores.
 *
 * **Never translated, and never a code.** A reader who cannot read the interface still has to find
 * their own language in a list, so the name reads the same whichever view rendered it -- and a
 * writer looking at eight translations of one paragraph should not be reading `ko-KR` to work out
 * which is which. Only the pair that needs telling apart carries a qualifier: there is one English
 * here and two Chinese, and each is written in its own script.
 *
 * The site's language picker was the first consumer and the CMS's segment view is the second,
 * which is what moved this out of `apps/site/src/lib/locale/switcher.ts`.
 */
export const LOCALE_TAGS = [
	'en-US',
	'zh-CN',
	'ja-JP',
	'de-DE',
	'ko-KR',
	'fr-FR',
	'es-ES',
	'zh-TW',
] as const;

export type LocaleTag = (typeof LOCALE_TAGS)[number];

export const ENDONYM = {
	'en-US': 'English',
	'zh-CN': '中文 (简体)',
	'zh-TW': '中文 (繁體)',
	'ja-JP': '日本語',
	'ko-KR': '한국어',
	'de-DE': 'Deutsch',
	'fr-FR': 'Français',
	'es-ES': 'Español',
} as const satisfies Record<LocaleTag, string>;

/** The tag's own name, or the tag itself when the corpus grows one this does not know. */
export function endonym(tag: string): string {
	return (ENDONYM as Record<string, string>)[tag] ?? tag;
}

/**
 * The codes the corpus keys a view by, and `mw` for the article's own language.
 *
 * The short internal spelling of the same set [[LOCALE_TAGS]] names in BCP-47. It moved here for
 * the reason those did: a third consumer appeared -- `@canmi/artifacts`, which types a published
 * view -- and a vocabulary two packages spell out separately is a vocabulary that drifts.
 */
export const LOCALE_CODES = ['mw', 'de', 'en', 'es', 'fr', 'ja', 'ko', 'zh', 'tw'] as const;

export type LocaleCode = (typeof LOCALE_CODES)[number];

/**
 * The language this site's own copy is written in -- not a fallback for a missing article
 * language. It moved here when the API needed to name a locale no article carries a view of,
 * which is the third consumer this table has collected. See lattice's spec/locale/interface.md.
 */
export const SITE_LANGUAGE = 'en-US';
