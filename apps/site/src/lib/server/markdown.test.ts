import { describe, expect, it } from 'vitest';
import { languageOf, noticeFor, prefersMarkdown, tokensIn } from './markdown';

describe('prefersMarkdown', () => {
	it('takes markdown only when it is named and weighs no less than HTML', () => {
		expect(prefersMarkdown('text/markdown')).toBe(true);
		expect(prefersMarkdown('text/markdown, text/html;q=0.9')).toBe(true);
		expect(prefersMarkdown('text/html, text/markdown;q=0.5')).toBe(false);
		expect(prefersMarkdown('text/html,application/xhtml+xml,*/*;q=0.8')).toBe(false);
		expect(prefersMarkdown(null)).toBe(false);
	});
});

const SOURCE = `---
title: A title
lang: zh
---

# A title

正文。
`;

describe('the notice', () => {
	it('says the text is the original, as written, in its language', () => {
		expect(noticeFor({ source: 'zh' })).toBe(
			'> The text below is in its original language, Chinese (zh), as written.',
		);
	});

	it('says where the asked language is, when it is another', () => {
		const notice = noticeFor({ source: 'zh', asked: { tag: 'de-DE', page: 'x:page?lang=de' } });
		expect(notice).toContain('No text/markdown version of this page exists in German (de-DE)');
		expect(notice).toContain('available as text/html at x:page?lang=de.');
	});

	it('treats a regional variant of the source as the source', () => {
		expect(noticeFor({ source: 'zh', asked: { tag: 'zh-TW', page: 'x' } })).toMatch(/^> The text/);
	});

	it('reads the source language from the front matter', () => {
		expect(languageOf(SOURCE)).toBe('zh');
	});
});

it('counts a CJK character as a token and four other characters as one', () => {
	expect(tokensIn('正文abcd')).toBe(3);
});
