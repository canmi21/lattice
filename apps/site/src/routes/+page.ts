import { homepageContent } from '$lib/home/content';
import { orReload, publishedHome } from '$lib/published';
import type { PageLoad } from './$types';

// HTML passes through the Worker so the site-wide private/no-store rule also applies here.
export const prerender = false;

// Landing page lists every article newest-first, which is the order the API answers in. The bio
// prose is content-driven (contents/homepage.md, also reachable at /homepage.md). Only the
// fields the cards render are forwarded.
export const load: PageLoad = async ({ url, fetch, parent }) => {
	const { locale } = await parent();
	const home = await orReload(url, publishedHome(fetch, locale.code));
	return {
		articles: home.articles.map((article) => ({
			meta: article.meta,
			created: article.dates.created,
			path: article.slug,
			reads: article.metrics.reads,
			paragraphs: article.preview.paragraphs,
		})),
		locale: { code: locale.code },
		...homepageContent(home.page, locale.code),
	};
};
