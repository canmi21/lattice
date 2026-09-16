import { error, redirect } from '@sveltejs/kit';
import { redirects } from 'virtual:redirects';
import { orReload, publishedView } from '$lib/published';
import type { PageLoad } from './$types';

export const prerender = false;

// Universal, so a navigation after hydration renders in the browser and never calls this site's
// Worker. See spec/architecture/artifacts.md, "Two consumers, and the second one is the browser".
export const load: PageLoad = async ({ params, url, fetch, parent }) => {
	const target = redirects[`/${params.path}`];
	if (target) redirect(301, target);
	const { locale } = await parent();
	const view = await orReload(url, publishedView(fetch, params.path, locale.code));
	if (!view) error(404, 'Not found');
	return {
		// The article's own path, not the requested one: it is what the read counter is keyed
		// by on the API side, and the two lists have to name the same thing.
		slug: view.slug,
		meta: view.meta,
		phoneTitle: view.phoneTitle,
		toc: view.toc,
		blocks: view.blocks,
		summary: view.summary,
		words: view.words,
		locale: {
			code: view.locale,
			languageTag: view.languageTag,
			canonical: view.canonical,
			alternates: view.alternates,
			translationAvailable: view.translationAvailable,
		},
	};
};
