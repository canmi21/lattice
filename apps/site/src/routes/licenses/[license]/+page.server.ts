import { LOCALE_DEPENDENCY } from '$lib/locale/current.svelte';
import { error } from '@sveltejs/kit';
import { URLS } from '@canmi/urls';
import { packagesForLicense, REGISTRY_NAMES } from '$lib/licenses/directory';
import type { PageServerLoad } from './$types';

export const prerender = false;

export const load: PageServerLoad = ({ params, locals, depends }) => {
	// Declared so that choosing a language re-runs this load. The directory is not translated, so
	// there is nothing to fetch -- but the locale comes from the server's negotiation, and this is
	// what lets that happen again from the cookie without a full document load.
	depends(LOCALE_DEPENDENCY);

	const found = packagesForLicense(params.license);
	if (!found) error(404, 'License not found');

	const grouped = new Map<string, typeof found.rows>();
	for (const row of found.rows) {
		grouped.set(row.registry, [...(grouped.get(row.registry) ?? []), row]);
	}

	const directSpdx =
		/^[A-Za-z0-9.-]+$/.test(found.license.license) &&
		!found.license.license.startsWith('LicenseRef-');

	return {
		license: found.license,
		groups: [...grouped].map(([registry, rows]) => ({
			registry,
			name: REGISTRY_NAMES[registry] ?? registry,
			rows,
		})),
		spdxHref: directSpdx
			? `${URLS.external.spdx}/${found.license.license}.html`
			: URLS.external.spdx,
		locale: { code: locals.locale?.code ?? 'mw' },
	};
};
