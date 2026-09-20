import { error, redirect } from '@sveltejs/kit';
import { redirects } from 'virtual:redirects';
import { orReload, publishedResources, publishedView } from '$lib/published';
import { currentLocale, LOCALE_DEPENDENCY } from '$lib/locale/current.svelte';
import { namedResources } from '@canmi/artifacts';
import type { PageLoad } from './$types';

export const prerender = false;

/**
 * An article is asked for by identity and served only at its address.
 *
 * The last segment finds it, so a stale directory and the bare name both resolve. Neither is
 * served: both redirect, and why the two codes differ is spec/architecture/artifacts.md,
 * "Reaching an article by name".
 */
// Universal, so a navigation after hydration renders in the browser and never calls this site's
// Worker. See spec/architecture/artifacts.md, "Two consumers, and the second one is the browser".
export const load: PageLoad = async ({ params, url, fetch, parent, depends }) => {
	depends(LOCALE_DEPENDENCY);
	const target = redirects[`/${params.path}`];
	if (target) redirect(301, target);

	const asked = params.path.replace(/^\/+|\/+$/g, '');
	const segments = asked.split('/');
	const slug = segments.at(-1) ?? '';

	// The hyphen is what reserves every single word for this site's own router, so a name without
	// one cannot be an article and this is a 404 without asking the corpus at all. The build
	// refuses a corpus that would make this test lie; see lib/content/build/slugs.ts.
	if (!slug.includes('-')) error(404, 'Not found');

	const { locale } = await parent();
	const code = currentLocale(locale.code);
	const found = await orReload(url, publishedView(fetch, slug, code));
	if (!found) error(404, 'Not found');

	// The query rides along: `?lang=` selects the view, and dropping it here would answer a
	// reader's redirect in a language they did not ask for.
	if (found.path !== asked)
		redirect(segments.length > 1 ? 301 : 302, `/${found.path}${url.search}`);

	const view = found.view;
	// The second call on this path, and the same bet as the first. A compiled article names
	// resources and stops, so rendering one also asks what those rids currently mean -- once for
	// the whole page rather than once per resource. See spec/architecture/resource.md, "One
	// question per page, not one per resource".
	const resources = await publishedResources(fetch, namedResources(view.body.blocks));
	return {
		resources,
		// Which card this view shows, from the answer rather than from the address: a card is a
		// content-addressed object and there is nothing to derive one from a slug.
		card: found.card,
		// The identity, which is what the read counter is keyed by on the API side and what every
		// further question about this article asks with.
		slug: view.slug,
		meta: view.meta,
		body: view.body,
		metrics: view.metrics,
		locale: { code: view.locale, ...view.language },
	};
};
