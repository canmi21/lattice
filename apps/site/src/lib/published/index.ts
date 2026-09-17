/**
 * The published corpus as the site reads it: the API for metadata and hashes, the CDN for bytes.
 *
 * Every function here runs in three places -- the Worker during SSR, the browser after
 * hydration, and a universal `load` that is either -- so none may reach for a binding, a Worker
 * global or a DOM one. See spec/architecture/artifacts.md, "Two consumers, and the second one
 * is the browser".
 */

import { browser, dev } from '$app/environment';
import {
	artifactKey,
	feedHtml,
	readEnvelope,
	readPageEnvelope,
	type ArtifactType,
	type DocumentAnswer,
	type FeedAnswer,
	type HomeAnswer,
	type PublishedPage,
	type PublishedView,
	type SitemapAnswer,
	type ViewAnswer,
} from '@canmi/artifacts';
import { pageUrls, pickUrls, URLS } from '@canmi/urls';
import type { FeedEntry } from '$lib/documents/feed';
import { noticeHtml } from '$lib/documents/notice';
import type { LocaleCode } from '$lib/locale';
import { HOME_SLUG } from '$lib/opengraph';
import { answer } from './cache.ts';

type Fetch = typeof fetch;

/**
 * Where the two upstreams are, which depends on who is asking rather than on the environment.
 *
 * A page asks for the proxy path, since the host it should use is whichever one it was opened
 * from; the Worker needs an origin, because SvelteKit answers a same-origin path from its own
 * router and would never reach the dev proxy. The two are identical in production. See libs/urls.
 */
function upstream(): { api: string; cdn: string } {
	return browser ? pageUrls(dev) : pickUrls(dev);
}

function api(path: string): string {
	return `${upstream().api}${path}`;
}

/** An immutable object, whose long life is the CDN's own header and needs nothing from here. */
async function object(fetch: Fetch, type: ArtifactType, hash: string): Promise<Response> {
	const key = artifactKey(type, hash);
	const response = await fetch(`${upstream().cdn}/${key}`);
	if (!response.ok) throw new Error(`${key} answered ${response.status}`);
	return response;
}

/** One view's metadata alone, for a caller that wants a field rather than the article. */
export function publishedMetadata(
	fetch: Fetch,
	slug: string,
	locale: LocaleCode,
): Promise<ViewAnswer | undefined> {
	return answer<ViewAnswer>(fetch, api(`/view/${slug}?lang=${locale}`));
}

export async function publishedView(
	fetch: Fetch,
	slug: string,
	locale: LocaleCode,
): Promise<PublishedView | undefined> {
	const found = await publishedMetadata(fetch, slug, locale);
	if (!found) return undefined;
	const view = (await (
		await object(fetch, 'content', found.objects.content)
	).json()) as PublishedView;
	// Against the path the API answered with, not the one that was asked for: that is the one
	// the object declares, and the two disagreeing is what this check is here to catch.
	readEnvelope(view, found.slug, locale);
	return view;
}

/** A page's envelope names no locale, so it is checked without one. See libs/artifacts. */
async function publishedPageView(fetch: Fetch, hash: string, slug: string): Promise<PublishedPage> {
	const page = (await (await object(fetch, 'page', hash)).json()) as PublishedPage;
	readPageEnvelope(page, slug);
	return page;
}

/** The homepage: the articles it lists, and its own prose. A missing page is not fatal. */
export async function publishedHome(
	fetch: Fetch,
	locale: LocaleCode,
): Promise<{ articles: HomeAnswer['articles']; page: PublishedPage | undefined }> {
	const found = await answer<HomeAnswer>(fetch, api(`/home?lang=${locale}`));
	if (!found) throw new Error(`the API names no homepage for ${locale}`);
	const page = found.page
		? await publishedPageView(fetch, found.page.objects.content, HOME_SLUG)
		: undefined;
	return { articles: found.articles, page };
}

export function publishedSitemap(fetch: Fetch): Promise<SitemapAnswer | undefined> {
	return answer<SitemapAnswer>(fetch, api('/sitemap'));
}

/**
 * Everything one locale's feed is built from: the API's entry list, each entry's body rendered
 * from the content object it names.
 *
 * The objects are fetched together rather than in turn. They are immutable and a year old at the
 * edge, so the cost of a cold assembly is one round trip rather than N, and the document itself
 * is held for five minutes after that. See spec/architecture/artifacts.md.
 */
export async function publishedFeedEntries(
	fetch: Fetch,
	locale: LocaleCode,
): Promise<FeedEntry[] | undefined> {
	const found = await answer<FeedAnswer>(fetch, api(`/feed?lang=${locale}`));
	if (!found) return undefined;
	return Promise.all(
		found.entries.map(async (entry) => {
			const view = (await (
				await object(fetch, 'content', entry.objects.content)
			).json()) as PublishedView;
			readEnvelope(view, entry.slug, locale);
			// Above the article, as on the page. The original's address is the bare URL, which is
			// what the source view is addressed by. See spec/locale/views.md.
			const notice = noticeHtml(locale, view.meta.lang, view.language.translated, entry.url);
			const body = feedHtml(view.body.blocks, feedBases(entry.url));
			return { ...entry, html: notice ? `${notice}\n${body}` : body };
		}),
	);
}

/** Where the two absolute links a feed body writes are rooted, for whichever CDN is answering. */
function feedBases(url: string) {
	return { site: URLS.apps.production.site, images: `${upstream().cdn}/image/`, url };
}

/**
 * The source served at `<url>.md`, for an article and for the one standalone page alike.
 *
 * One lookup and no locale in it: the route spans both kinds of thing, and a `.md` endpoint
 * returns the source exactly as written. See spec/architecture/artifacts.md.
 */
export async function publishedMarkdown(fetch: Fetch, slug: string): Promise<Response | undefined> {
	const found = await answer<DocumentAnswer>(fetch, api(`/markdown/${slug}`));
	return found ? object(fetch, 'markdown', found.hash) : undefined;
}

/**
 * Fall back to a document navigation when a fetch fails in the browser.
 *
 * The server path still works, so the recovery is to use it; without this the failure is a
 * click that does nothing. The promise deliberately never settles -- the page it belongs to is
 * already being replaced. See spec/architecture/artifacts.md, "Two consumers".
 */
export async function orReload<T>(url: URL, work: Promise<T>): Promise<T> {
	try {
		return await work;
	} catch (failure) {
		if (!browser) throw failure;
		window.location.href = url.href;
		return new Promise<T>(() => {});
	}
}
