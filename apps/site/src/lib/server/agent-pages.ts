/**
 * The agent views of the pages that have one -- every article and the homepage -- fetched from the
 * answers the human pages render from. See spec/architecture/markdown.md.
 */
import { author, mailbox } from '@canmi/identity';
import { aliasesOf, graph, person, profiles, telegramGroup } from '@canmi/social/structured';
import { URLS } from '@canmi/urls';
import { articleEntity, citationsOf, kindOf } from '$lib/article/entity';
import { elsewhere } from '$lib/documents/elsewhere';
import { websiteEntity } from '$lib/entities';
import { LOCALE_CODES, languageTag, type LocaleCode, SITE_LANGUAGE } from '$lib/locale';
import { cardUrl, HOME_SLUG } from '$lib/opengraph';
import {
	publishedHome,
	publishedMarkdown,
	publishedMetadata,
	publishedReads,
	publishedSitemap,
	publishedView,
	siteStats,
} from '$lib/published';
import { site } from '$lib/site';
import { bodyOf, contents, fields, opening, section, stamp, structured, table } from './agent-view';
import { languageOf, nameOf, noticeFor } from './markdown';

type Fetch = typeof fetch;

const SITE = URLS.apps.production.site;
const HOME = `${SITE}/${HOME_SLUG}.md`;

/** A page's address on the site, the homepage's being the root. */
export function pageAddress(path: string): string {
	return `${SITE}/${path === HOME_SLUG ? '' : path}`;
}

/** The view and the language its body is in. */
export type AgentView = { body: string; language: string };

/** The line every view opens on: the source, and where the asked language is if another. */
function noticeOf(source: string, page: string, code: LocaleCode | undefined): string {
	const asked =
		code && code !== 'mw'
			? { tag: languageTag(code, SITE_LANGUAGE), page: `${page}?lang=${code}` }
			: undefined;
	return noticeFor({ source, asked });
}

/** Where the published data came from, and when it was published. */
function corpusAsOf(generated: string | undefined): string {
	return generated
		? `From the published corpus, as of ${stamp(generated)}.`
		: 'From the published corpus.';
}

export async function articleAgentView(
	fetch: Fetch,
	slug: string,
	code: LocaleCode | undefined,
	now: Date,
): Promise<AgentView | undefined> {
	const [found, metadata, markdown, reads, sitemap] = await Promise.all([
		publishedView(fetch, slug, 'mw'),
		publishedMetadata(fetch, slug, 'mw'),
		publishedMarkdown(fetch, slug),
		publishedReads(fetch, slug),
		publishedSitemap(fetch).catch(() => undefined),
	]);
	if (!found || !metadata || !markdown) return undefined;
	const { view } = found;
	const text = await markdown.body.text();
	const page = pageAddress(found.path);
	const source = view.meta.lang || languageOf(text) || SITE_LANGUAGE;
	const category = found.path.split('/')[0] ?? '';
	const translations = view.language.alternates.filter((a) => a.code !== 'x-default');
	// Each translation's title and subtitle, from its own view: what of it the original does not say,
	// and what a reader is shown when an agent hands them the link. See
	// spec/architecture/markdown.md, "An agent reads the original; the translations are for the
	// person it answers".
	const headings = await Promise.all(
		translations.map((a) =>
			publishedMetadata(fetch, slug, a.code as LocaleCode)
				.then((answer) => answer?.meta)
				.catch(() => undefined),
		),
	);
	const citations = citationsOf(view.body.blocks) as { name?: string; url: string }[];
	const image = cardUrl(URLS.apps.production.cdn, found.card);
	const parts = [
		opening(view.meta.title, page, now, noticeOf(source, page, code)),
		`You are here: [${site.name}](${HOME}) › ${category} › ${view.meta.title}`,
		section(
			'About this article',
			corpusAsOf(sitemap?.generated),
			fields([
				['Title', view.meta.title],
				['Subtitle', view.meta.subtitle || undefined],
				['Short title', metadata.meta.short.title],
				['Short subtitle', metadata.meta.short.subtitle || undefined],
				['Description', view.meta.description],
				['Kind', `${kindOf(category)}, in ${category}`],
				['Author', mailbox],
				['Language', `${nameOf(source)} (${source}), the original`],
				['Published', view.meta.published],
				['Last changed', view.meta.lastmod],
				['Length', `${view.metrics.words} words`],
				['Page', page],
				['This document', `${page}.md`],
			]),
		),
		...(reads === undefined
			? []
			: [section('Reads', `Live, counted ${stamp(now)}; held up to five minutes.`, `${reads}`)]),
		...(translations.length
			? [
					section(
						'Other languages',
						'Each is a translation of this article, served as text/html, under the title and subtitle its page shows.',
						table(
							['Language', 'Title', 'Subtitle', 'Page'],
							translations.map((a, i) => [
								`${nameOf(a.language_tag)} (${a.language_tag})`,
								headings[i]?.title ?? '',
								headings[i]?.subtitle ?? '',
								a.href,
							]),
						),
					),
				]
			: []),
		...(view.body.summary
			? [
					section(
						'Summary',
						`Written by a model (${view.body.summary.provider}) from the article, as the page shows it.`,
						view.body.summary.text,
					),
				]
			: []),
		...(view.body.toc.length
			? [section('Contents', undefined, contents(view.body.toc, page))]
			: []),
		section('Article', undefined, bodyOf(text, view.meta.description)),
		...(citations.length
			? [
					section(
						'Works cited',
						undefined,
						citations
							.map((work) => `- ${work.name ? `[${work.name}](${work.url})` : work.url}`)
							.join('\n'),
					),
				]
			: []),
		elsewhere(),
		structured(
			graph(
				websiteEntity(),
				person(),
				articleEntity({
					meta: view.meta,
					canonical: page,
					alternates: view.language.alternates,
					code: 'mw',
					translated: true,
					languageTag: view.language.tag,
					words: view.metrics.words,
					image,
					abstract: view.body.summary?.text,
					citations: citationsOf(view.body.blocks),
				}),
			),
		),
	];
	return { body: `${parts.join('\n\n')}\n`, language: source };
}

