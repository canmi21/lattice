import { PERSON_ID, SITE_ID } from '@canmi/social/structured';
import { URLS } from '@monoflake/sdk';
import { expect, it } from 'vitest';
import { articleEntity, citationsOf } from './entity';

const meta = {
	title: 'Rendering as a Protocol',
	subtitle: 'UI should be described, not executed.',
	description: 'A description.',
	lang: 'en',
	created: '2026-04-01',
	published: '2026-04-13',
	lastmod: '2026-09-21',
};
const SITE = URLS.apps.production.site;
const source = `${SITE}/architecture/compile-time-rendering`;
const alternates = [
	{ code: 'de' as const, language_tag: 'de-DE', href: `${source}?lang=de` },
	{ code: 'ja' as const, language_tag: 'ja-JP', href: `${source}?lang=ja` },
	{ code: 'x-default' as const, language_tag: 'x-default', href: source },
];

it('is the kind of writing its category is, and names the author and the site by reference', () => {
	const node = articleEntity({
		meta,
		canonical: source,
		alternates,
		code: 'mw',
		translated: true,
		languageTag: 'en-US',
		words: 1200,
		abstract: 'What the page says it says.',
	});
	expect(node['@type']).toBe('TechArticle');
	expect(node.abstract).toBe('What the page says it says.');
	expect(node['@id']).toBe(`${source}#article`);
	expect(node.author['@id']).toBe(PERSON_ID);
	expect(node.author.name).toBeTruthy();
	expect(node.isPartOf).toEqual({ '@id': SITE_ID });
	expect(node.workTranslation).toEqual([
		{ '@id': `${source}?lang=de#article` },
		{ '@id': `${source}?lang=ja#article` },
	]);
});

it('names the original from a translation, and falls back to an article for an unknown category', () => {
	const node = articleEntity({
		meta,
		canonical: `${SITE}/elsewhere/a-post?lang=de`,
		alternates: [],
		code: 'de',
		translated: true,
		languageTag: 'de-DE',
		words: 1,
	});
	expect(node['@type']).toBe('Article');
	expect(node.translationOfWork).toEqual({ '@id': `${SITE}/elsewhere/a-post#article` });
});

it('is the source work where a locale only falls back to it', () => {
	const node = articleEntity({
		meta,
		canonical: `${source}?lang=ko`,
		alternates,
		code: 'ko',
		translated: false,
		languageTag: 'ko-KR',
		words: 1,
	});
	expect(node['@id']).toBe(`${source}#article`);
	expect(node.translationOfWork).toBeUndefined();
	expect(node.workTranslation).toBeUndefined();
});

it('cites the works an article names by a card, a repository or a post, once each', () => {
	const card = { type: 'linkcard', src: 'a', url: 'x:card', title: 'A page' };
	const works = citationsOf([
		{ type: 'prose', html: '<p>text</p>' },
		card,
		card,
		{
			type: 'github',
			repo: {
				full_name: 'canmi21/seam',
				description: null,
				language: 'Rust',
				stars: 0,
				forks: 0,
				open_issues: 0,
				license: null,
				pushed_at: null,
			},
			align: 'left',
		},
	] as never);
	expect(works.map((work) => (work as { '@type': string })['@type'])).toEqual([
		'CreativeWork',
		'SoftwareSourceCode',
	]);
});
