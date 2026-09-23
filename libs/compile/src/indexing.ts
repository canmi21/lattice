import { similarity } from './assemble.ts';
import { localeUrl, LOCALE_CODES, PUBLIC_LANGUAGE, type LocaleCode } from '@canmi/locales';
import type { Alternate } from '@canmi/artifacts/types';

export const CANONICAL_SIMILARITY_THRESHOLD = 0.9;

/** Canonicals and alternates are built together so an hreflang can never disagree with its view. */
export function indexingMetadata(
	url: string,
	content: Readonly<Record<LocaleCode, string>>,
): { canonical: Record<LocaleCode, string>; canonical_urls: string[]; alternates: Alternate[] } {
	const canonical = Object.fromEntries(
		LOCALE_CODES.map((code) => [
			code,
			code === 'mw' || similarity(content.mw, content[code]) >= CANONICAL_SIMILARITY_THRESHOLD
				? url
				: localeUrl(url, code),
		]),
	) as Record<LocaleCode, string>;

	return {
		canonical,
		canonical_urls: [...new Set(LOCALE_CODES.map((code) => canonical[code]))],
		alternates: [
			...(Object.entries(PUBLIC_LANGUAGE) as [Exclude<LocaleCode, 'mw'>, string][]).map(
				([code, tag]) => ({ code, language_tag: tag, href: canonical[code] }),
			),
			{ code: 'x-default', language_tag: 'x-default', href: url },
		],
	};
}