export async function homeAgentView(
	fetch: Fetch,
	code: LocaleCode | undefined,
	now: Date,
): Promise<AgentView | undefined> {
	const [home, markdown, stats, sitemap] = await Promise.all([
		publishedHome(fetch, 'mw'),
		publishedMarkdown(fetch, HOME_SLUG),
		siteStats(fetch).catch(() => undefined),
		publishedSitemap(fetch).catch(() => undefined),
	]);
	if (!markdown) return undefined;
	const text = await markdown.body.text();
	const page = pageAddress(HOME_SLUG);
	const source = languageOf(text) || SITE_LANGUAGE;
	const heading = home.page?.meta.subtitle
		? `${home.page.meta.title} - ${home.page.meta.subtitle}`
		: (home.page?.meta.title ?? author.name);
	const words = home.articles.reduce((sum, article) => sum + article.metrics.words, 0);
	const parts = [
		opening(heading, page, now, noticeOf(source, page, code)),
		section(
			'About this site',
			corpusAsOf(sitemap?.generated),
			fields([
				['Name', site.name],
				['Also known as', author.name],
				['Description', site.tagline],
				['Author', `${author.name} (${author.fullName}) <${author.email}>`],
				['Articles', home.articles.length],
				['Words', `${words}, each article counted in its original language`],
				['Languages', `${LOCALE_CODES.length}, each article in each`],
				['Page', page],
				['This document', HOME],
			]),
		),
		...(stats
			? [
					section(
						'Readers',
						`Live, counted ${stamp(now)}; held up to five minutes.`,
						fields([
							['Newsletter subscribers', stats.subscriber_count],
							['Likes', stats.like_count],
						]),
					),
				]
			: []),
		section('Introduction', undefined, bodyOf(text)),
		section(
			'Articles',
			'Newest first, from the published corpus. Each page is text/html; each document is this view of it.',
			table(
				['Published', 'Section', 'Title', 'Subtitle', 'Words', 'Page', 'Document'],
				home.articles.map((article) => [
					article.dates.published.slice(0, 10),
					article.path.split('/')[0] ?? '',
					article.meta.title,
					article.meta.subtitle,
					String(article.metrics.words),
					pageAddress(article.path),
					`${pageAddress(article.path)}.md`,
				]),
			),
		),
		section(
			'Author',
			undefined,
			[
				`${author.name} is the name to use. Also known as ${aliasesOf()
					.filter((alias) => alias !== author.fullName)
					.join(', ')}.`,
				'',
				...profiles().map((profile) => `- ${profile}`),
				`- Telegram group: ${telegramGroup()}`,
			].join('\n'),
		),
		elsewhere(),
		structured(graph(websiteEntity(), person())),
	];
	return { body: `${parts.join('\n\n')}\n`, language: source };
}
