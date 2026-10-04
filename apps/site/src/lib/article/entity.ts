/**
 * An article as the entity it is, for the page's graph. See spec/architecture/entities.md.
 */
import type { Alternate, ArticleMeta, Block } from '@canmi/artifacts/types';
import { URLS } from '@monoflake/sdk';
import { authorRef, ref, SITE_ID } from '@canmi/social/structured';

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

/** What kind of writing a category is, as schema.org names it. */
export function kindOf(section: string): string {
	return KINDS[section] ?? 'Article';
}

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
	/** The works the article cites, from `citationsOf`. */
	citations?: readonly object[];
}

/**
 * The works an article cites by name: a card for a page, a repository, an embedded post. A link
 * inside a sentence is not one -- it points somewhere, it does not cite a work.
 */
export function citationsOf(blocks: readonly Block[]): object[] {
	const { github, social } = URLS.external;
	const seen = new Set<string>();
	return blocks.flatMap((block) => {
		const work =
			block.type === 'linkcard'
				? { '@type': 'CreativeWork', name: block.title, url: block.url }
				: block.type === 'github'
					? {
							'@type': 'SoftwareSourceCode',
							name: block.repo.full_name,
							url: `${github.web}/${block.repo.full_name}`,
							codeRepository: `${github.web}/${block.repo.full_name}`,
							...(block.repo.language ? { programmingLanguage: block.repo.language } : {}),
						}
					: block.type === 'twitter'
						? {
								'@type': 'SocialMediaPosting',
								url: `${social.twitter}/${block.tweet.author}/status/${block.tweet.id}`,
								datePublished: block.tweet.created,
							}
						: undefined;
		if (!work || seen.has(work.url)) return [];
		seen.add(work.url);
		return [work];
	});
}

/** A view's identifier: its own address, so each translation is a work of its own. */
const idOf = (address: string) => `${address}#article`;

type Ref = { '@id': string };

export type ArticleEntity = Record<string, unknown> & {
	'@type': string;
	'@id': string;
	author: Ref & { name: string };
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
		'@type': kindOf(section),
		'@id': translation ? idOf(canonical) : idOf(source),
		headline: meta.title,
		...(meta.subtitle ? { alternativeHeadline: meta.subtitle } : {}),
		description: meta.description,
		...(input.abstract ? { abstract: input.abstract } : {}),
		...(input.citations?.length ? { citation: input.citations } : {}),
		...(input.image ? { image: input.image } : {}),
		datePublished: meta.published,
		dateModified: meta.lastmod,
		inLanguage: input.languageTag,
		url: canonical,
		mainEntityOfPage: canonical,
		...(section ? { articleSection: section } : {}),
		wordCount: input.words,
		author: authorRef(),
		publisher: authorRef(),
		isPartOf: ref(SITE_ID),
		...(translation ? { translationOfWork: ref(idOf(source)) } : {}),
		...(original && translations.length > 0 ? { workTranslation: translations } : {}),
	};
}
