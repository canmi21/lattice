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
	artifactAddress,
	feedHtml,
	parseResource,
	unwrap,
	readEnvelope,
	readPageEnvelope,
	type ArtifactType,
	type AssetAnswer,
	type DocumentAnswer,
	type FeedAnswer,
	type HomeAnswer,
	type PublishedPage,
	type PublishedView,
	type SitemapAnswer,
	type StatsAnswer,
	type BatchAnswer,
	type BatchAnswerOf,
	type BatchRequest,
	type ParsedResource,
	type ViewAnswer,
} from '@canmi/artifacts';
import { pageUrls, pickUrls, URLS } from '@canmi/urls';
import type { FeedEntry } from '$lib/documents/feed';
import { noticeHtml } from '$lib/documents/notice';
import { LOCALE_CODES, type LocaleCode } from '$lib/locale';
import { HOME_SLUG } from '$lib/opengraph';
import { createBatcher } from '$lib/engagement/batch';
import {
	answer,
	heldBody,
	rememberAnswer,
	rememberBody,
	FRESH_MS,
	MISSING,
	STALE_MS,
} from './cache.ts';

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

/**
 * An immutable object, whose long life is the CDN's own header and needs nothing from here.
 *
 * The one fetch on this side deliberately outside the query cache. A content-addressed key cannot
 * denote different bytes, so the browser's own HTTP cache already holds it for a year and a second
 * copy in `localStorage` would be the same bytes twice. What the query layer is for is answers
 * that go stale. See spec/architecture/artifacts.md, "The key says what may cache it".
 */
async function object(fetch: Fetch, type: ArtifactType, hash: string): Promise<Response> {
	const address = artifactAddress(type, hash);
	const response = await fetch(`${upstream().cdn}/${address}`);
	if (!response.ok) throw new Error(`${address} answered ${response.status}`);
	return response;
}

/** One view's metadata alone, for a caller that wants a field rather than the article. */
export function publishedMetadata(
	fetch: Fetch,
	slug: string,
	locale: LocaleCode,
): Promise<ViewAnswer | undefined> {
	return answer<ViewAnswer>(fetch, viewUrl(slug, locale));
}

/**
 * The two public counters, cached the way every other five-minute answer here is.
 *
 * Engagement rather than corpus, and it lives here anyway: what decides where a fetch belongs is
 * which cache it wants, and this one wants the one this module owns -- served during SSR, held
 * for five minutes, and still answering from a stale copy when the API will not. See
 * spec/engagement.md.
 */
export function siteStats(fetch: Fetch): Promise<StatsAnswer | undefined> {
	return answer<StatsAnswer>(fetch, api('/stats'));
}

/**
 * The one batch entry point, asked and read in one place.
 *
 * `type` goes out and comes back, so the answer proves which question it answers rather than the
 * caller remembering. See libs/artifacts, `BatchRequest`.
 */
export async function askBatch<T extends BatchRequest>(
	asked: T,
	/**
	 * Whose `fetch` asks. The load's, wherever there is one: SvelteKit records what it answered
	 * and inlines it into the rendered page, so the same question after hydration is read out of
	 * the document rather than sent again. The global one is right for a warm, which only ever
	 * runs in a browser that is already looking at the page.
	 */
	asking: Fetch = fetch,
): Promise<BatchAnswerOf<T['type']>> {
	const response = await asking(api('/batch'), {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(asked),
	});
	if (!response.ok) throw new Error(`/batch answered ${response.status}`);
	const answered = unwrap<BatchAnswer>(await response.json(), response.url);
	if (answered.type !== asked.type) throw new Error(`/batch answered a ${answered.type} question`);
	return answered as BatchAnswerOf<T['type']>;
}

/** The address one view's metadata is asked for at, so a warm and a fetch agree on the key. */
function viewUrl(slug: string, locale: LocaleCode): string {
	// Both identifiers in the query, and the identity alone in `slug` -- never the path. See
	// spec/architecture/artifacts.md, "A question asks with a query; a list asks with a body".
	return api(`/article?slug=${encodeURIComponent(slug)}&lang=${locale}`);
}

