import { homepageContent } from '$lib/home/content';
import { orReload, publishedHome } from '$lib/published';
import { currentLocale, LOCALE_DEPENDENCY } from '$lib/locale/current.svelte';
import type { PageLoad } from './$types';

// HTML passes through the Worker so the site-wide private/no-store rule also applies here.
export const prerender = false;

// Landing page lists every article newest-first, which is the order the API answers in. The bio
// prose is content-driven (contents/homepage.md, also reachable at /homepage.md). Only the
// fields the cards render are forwarded.
export const load: PageLoad = async ({ url, fetch, parent, depends }) => {
	depends(LOCALE_DEPENDENCY);
	const { locale } = await parent();
	const code = currentLocale(locale.code);
	const home = await orReload(url, publishedHome(fetch, code));
	return {
		// Both halves of the article's name: the path is what a card links to, the slug is what
		// every question about it asks with. See spec/architecture/artifacts.md, "A slug is the
		// identity and the path is the address".
		articles: home.articles.map((article) => ({
			meta: article.meta,
			created: article.dates.created,
			slug: article.slug,
			path: article.path,
			paragraphs: article.preview.paragraphs,
		})),
		locale: { code },
		...homepageContent(home.page, code),
	};
};
