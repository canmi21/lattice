/**
 * One locale's whole Atom document, assembled at request time.
 *
 * It used to be published as an object, and the cost was the shape a content-addressed store is
 * worst at: a document the size of the whole corpus, rewritten whenever any one article changes.
 * Nine locales of a quarter-megabyte each, per edit, kept for ever. Every field it writes is
 * already in the API's answer or in the content objects that answer names, so the Worker builds
 * it instead. See spec/architecture/artifacts.md, "Which objects exist".
 */
import { generateAtomFeed } from 'feedsmith';
import { URLS } from '@canmi/urls';
import type { FeedAnswer } from '@canmi/artifacts';
import { localeUrl, type LocaleCode } from '$lib/locale';

const SITE = URLS.apps.production.site;
/** The site's own marks are named rather than hashed, and `/symlink` is where a name lives. */
const MARKS = `${URLS.apps.production.alias}/symlink`;

/** The site identity a feed carries, which `site.config.yaml` is the one source of. */
export type FeedSite = {
	name: string;
	tagline: string;
	author: { name: string; email: string };
	feed: { id: string; followDescription: string };
};

/** One entry: what the API answered about it, plus the body rendered from its content object. */
export type FeedEntry = FeedAnswer['entries'][number] & { html: string };

export function buildFeed(entries: readonly FeedEntry[], code: LocaleCode, site: FeedSite): string {
	const prepared = entries.map((entry) => ({
		id: entry.url,
		title: entry.meta.title,
		updated: new Date(entry.dates.lastmod),
		published: new Date(entry.dates.published),
		summary: entry.meta.description,
		content: entry.html,
		links: [{ href: entry.locale.canonical }],
		lang: entry.locale.language_tag,
	}));
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
		icon: `${MARKS}/favicon.svg`,
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