/**
 * Warming several of one article's views with one question.
 *
 * The key carries both halves because the batcher deals in strings and two articles can be in
 * flight at once; `run` groups back by slug. Each answer is written under the URL `/view` would
 * have used, and its content object is fetched beside it -- the object is the large half, and
 * fetching it here is what makes taking the language instant rather than merely quick.
 */
const SEPARATOR = '\u0000';

const lookupView = createBatcher<ViewAnswer>({
	// Longer than the read-count window: a pointer travelling down a menu of nine languages moves
	// slower than one crossing a list of cards, and a batch of one helps nobody.
	window: 90,
	limit: LOCALE_CODES.length,
	run: async (keys) => {
		const bySlug = new Map<string, LocaleCode[]>();
		for (const key of keys) {
			const [slug = '', locale = ''] = key.split(SEPARATOR);
			bySlug.set(slug, [...(bySlug.get(slug) ?? []), locale as LocaleCode]);
		}

		const found = new Map<string, ViewAnswer>();
		await Promise.all(
			[...bySlug].map(async ([slug, locales]) => {
				const batch = await askBatch({ type: 'articles', slugs: [slug], locales });
				await Promise.all(
					Object.entries(batch.articles).map(async ([answered, article]) =>
						Promise.all(
							Object.entries(article.views).map(async ([code, view]) => {
								const locale = code as LocaleCode;
								const whole = {
									...view,
									slug: answered,
									path: article.path,
									url: article.url,
								} satisfies ViewAnswer;
								found.set(`${answered}${SEPARATOR}${locale}`, whole);
								await rememberAnswer(viewUrl(answered, locale), whole);
								// The object, so the swap that follows renders rather than downloads.
								await object(fetch, 'content', whole.objects.content).catch(() => undefined);
							}),
						),
					),
				);
			}),
		);
		return found;
	},
});

/** Fetch one view ahead of being asked for it, together with anything else asked for nearby. */
export async function warmView(slug: string, locale: LocaleCode): Promise<void> {
	if (!browser) return;
	await lookupView(`${slug}${SEPARATOR}${locale}`);
}

/**
 * One article, and where it lives.
 *
 * The path comes back with the view because the question could not carry it: `?slug=` takes the
 * identity alone, so the answer is the only thing that knows whether the address in the browser's
 * bar is the real one. A caller that renders without checking serves the article at every address
 * that reaches it, which is the duplicate-content shape. See spec/architecture/artifacts.md,
 * "Reaching an article by name".
 */
export type FoundArticle = { path: string; card?: string; view: PublishedView };

export async function publishedView(
	fetch: Fetch,
	slug: string,
	locale: LocaleCode,
): Promise<FoundArticle | undefined> {
	const found = await publishedMetadata(fetch, slug, locale);
	if (!found) return undefined;
	const view = (await (
		await object(fetch, 'content', found.objects.content)
	).json()) as PublishedView;
	// Against the identity the API answered with, not the one that was asked for: that is the one
	// the object declares, and the two disagreeing is what this check is here to catch.
	readEnvelope(view, found.slug, locale);
	return { path: found.path, card: found.objects.card, view };
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
): Promise<{ articles: HomeAnswer['articles']; card?: string; page: PublishedPage | undefined }> {
	const found = await answer<HomeAnswer>(fetch, api(`/homepage?lang=${locale}`));
	if (!found) throw new Error(`the API names no homepage for ${locale}`);
	const page = found.page
		? await publishedPageView(fetch, found.page.objects.content, HOME_SLUG)
		: undefined;
	return { articles: found.articles, card: found.page?.objects.card, page };
}

/**
 * The address one resource's record is asked for at, so a batch and a single lookup agree.
 *
 * `GET /media?rid=` is a real route and answers exactly this document. Writing what the batch
 * learned under that address is what makes the two one answer rather than two, and is the same
 * arrangement `lookupView` keeps over `/article`.
 */
