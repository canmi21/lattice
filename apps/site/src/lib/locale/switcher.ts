import { endonym } from '@canmi/locales';
import * as m from '../paraglide/messages';
import { PUBLIC_LANGUAGE, type LocaleCode } from './index';

type TranslationCode = Exclude<LocaleCode, 'mw'>;

export type LanguageChoice = {
	code: LocaleCode;
	name: string;
	original: boolean;
	current: boolean;
};

/**
 * Each language named as its own readers write it, and never translated.
 *
 * Derived from `@canmi/locales`, which keys the same names by the tag the corpus stores. This view
 * is keyed by the short code the URL uses, so the two are one table read through `PUBLIC_LANGUAGE`
 * rather than two lists to keep in step -- the CMS became the second consumer and that is what
 * moved them.
 */
export const LANGUAGE_ENDONYMS = Object.fromEntries(
	Object.entries(PUBLIC_LANGUAGE).map(([code, tag]) => [code, endonym(tag)]),
) as Record<TranslationCode, string>;

/**
 * How large each mark reads, measured rather than assumed: `sqrt(extent * sqrt(mass))`, reach
 * corrected by weight. See spec/styling.md, "An icon set is sized by the ink it carries, not by
 * one class for all of it", for the derivation and the measured spread it corrects.
 */
const MARK_OPTICAL = {
	translate: 9.68,
	'translate-simplified': 9.4,
	'translate-ai': 10.47,
	world: 10.86,
} as const;

export type MarkName = keyof typeof MARK_OPTICAL;

/**
 * Marks that are one drawing, and are therefore sized as one: an ornament does not vote on size.
 * See spec/styling.md, "An icon set is sized by the ink it carries, not by one class for all of
 * it", for why `translate-2-line` and `translate-2-ai-line` qualify and others do not.
 */
const MARK_DRAWING = new Map<MarkName, MarkName>([['translate-simplified', 'translate-ai']]);

/**
 * One optical size for the whole control, taken from the compass on the closed trigger -- itself
 * a correction, `size-3.75` rather than the row's `size-3.5`. See spec/styling.md, "An icon set is
 * sized by the ink it carries, not by one class for all of it".
 */
const MARK_OPTICAL_TARGET = 10.68;

/**
 * The height each mark is given, written out rather than computed.
 *
 * Tailwind reads source text and would not find a height it has to evaluate, so these are
 * literals; `markHeightRem` is what they mean, and a test holds the two together.
 */
export const MARK_SIZE = {
	translate: 'h-[1.1033rem] w-auto',
	'translate-simplified': 'h-[1.0201rem] w-auto',
	'translate-ai': 'h-[1.0201rem] w-auto',
	world: 'h-[0.9834rem] w-auto',
} as const satisfies Record<MarkName, string>;

/** The height, in rem, that brings a mark to the control's one optical size. */
export function markHeightRem(mark: MarkName): number {
	return MARK_OPTICAL_TARGET / MARK_OPTICAL[MARK_DRAWING.get(mark) ?? mark];
}

/**
 * Two orders, chosen by the reader's own language rather than the view, so the sequence settles
 * once per reader rather than reshuffling as they move between views.
 *
 * Written out rather than derived from the endonym table: there are now two orders and an implicit
 * one cannot express two. Both must name all eight; the tests hold them to it.
 */
const ORDER_CJK = ['en', 'zh', 'tw', 'ja', 'ko', 'de', 'fr', 'es'] as const;
const ORDER_LATIN = ['en', 'es', 'fr', 'ja', 'zh', 'tw', 'ko', 'de'] as const;

/** Reader languages that get the first order. Not `COMPACT_SCRIPT`: that one is about labels. */
const CJK_READER = new Set<LocaleCode>(['zh', 'tw', 'ja', 'ko']);

export function orderFor(preferred: LocaleCode): readonly TranslationCode[] {
	return CJK_READER.has(preferred) ? ORDER_CJK : ORDER_LATIN;
}

/**
 * Views whose script keeps a language name short enough to spell out.
 *
 * The test is what the label is written in, not which language the article happens to be. `mw`
 * is not among them: its own label reads `Original`, so the parenthetical beside it is English
 * too, and `Original (Chinese)` crowds a row that exists to be scanned in exactly the way the
 * other Latin views do.
 */
