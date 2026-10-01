/**
 * The author as schema.org reads a person, and the one safe way to put structured data on a page.
 * See spec/architecture/identity.md.
 */
import { author } from '@canmi/identity';
import { URLS } from '@canmi/urls';

const { github, social } = URLS.external;

/** The author: the name a page signs with, the full name, the site, and each account's profile. */
export function person() {
	return {
		'@type': 'Person',
		name: author.name,
		alternateName: author.fullName,
		url: URLS.apps.production.site,
		sameAs: [
			`${github.web}/${author.github}`,
			...(author.twitter ? [`${social.twitter}/${author.twitter}`] : []),
			`${social.fediverse}/@${author.fediverse}`,
			`${social.bluesky}/${author.bluesky}`,
			`${social.telegram}/${author.telegram}`,
		],
	};
}

/**
 * A JSON-LD block, safe to drop into markup with `{@html}`: every `<` becomes `<` and the
 * closing tag is assembled, so no `</script` exists anywhere in it, whatever the data says.
 */
export function ldJson(data: unknown): string {
	const json = JSON.stringify(data).replaceAll('<', String.raw`<`);
	return `<script type="application/ld+json">${json}</${'script'}>`;
}
