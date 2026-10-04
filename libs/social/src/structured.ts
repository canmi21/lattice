/**
 * The author as one entity every page names by the same identifier, and the one safe way to put
 * structured data on a page. See spec/architecture/entities.md.
 */
import { author } from '@canmi/identity';
import { URLS } from '@monoflake/sdk';

const SITE = URLS.apps.production.site;
const { github, social } = URLS.external;

/** The author's identifier: their entity home, `/about`, which every graph refers to. */
export const PERSON_ID = `${SITE}/about#person`;

/** The site's identifier, beside rather than on its address, so the author keeps theirs. */
export const SITE_ID = `${SITE}/#website`;

/** A node by its identifier alone, which is how every graph names an entity another one holds. */
export function ref(id: string): { '@id': string } {
	return { '@id': id };
}

/**
 * The author where another node names them: the identifier, which merges this into the author's
 * node, and the name and address beside it for a reader that does not follow identifiers.
 */
export function authorRef() {
	return { '@type': 'Person', '@id': PERSON_ID, name: author.name, url: SITE };
}

/** Every name the author goes by besides `name`: the full name, then each handle, once each. */
export function aliasesOf(of: typeof author = author): string[] {
	const names = [of.fullName, of.github, of.twitter, of.fediverse, of.telegram, of.telegramGroup];
	return [...new Set(names.filter((name): name is string => Boolean(name)))].filter(
		(name) => name !== of.name,
	);
}

/**
 * The author's own accounts that are shown -- `rel="me"` in a head, a list in a document. The
 * Telegram account is not among them: it is said in the structured data alone, and where Telegram
 * is shown it is the group. See spec/architecture/identity.md.
 */
export function profiles(): string[] {
	return [
		`${github.web}/${author.github}`,
		...(author.twitter ? [`${social.twitter}/${author.twitter}`] : []),
		`${social.fediverse}/@${author.fediverse}`,
		`${social.bluesky}/${author.bluesky}`,
	];
}

/** The Telegram group the author runs, which is the Telegram a page shows. */
export function telegramGroup(): string {
	return `${social.telegram}/${author.telegramGroup}`;
}

/** The author, whole: who they are, every name, every account, all from `@canmi/identity`. */
export function person() {
	return {
		'@type': 'Person',
		'@id': PERSON_ID,
		name: author.name,
		alternateName: aliasesOf(),
		jobTitle: author.role,
		url: SITE,
		email: `mailto:${author.email}`,
		image: `${github.avatars}/u/${author.githubId}`,
		identifier: {
			'@type': 'PropertyValue',
			propertyID: 'GitHub user ID',
			value: String(author.githubId),
		},
		sameAs: [...profiles(), `${social.telegram}/${author.telegram}`],
	};
}

/** Several nodes as one graph, related by their identifiers. */
export function graph(...nodes: object[]) {
	return { '@context': 'https://schema.org', '@graph': nodes };
}

/**
 * A JSON-LD block, safe to drop into markup with `{@html}`: every `<` becomes `<` and the
 * closing tag is assembled, so no `</script` exists anywhere in it, whatever the data says.
 */
export function ldJson(data: unknown): string {
	const json = JSON.stringify(data).replaceAll('<', String.raw`<`);
	return `<script type="application/ld+json">${json}</${'script'}>`;
}