const COMPACT_SCRIPT = new Set<LocaleCode>(['zh', 'tw', 'ja', 'ko']);

/** Subtags marking a Chinese tag Traditional. Script wins; regions are the legacy spelling. */
function isTraditional(subtags: string[]): boolean {
	return subtags.some((part) => part === 'hant' || ['tw', 'hk', 'mo'].includes(part));
}

/**
 * The view whose language is the one the article was written in, if this site publishes it.
 *
 * Resolved against `PUBLIC_LANGUAGE` rather than kept as a second table, so a locale that
 * changes its tag changes this with it. Traditional Chinese is matched by script before the
 * language falls through, since `zh-Hant` and `zh` differ in exactly the way the codes do.
 *
 * `undefined` means the article is in a language with no view of its own -- the eight are not a
 * promise about what may be written, only about what may be read.
 */
export function sourceCode(sourceLanguage: string): TranslationCode | undefined {
	const [primary = '', ...rest] = sourceLanguage.toLowerCase().split('-');
	const traditional = isTraditional(rest);
	return (Object.keys(PUBLIC_LANGUAGE) as TranslationCode[]).find((candidate) => {
		const [language, region] = PUBLIC_LANGUAGE[candidate].toLowerCase().split('-');
		if (language !== primary) return false;
		return primary === 'zh' ? (traditional ? region === 'tw' : region === 'cn') : true;
	});
}

/** The region subtag of the locale this site publishes a language under. */
function regionFor(code: TranslationCode): string {
	return PUBLIC_LANGUAGE[code].split('-')[1] ?? code.toUpperCase();
}

/** The region of the locale this site publishes a language under. */
function regionOf(sourceLanguage: string): string | undefined {
	const code = sourceCode(sourceLanguage);
	return code ? regionFor(code) : undefined;
}

/**
 * A language's own name, with the script folded into it.
 *
 * `@canmi/locales` spells the two Chinese views `中文 (简体)` and `中文 (繁體)`. That is the right
 * shape for a menu row and the wrong one for a control that already ends in a bracketed region --
 * `中文 (简体) (CN)` reads as two afterthoughts on one label. Chinese is the only language here
 * whose name splits by script, which `displayTag` below relies on as well, so the fold is applied
 * to it alone rather than to any endonym that happens to carry brackets.
 */
export function languageName(code: TranslationCode): string {
	const name = LANGUAGE_ENDONYMS[code];
	if (!PUBLIC_LANGUAGE[code].startsWith('zh')) return name;
	const split = /^(.*?)\s*[(（]([^)）]+)[)）]\s*$/.exec(name);
	return split ? `${split[2]}${split[1]}` : name;
}

/** Whether a label carries its region. Default everywhere; see `publishedLabel`. */
export type LabelOptions = { region?: boolean };

/**
 * A language named the way the closed switcher names it: its own name, and its region.
 *
 * Kept apart from `triggerLabel` so the notice above an article can reuse the phrase without the
 * original view's special cases. `region: false` is for a caller with room to spare -- among the
 * eight views the region qualifies nothing since their endonyms already differ; only the original
 * view's fallback in `triggerLabel` needs it. See spec/locale.md.
 */
export function publishedLabel(
	code: TranslationCode,
	{ region = true }: LabelOptions = {},
): string {
	return region ? `${languageName(code)} (${regionFor(code)})` : languageName(code);
}

/**
 * What the control says while it is closed: the language being read, its own name plus the region
 * that tells two publications of one language apart -- never the internal `?lang=` code.
 *
 * The original view names the article's language rather than the word `Original`; a page hands
 * over `SITE_LANGUAGE` and is read like any other source. See spec/locale.md, "The closed control
 * names a language; the menu names the choices" and "A page names the site's own language, which
 * is what its tag already says".
 */
