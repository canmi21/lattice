import { URLS } from '@canmi/urls';
import { expect, it } from 'vitest';
import { noticeHtml } from './notice';

const ORIGINAL = `${URLS.apps.production.site}/architecture/one`;

it('says nothing on the source view, which is the one view that is not a version of another', () => {
	expect(noticeHtml('mw', 'zh-CN', true, ORIGINAL)).toBeUndefined();
});

/**
 * The link carries `?lang=mw` rather than the bare address, and that is the whole of its use. A
 * bare URL negotiates from the cookie, which for a reader of the Japanese feed says Japanese --
 * so the one link meaning "show me the original" would answer with the translation again.
 */
it('announces a translation in the reader’s own language, and links the original', () => {
	const japanese = noticeHtml('ja', 'zh-CN', true, ORIGINAL);
	expect(japanese).toContain('本記事は翻訳版です');
	expect(japanese).toContain(`<a href="${ORIGINAL}?lang=mw">`);

	const german = noticeHtml('de', 'zh-CN', true, ORIGINAL);
	expect(german).toContain('Dies ist eine Übersetzung');
	expect(german).toContain(`<a href="${ORIGINAL}?lang=mw">`);
});

/**
 * The case the feed most needs it for. An article this locale has no translation of is served as
 * the source rather than as a 404, so without the notice the entry arrives in another language
 * with nothing saying so -- and a subscriber never asked for it the way a reader following a link
 * did. See spec/locale/views.md.
 */
it('says which language is being shown when there is no translation, and offers no link', () => {
	const notice = noticeHtml('ja', 'en-US', false, ORIGINAL);
	expect(notice).toContain('日本語版はまだありません');
	expect(notice).toContain('English (US)');
	expect(notice).not.toContain('<a ');
});

// A Simplified article read at `tw` is not the same code either, and would otherwise be
// announced as a translation when nobody translated anything.
it('calls a script conversion a script conversion', () => {
	const notice = noticeHtml('tw', 'zh-CN', true, ORIGINAL);
	expect(notice).toContain('字詞轉換');
	expect(notice).not.toContain('翻譯版');
});

// The sentence is HTML, so anything that reaches it from an article's frontmatter is escaped.
it('escapes the text around the link', () => {
	const notice = noticeHtml('en', 'zh-CN', false, ORIGINAL);
	expect(notice).not.toContain('<script');
	expect(notice?.startsWith('<p><em>')).toBe(true);
	expect(notice?.endsWith('</em></p>')).toBe(true);
});