function resourceUrl(rid: string): string {
	return api(`/media?rid=${encodeURIComponent(rid)}`);
}

/**
 * What every rid on one page currently means, asked once and held per resource.
 *
 * The second half of the resolution a compiled article stops short of, run from the universal
 * `load` so the Worker asks while rendering and the browser reads the inlined answer back on
 * hydration. A rid the corpus does not publish is remembered and keeps the publication delay; an
 * unreachable API is stored nowhere, and whatever is still held answers. See
 * spec/architecture/resource.md, "A rid is resolved three times".
 */
export async function publishedResources(
	fetch: Fetch,
	rids: readonly string[],
): Promise<Record<string, ParsedResource>> {
	const wanted = [...new Set(rids)];
	if (wanted.length === 0) return {};

	const held = await Promise.all(
		wanted.map(async (rid) => [rid, await heldBody(resourceUrl(rid))] as const),
	);

	const found: Record<string, ParsedResource> = {};
	const ask: string[] = [];
	for (const [rid, stored] of held) {
		// A remembered `MISSING` is an answer, so it costs no question and contributes no entry.
		if (stored && stored.age < FRESH_MS) {
			if (stored.body !== MISSING) read(found, rid, stored.body);
		} else {
			ask.push(rid);
		}
	}
	if (ask.length === 0) return found;

	try {
		const batch = await askBatch({ type: 'resources', rids: ask }, fetch);
		const bodies = ask.map((rid) => {
			const record = batch.resources[rid];
			return [rid, record === undefined ? MISSING : JSON.stringify(record)] as const;
		});
		await Promise.all(bodies.map(([rid, body]) => rememberBody(resourceUrl(rid), body)));
		for (const [rid, body] of bodies) {
			if (body !== MISSING) read(found, rid, body);
		}
	} catch {
		const stale = await Promise.all(
			ask.map(async (rid) => [rid, await heldBody(resourceUrl(rid))] as const),
		);
		for (const [rid, stored] of stale) {
			if (stored && stored.body !== MISSING && stored.age < STALE_MS) read(found, rid, stored.body);
		}
	}
	return found;
}

/** One stored record, parsed for as much of it as this build knows and dropped if it cannot be. */
function read(into: Record<string, ParsedResource>, rid: string, body: string): void {
	try {
		into[rid] = parseResource(JSON.parse(body));
	} catch {
		return;
	}
}

/**
 * What a fixed name currently stands for, cached like every other five-minute answer here.
 *
 * The same question the alias layer asks, put directly because this side already holds a fetch --
 * one hop rather than two, and nothing on the rendering path depends on the layer that resolves.
 */
export function publishedAsset(fetch: Fetch, name: string): Promise<AssetAnswer | undefined> {
	return answer<AssetAnswer>(fetch, api(`/asset?name=${encodeURIComponent(name)}`));
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
			const body = feedHtml(view.body.blocks, feedBases(entry.url, locale));
			return { ...entry, html: notice ? `${notice}\n${body}` : body };
		}),
	);
}

/** Where the links a feed body writes are rooted, for whichever CDN is answering. */
function feedBases(url: string, locale: LocaleCode) {
	return { site: URLS.apps.production.site, images: `${upstream().cdn}/object/`, url, locale };
}

/**
 * The source served at `<url>.md`, for an article and for the one standalone page alike.
 *
 * One lookup and no locale in it: the route spans both kinds of thing, and a `.md` endpoint
 * returns the source exactly as written. See spec/architecture/artifacts.md.
 */
export async function publishedMarkdown(
	fetch: Fetch,
	slug: string,
): Promise<{ path: string; body: Response } | undefined> {
	const found = await answer<DocumentAnswer>(
		fetch,
		api(`/source?slug=${encodeURIComponent(slug)}`),
	);
	if (!found) return undefined;
	return { path: found.path, body: await object(fetch, 'markdown', found.hash) };
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