export function triggerLabel(
	currentCode: LocaleCode,
	sourceLanguage: string,
	options: LabelOptions = {},
): string {
	if (currentCode !== 'mw') return publishedLabel(currentCode, options);

	const source = sourceCode(sourceLanguage);
	if (source) return publishedLabel(source, options);
	// Not subject to `region`: `Original` names no language on its own, so dropping the region
	// here would leave the control saying nothing about what is being read.
	return `${m['language.original']({}, { locale: currentCode })} (${sourceLabel(sourceLanguage, currentCode)})`;
}

/**
 * The tag handed to `Intl.DisplayNames`, with the script restored when it carries meaning.
 *
 * Frontmatter writes `lang: zh`, and `DisplayNames.of('zh')` answers "中文" / "Chinese" -- a name
 * covering both scripts, which names neither. Chinese is the only language here whose display
 * name splits by script, and every interface language already spells that split out (`简体中文`,
 * `Simplified Chinese`, `簡体中国語`, `중국어(간체)`), so the script is added to the tag rather than
 * eight names being written by hand. See spec/locale.md.
 */
function displayTag(sourceLanguage: string): string {
	const [primary = sourceLanguage, ...rest] = sourceLanguage.toLowerCase().split('-');
	if (primary !== 'zh') return primary;
	return isTraditional(rest) ? 'zh-Hant' : 'zh-Hans';
}

/**
 * Which language the original is in, named as briefly as the reading view allows.
 *
 * A CJK view spells it out, because `中文` and `한국어` are already as short as an abbreviation.
 * Every other view gets the region code, since `Original (Chinese)` crowds a row that exists to
 * be scanned.
 */
export function sourceLabel(sourceLanguage: string, currentCode: LocaleCode): string {
	const [primary = sourceLanguage] = sourceLanguage.split('-');
	if (!COMPACT_SCRIPT.has(currentCode)) return regionOf(sourceLanguage) ?? primary.toUpperCase();

	const tag = currentCode === 'mw' ? sourceLanguage : PUBLIC_LANGUAGE[currentCode];
	try {
		return new Intl.DisplayNames([tag], { type: 'language' }).of(primary) ?? primary.toUpperCase();
	} catch {
		return primary.toUpperCase();
	}
}

/** The source language spelled out in full, in the current interface language. */
export function sourceLanguageName(sourceLanguage: string, currentCode: LocaleCode): string {
	const tag = displayTag(sourceLanguage);
	const displayLanguage = currentCode === 'mw' ? sourceLanguage : PUBLIC_LANGUAGE[currentCode];
	const fallback = tag.split('-')[0]?.toUpperCase() ?? sourceLanguage.toUpperCase();
	try {
		return new Intl.DisplayNames([displayLanguage], { type: 'language' }).of(tag) ?? fallback;
	} catch {
		return fallback;
	}
}

/**
 * The eight, then the original last, as one entry among them rather than a section of its own.
 *
 * `mw` is labelled in whichever language is being read, because it names a state rather than a
 * language; the row stays on every page since the choice is one site-wide cookie, and preferring
 * the original differs from preferring English the moment an article opens. See spec/locale.md,
 * "A page names the site's own language, which is what its tag already says".
 */
export function languageChoices(
	currentCode: LocaleCode,
	sourceLanguage: string,
	preferred: LocaleCode = 'en',
): LanguageChoice[] {
	return [
		...orderFor(preferred).map((code) => ({
			code,
			name: LANGUAGE_ENDONYMS[code],
			original: false,
			current: currentCode === code,
		})),
		{
			code: 'mw' as const,
			name: `${m['language.original']({}, { locale: currentCode })} (${sourceLabel(sourceLanguage, currentCode)})`,
			original: true,
			current: currentCode === 'mw',
		},
	];
}

/** Ask the client to persist a different view; selecting the active one is a no-op. */
export function selectContentLanguage(
	currentCode: LocaleCode,
	selectedCode: LocaleCode,
	select: (code: LocaleCode) => void,
): boolean {
	if (currentCode === selectedCode) return false;
	select(selectedCode);
	return true;
}

/** Preserve unrelated query state while asking the worker for another article view. */
export function contentLanguageHref(selectedCode: LocaleCode, currentUrl: URL): string {
	const target = new URL(currentUrl);
	target.searchParams.set('lang', selectedCode);
	return `${target.pathname}${target.search}${target.hash}`;
}
