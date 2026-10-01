/**
 * An article as the entity it is, for the page's graph. See spec/architecture/entities.md.
 */
import type { Alternate, ArticleMeta } from '@canmi/artifacts/types';
import { PERSON_ID, ref, SITE_ID } from '@canmi/social/structured';

/**
 * What kind of writing each category is, by the first segment of its address: technical depth,
 * a post, or a piece of reflection. A category not named here is an article and nothing narrower.
 */
const KINDS: Readonly<Record<string, string>> = {
	architecture: 'TechArticle',
	development: 'TechArticle',
	milestone: 'BlogPosting',
	mirror: 'Article',
};

export interface ArticleEntityInput {
	meta: ArticleMeta;
	/** This view's canonical address, `?lang=` included where it is a translation. */
	canonical: string;
	alternates: readonly Alternate[];
	/** The view's locale; `mw` is the source article. */
	code: string;
	/** Whether this locale has a view of its own, rather than showing the source as a fallback. */
	translated: boolean;
	languageTag: string;
	words: number;
	image?: string;
	/** The summary the page shows above the article, where it has one. */
	abstract?: string;
}

/** A view's identifier: its own address, so each translation is a work of its own. */
const idOf = (address: string) => `${address}#article`;

type Ref = { '@id': string };

export type ArticleEntity = Record<string, unknown> & {
	'@type': string;
	'@id': string;
	author: Ref;
	isPartOf: Ref;
	translationOfWork?: Ref;
	workTranslation?: Ref[];
};

export function articleEntity(input: ArticleEntityInput): ArticleEntity {
	const { meta, canonical, alternates } = input;
	const address = new URL(canonical);
	const source = `${address.origin}${address.pathname}`;
	// A locale showing the source as a fallback is the source work, under the source's identifier.
	const original = input.code === 'mw';
	const translation = !original && input.translated;
	const section = address.pathname.split('/')[1] ?? '';
	const translations = alternates
		.filter((alternate) => alternate.language_tag !== 'x-default' && alternate.href !== source)
		.map((alternate) => ref(idOf(alternate.href)));
	return {
		'@type': KINDS[section] ?? 'Article',
		'@id': translation ? idOf(canonical) : idOf(source),
		headline: meta.title,
		...(meta.subtitle ? { alternativeHeadline: meta.subtitle } : {}),
		description: meta.description,
		...(input.abstract ? { abstract: input.abstract } : {}),
		...(input.image ? { image: input.image } : {}),
		datePublished: meta.published,
		dateModified: meta.lastmod,
		inLanguage: input.languageTag,
		url: canonical,
		mainEntityOfPage: canonical,
		...(section ? { articleSection: section } : {}),
		wordCount: input.words,
		author: ref(PERSON_ID),
		publisher: ref(PERSON_ID),
		isPartOf: ref(SITE_ID),
		...(translation ? { translationOfWork: ref(idOf(source)) } : {}),
		...(original && translations.length > 0 ? { workTranslation: translations } : {}),
	};
}
