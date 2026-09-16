/**
 * One locale's whole Atom document, as published.
 *
 * Assembling this from the root at request time would mean fetching every article's view to
 * reach one field, so it is produced here instead and the route fetches the result. See
 * spec/architecture/artifacts.md, "Which objects exist".
 */
import { generateAtomFeed } from 'feedsmith';
import { URLS } from '@canmi/urls';
import type { Article } from '@canmi/artifacts/types';
import { localeUrl, type LocaleCode } from '../../locale/index.ts';
import type { SiteFacts } from './config.ts';

const SITE = URLS.apps.production.site;
const RES = URLS.apps.production.cdn;

export function buildFeed(articles: Article[], code: LocaleCode, site: SiteFacts): string {
	const prepared = articles
		.map((article) => {
			const view = article.views[code];
			return {
				id: article.url,
				title: view.meta.title,
				updated: new Date(view.meta.lastmod),
				published: new Date(view.meta.created),
				summary: view.meta.description,
				content: view.feed,
				links: [{ href: view.canonical }],
				lang: view.languageTag,
			};
		})
		.toSorted((a, b) => b.updated.getTime() - a.updated.getTime());
	// Destructured rather than counted: a length check proves nothing about the element to a
	// reader or to noUncheckedIndexedAccess. See the workspace spec/code.md.
	const [only, ...rest] = [...new Set(prepared.map(({ lang }) => lang))];
	const feedLanguage = only && rest.length === 0 ? only : 'mul';
	const feedUrl = localeUrl(`${SITE}/atom.xml`, code);

	let xml = generateAtomFeed({
		id: site.feed.id,
		title: site.name,
		subtitle: site.tagline,
		updated: prepared[0]?.updated ?? new Date(),
		authors: [{ name: site.author.name, email: site.author.email }],
		icon: `${RES}/favicon.svg`,
		links: [
			{ href: feedUrl, rel: 'self' },
			{ href: `${SITE}/`, rel: 'alternate' },
		],
		generator: { text: 'feedsmith', uri: URLS.external.feedsmith },
		entries: prepared.map(({ lang: _lang, ...entry }) => entry),
	});

	xml = xml.replace(
		'<feed xmlns="http://www.w3.org/2005/Atom">',
		`<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="${feedLanguage}">
  <description>${site.feed.followDescription}</description>`,
	);

	xml = xml.replace(/<content>/g, '<content type="html">');

	let entryIdx = 0;
	xml = xml.replace(/<entry>/g, () => {
		const lang = prepared[entryIdx]?.lang ?? 'zh';
		entryIdx += 1;
		return `<entry xml:lang="${lang}">`;
	});

	return xml;
}
