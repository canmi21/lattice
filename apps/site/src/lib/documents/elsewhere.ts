/**
 * The site's documents for machines, said once: what each is and where. Every agent view ends by
 * listing them, and llms.txt links them. See spec/architecture/markdown.md.
 */
import { URLS } from '@monoflake/sdk';
import { section } from '../server/agent-view';

export type SiteDocument = { name: string; path: string; note: string };

const DOCUMENTS = {
	homepage: {
		name: 'Homepage',
		path: '/homepage.md',
		note: 'The site, its author, and every article with its date, section and length.',
	},
	index: {
		name: 'Index for LLMs',
		path: '/llms.txt',
		note: 'Every article, and how to read the site.',
	},
	full: {
		name: 'Full text for LLMs',
		path: '/llms-full.txt',
		note: "Every article's agent view, in one document.",
	},
	sitemap: {
		name: 'Sitemap',
		path: '/sitemap.xml',
		note: 'Every page, with when it last changed.',
	},
	feed: {
		name: 'Atom feed',
		path: '/atom.xml',
		note: 'The full text of every article, newest first.',
	},
} as const satisfies Record<string, SiteDocument>;

export type DocumentName = keyof typeof DOCUMENTS;

/** A document's absolute address. */
export function documentUrl(name: DocumentName): string {
	return `${URLS.apps.production.site}${DOCUMENTS[name].path}`;
}

/** A document as an llms.txt link: its name, its address, what it is. */
export function documentLink(name: DocumentName): string {
	const document = DOCUMENTS[name];
	return `- [${document.name}](${documentUrl(name)}): ${document.note}`;
}

/** The section every agent view closes on: each document, by name and address. */
export function elsewhere(): string {
	return section(
		'Elsewhere on this site',
		undefined,
		(Object.keys(DOCUMENTS) as DocumentName[])
			.map((name) => `- ${DOCUMENTS[name].name}: ${documentUrl(name)}`)
			.join('\n'),
	);
}
