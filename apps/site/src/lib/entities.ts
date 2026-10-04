/**
 * The site as the entity every page's graph refers into. See spec/architecture/entities.md.
 */
import { authorRef, SITE_ID } from '@canmi/social/structured';
import { URLS } from '@monoflake/sdk';
import { site } from '#lib/site.js';

/** The site, from the config the chrome reads, so its name is said once. */
export function websiteEntity() {
	return {
		'@type': 'WebSite',
		'@id': SITE_ID,
		name: site.name,
		alternateName: site.author.name,
		description: site.tagline,
		url: URLS.apps.production.site,
		author: authorRef(),
		publisher: authorRef(),
	};
}
