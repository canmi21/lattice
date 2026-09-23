import { localeCode, type LocaleCode } from '@canmi/locales';

/**
 * What a tag is now lives in `@canmi/locales`, because the compiler needs it and this file is
 * an application's. Re-exported rather than relocated at every call site: thirty-five modules
 * here ask `$lib/locale` for a mix of both halves, and the halves are what moved, not the name.
 */
export {
	assertLanguageTag,
	localeCode,
	LOCALE_CODES,
	localeUrl,
	languageTag,
	PUBLIC_LANGUAGE,
	type LocaleCode,
} from '@canmi/locales';

export const LANGUAGE_COOKIE_MAX_AGE = 365 * 24 * 60 * 60;

export { SITE_LANGUAGE } from '@canmi/locales';

function codeForLanguageRange(value: string): Exclude<LocaleCode, 'mw'> | undefined {
	const range = value.toLowerCase();
	const subtags = range.split('-');
	if (subtags[0] === 'zh') {
		return subtags.includes('hant') || ['tw', 'hk', 'mo'].some((tag) => subtags.includes(tag))
			? 'tw'
			: 'zh';
	}
	const base = subtags[0];
	return base === 'de' ||
		base === 'en' ||
		base === 'es' ||
		base === 'fr' ||
		base === 'ja' ||
		base === 'ko'
		? base
		: undefined;
}

export function acceptedLocale(header: string | null | undefined): LocaleCode | undefined {
	if (!header) return undefined;
	const ranges = header
		.split(',')
		.map((part, index) => {
			const [rawRange, ...parameters] = part.trim().split(';');
			if (!rawRange || rawRange === '*') return undefined;
			let quality = 1;
			for (const parameter of parameters) {
				const match = /^\s*q=(0(?:\.\d{0,3})?|1(?:\.0{0,3})?)\s*$/i.exec(parameter);
				if (!match) return undefined;
				quality = Number(match[1]);
			}
			return Number.isFinite(quality) && quality > 0
				? { range: rawRange, quality, index }
				: undefined;
		})
		.filter((range): range is { range: string; quality: number; index: number } => range != null)
		.toSorted((a, b) => b.quality - a.quality || a.index - b.index);

	for (const { range } of ranges) {
		const code = codeForLanguageRange(range);
		if (code) return code;
	}
	return undefined;
}

export type LocaleInputs = {
	query: string | null | undefined;
	cookie: string | null | undefined;
	acceptLanguage: string | null | undefined;
};

/**
 * First valid source wins; the article itself is always the final `mw` view.
 *
 * Paraglide's `baseLocale` is `mw` as well, and the two are still separate decisions that
 * happen to agree. This one picks the view a reader is given; that one supplies a string the
 * chosen view is missing. Changing either does not imply changing the other.
 * See spec/locale/addressing.md.
 */
export function resolveLocale(inputs: LocaleInputs): LocaleCode {
	return (
		localeCode(inputs.query) ??
		localeCode(inputs.cookie) ??
		acceptedLocale(inputs.acceptLanguage) ??
		'mw'
	);
}

/** The client-writable preference consumed by the worker on the next document request. */
export function contentLanguageCookie(code: LocaleCode, secure: boolean): string {
	return `language=${code}; Path=/; Max-Age=${LANGUAGE_COOKIE_MAX_AGE}; SameSite=Lax${secure ? '; Secure' : ''}`;
}

/** Preserve the order and values of every parameter not owned by locale selection. */
export function withoutLanguageParameter(url: URL): string | undefined {
	if (!url.searchParams.has('lang')) return undefined;
	url.searchParams.delete('lang');
	return `${url.pathname}${url.search}${url.hash}`;
}

/** Cookie-varying HTML must never pass through a shared cache. */
export function privateHtml(response: Response): Response {
	if (!response.headers.get('content-type')?.toLowerCase().startsWith('text/html')) return response;
	const headers = new Headers(response.headers);
	headers.set('Cache-Control', 'private, no-store');
	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers,
	});
}
