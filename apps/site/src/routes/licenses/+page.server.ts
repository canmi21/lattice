import { LOCALE_DEPENDENCY } from '$lib/locale/current.svelte';
import { URLS } from '@canmi/urls';
import { licenseDirectory, packageRows, REGISTRY_NAMES } from '$lib/licenses/directory';
import type { PageServerLoad } from './$types';

export const prerender = false;

export const load: PageServerLoad = ({ locals, depends }) => {
	// Declared so that choosing a language re-runs this load. The directory is not translated, so
	// there is nothing to fetch -- but the locale comes from the server's negotiation, and this is
	// what lets that happen again from the cookie without a full document load.
	depends(LOCALE_DEPENDENCY);

	const rows = packageRows();
	const registries = [...new Set(rows.map(({ registry }) => registry))].toSorted().map((id) => ({
		id,
		name: REGISTRY_NAMES[id] ?? id,
		href: URLS.external.registries[id as keyof typeof URLS.external.registries],
	}));

	return {
		licenses: licenseDirectory(),
		total: rows.length,
		registries,
		locale: { code: locals.locale?.code ?? 'mw' },
	};
};
