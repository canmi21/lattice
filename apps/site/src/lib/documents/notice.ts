/**
 * The line an article carries above itself when the view is not the original, written for a feed.
 *
 * The page has said this from the beginning and the feed never did, which made the feed the one
 * place a translation arrived unannounced -- and a reader who subscribes to `?lang=ja` sees more
 * translations than anyone. Same messages, same helpers; what differs is that a feed has one
 * column, so there is no short reading, and no cookie to set, so the link is an ordinary one to
 * the source view. See spec/locale/views.md.
 */
// Relative, not `$lib`: that alias is SvelteKit's and only Vite resolves it, while this module
// is loaded directly by the workspace's own vitest. The compiler beside it does the same.
import { escapeHtml } from '@canmi/artifacts';
import type { LocaleCode } from '../locale/index.ts';
import {
	languageName,
	publishedLabel,
	sourceCode,
	sourceLanguageName,
} from '../locale/switcher.ts';
import { fillSlot } from '../locale/spacing.ts';
import * as m from '../paraglide/messages.js';

type TranslationCode = Exclude<LocaleCode, 'mw'>;

/** Stands in for the language name while the sentence around it is measured. See fillSlot. */
const SLOT = '\u0000';

/**
 * Which of the three things this view is, to the article.
 *
 * Script sibling is tested first: a Simplified article read at `tw` is also not the same code,
 * and would otherwise be announced as a translation. See spec/locale/views.md.
 */
function kindOf(code: TranslationCode, source: TranslationCode | undefined) {
	if ((code === 'zh' && source === 'tw') || (code === 'tw' && source === 'zh')) return 'script';
	return source === code ? 'polished' : 'translated';
}

/**
 * The sentence as HTML, with the message's `{#link}` slot as a real link.
 *
 * `parts` rather than calling the message: the plain call drops the markup and returns the
 * sentence with the link's own words still in it, which would say "the original" and offer no
 * way to reach it.
 */
function sentence(
	message: {
		parts: (
			inputs: { language: string },
			options?: { locale?: LocaleCode },
		) => readonly { type: string; value?: string }[];
	},
	language: string,
	code: TranslationCode,
	href: string,
): string {
	let html = '';
	// The locale is passed, never inferred: `getLocale()` reads a request-scoped value that a
	// document assembled outside one does not have. See spec/locale/addressing.md.
	for (const part of message.parts({ language }, { locale: code })) {
		if (part.type === 'text') html += escapeHtml(part.value ?? '');
		else if (part.type === 'markup-start') html += `<a href="${href}">`;
		else if (part.type === 'markup-end') html += '</a>';
	}
	return html;
}

/**
 * What this view is, or nothing when it is the original.
 *
 * `available` is false for an article this locale has no translation of, which is served as the
 * source rather than as a 404 -- so the notice is the only thing that says the reader is looking
 * at another language. That case is exactly the one a feed most needs it for.
 */
export function noticeHtml(
	code: LocaleCode,
	sourceLanguage: string,
	available: boolean,
	articleUrl: string,
): string | undefined {
	if (code === 'mw') return undefined;

	// `?lang=mw` spelled out, never the bare address. A bare URL negotiates from the reader's
	// cookie, and this reader's cookie says the language they are trying to get out of -- so the
	// one link that means "the original" would hand back the translation. The page can link the
	// bare address because its handler switches the view before the browser goes anywhere; a feed
	// has no handler. See spec/locale/views.md.
	const original = `${articleUrl}?lang=mw`;

	const source = sourceCode(sourceLanguage);
	// The folded name, not the endonym: this sits inside a sentence, and `中文 (简体)版本` puts a
	// bracket between the language and the noun it qualifies. See spec/locale/interface.md.
	const shown = source ? publishedLabel(source) : sourceLanguageName(sourceLanguage, code);

	if (!available) {
		const said = fillSlot(
			m['notice.unavailable']({ language: languageName(code), source: SLOT }, { locale: code }),
			SLOT,
			shown,
		);
		return `<p><em>${escapeHtml(said)}</em></p>`;
	}

	const kind = kindOf(code, source);
	const message =
		kind === 'script'
			? m['notice.script']
			: kind === 'polished'
				? m['notice.polished']
				: m['notice.translated'];
	const language = sourceLanguageName(sourceLanguage, code);
	return `<p><em>${sentence(message, language, code, original)}</em></p>`;
}
