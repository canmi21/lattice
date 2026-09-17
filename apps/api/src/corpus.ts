import type {
	DocumentAnswer,
	FeedAnswer,
	HomeAnswer,
	Root,
	RootView,
	SitemapAnswer,
	ViewAnswer,
	ViewsAnswer,
} from '@canmi/artifacts';
import { LOCALE_CODES, SITE_LANGUAGE, type LocaleCode } from '@canmi/locales';
import { Hono, type Context } from 'hono';
import type { Bindings } from './bindings';
import { failure, success } from './respond';
import { findArticle, rootOf } from './root';

/**
 * What is published right now, derived from the root and nothing else.
 *
 * An answer carries metadata and hashes, never a body: the objects it names are content-addressed
 * and are fetched from the CDN, which may hold them for a year. One variant dimension and it is
 * the locale, because every further one divides a five-minute cache by the values it takes. See
 * spec/architecture/artifacts.md, "The API is the only thing that changes".
 */
const corpus = new Hono<{ Bindings: Bindings }>();

/**
 * Five minutes on a miss, the same as on an answer, and it is never longer.
 *
 * A new article invisible for five minutes is the delay this design already accepts. Five minutes
 * on "the API failed" would turn a blip into an outage, which is why a 5xx is `no-store` instead;
 * the asymmetry is spec/architecture/artifacts.md's, not this file's.
 */
const MISSED = { 'Cache-Control': 'public, max-age=300' } as const;

/**
 * An answer says how stale it may usefully get; it does not do the serving.
 *
 * Three hours, because a root that old names objects that are all still there and still
 * immutable, so what it renders is a coherent older page. Only a 2xx carries it: a 404 is not an
 * error worth serving stale. The site holds the cache that acts on this -- see
 * spec/architecture/artifacts.md, "The site keeps serving when the API does not".
 */
const ANSWERED = { 'Cache-Control': 'public, max-age=300, stale-if-error=10800' } as const;

/**
 * What a batch earns, which is nothing an edge can hold.
 *
 * A POST is not a cacheable request, and pretending otherwise would put a header on an answer no
 * shared cache will ever read. The caller memoises what it asked for; see the site's cache.ts.
 */
const NO_STORE = { 'Cache-Control': 'no-store' } as const;

/** The only standalone page there is; see libs/artifacts, `PublishedPage`. */
const HOMEPAGE = 'homepage';

corpus.get('/view/:slug{.+}', async (c) => {
	const locale = askedLocale(c);
	if (!locale) return failure(c, 400, 'unknown_locale', MISSED);

	const article = findArticle(await rootOf(c.env), c.req.param('slug'));
	const view = article?.views[locale];
	if (!article || !view) return failure(c, 404, 'not_found', MISSED);

	// The article's own path rather than the one that was asked for, because it is what the
	// consumer checks the fetched object's envelope against and keys the read counter by. The
	// markdown hash is not here: it has its own route, and a fact appears in exactly one answer.
	const { locale: language, ...rest } = view;
	const answer = {
		...rest,
		slug: article.path,
		url: article.url,
		locale: { ...language, code: locale },
	};
	return success(c, answer satisfies ViewAnswer, ANSWERED);
});

/**
 * Several of one article's views, for a consumer about to need one of them.
 *
 * A POST because the question is a list, the same shape `/read-counts` takes and for the same
 * reason: a batch belongs in a body rather than repeated in a URL. It costs the five-minute cache,
 * which is the trade -- a warm is answered once and then lives in the caller's own memo, so the
 * edge would be holding a copy nobody asks for twice.
 */
corpus.post('/views', async (c) => {
	const asked = await c.req.json().catch(() => undefined);
	const slug = (asked as { slug?: unknown } | undefined)?.slug;
	const locales = (asked as { locales?: unknown } | undefined)?.locales;
	if (typeof slug !== 'string' || !Array.isArray(locales)) {
		return failure(c, 400, 'expected_slug_and_locales', NO_STORE);
	}

	const article = findArticle(await rootOf(c.env), slug);
	if (!article) return failure(c, 404, 'not_found', NO_STORE);

	const views: ViewsAnswer['views'] = {};
	for (const asking of locales) {
		if (!(LOCALE_CODES as readonly unknown[]).includes(asking)) continue;
		const code = asking as LocaleCode;
		const view = article.views[code];
		if (!view) continue;
		const { locale: language, ...rest } = view;
		views[code] = { ...rest, locale: { ...language, code } };
	}

	const answer = { slug: article.path, url: article.url, views };
	return success(c, answer satisfies ViewsAnswer, NO_STORE);
});

/**
 * The source `<url>.md` serves, for an article and for a standalone page alike.
 *
 * No locale, because the source is what was written whichever view asked for it -- so this has
 * no variant dimension and caches best, which is what pays for a sixth route. It is also the
 * only place a page's markdown hash is named.
 */
corpus.get('/markdown/:slug{.+}', async (c) => {
	const root = await rootOf(c.env);
	const slug = c.req.param('slug');
	const hash = findArticle(root, slug)?.markdown ?? root.pages[slug]?.markdown;
	if (!hash) return failure(c, 404, 'not_found', MISSED);
	return success(c, { hash } satisfies DocumentAnswer, ANSWERED);
});

corpus.get('/home', async (c) => {
	const locale = askedLocale(c);
	if (!locale) return failure(c, 400, 'unknown_locale', MISSED);

	const root = await rootOf(c.env);
	const listed: { article: Root['articles'][number]; view: RootView }[] = [];
	for (const article of root.articles) {
		const view = article.views[locale];
		if (view) listed.push({ article, view });
	}

	const articles: HomeAnswer['articles'] = listed.map(({ article, view }) => {
		const { locale: _language, ...rest } = view;
		return { ...rest, slug: article.path, url: article.url };
	});

	const answer = {
		locale: { code: locale, language_tag: languageTagOf(root, locale) },
		page: homepage(root, locale),
		// Sorted here rather than trusted from the root, so the order the homepage renders in is
		// a property of this route.
		articles: articles.toSorted(
			(a, b) => Date.parse(b.dates.created) - Date.parse(a.dates.created),
		),
	};
	return success(c, answer satisfies HomeAnswer, ANSWERED);
});

corpus.get('/sitemap', async (c) => {
	const root = await rootOf(c.env);
	const views = root.articles.flatMap((article) => {
		// The source view dates the article: every translation is of the same file, so `mw` is the
		// one that moves when it does.
		const lastmod = article.views.mw?.dates.lastmod;
		if (!lastmod) return [];
		return article.canonical_urls.map((loc) => ({ loc, lastmod, alternates: article.alternates }));
	});
	const answer = { generated: root.generated, views };
	return success(c, answer satisfies SitemapAnswer, ANSWERED);
});

/**
 * What the feed for one locale is made of, rather than the feed itself.
 *
 * Newest first by when the article last changed, which is the order an Atom document declares in
 * its own `updated` and the one a reader sees. Sorted here for the reason the homepage's order is
 * sorted here: it is a property of the answer, not something a consumer is trusted to redo.
 */
corpus.get('/feed', async (c) => {
	const locale = askedLocale(c);
	if (!locale) return failure(c, 400, 'unknown_locale', MISSED);

	const entries: FeedAnswer['entries'] = [];
	for (const article of (await rootOf(c.env)).articles) {
		const view = article.views[locale];
		if (!view) continue;
		entries.push({
			slug: article.path,
			url: article.url,
			objects: view.objects,
			locale: view.locale,
			meta: { title: view.meta.title, description: view.meta.description },
			dates: view.dates,
		});
	}

	const answer = {
		locale: { code: locale },
		entries: entries.toSorted((a, b) => Date.parse(b.dates.lastmod) - Date.parse(a.dates.lastmod)),
	};
	return success(c, answer satisfies FeedAnswer, ANSWERED);
});

/**
 * The homepage as this locale's view, and no second fetch for the bio.
 *
 * Every view of a page is the source, so the reader's own view already carries the identity
 * copy -- see apps/site, `articles.ts`. A view this locale does not have is nothing, as a
 * missing article view is a 404 and not a fallback.
 */
function homepage(root: Root, locale: LocaleCode): HomeAnswer['page'] {
	const content = root.pages[HOMEPAGE]?.views[locale]?.content;
	return content ? { objects: { content } } : null;
}

/**
 * Which view was asked for: `?lang=`, and the source when nothing was asked.
 *
 * A query parameter rather than a path segment, because that is how this site already asks --
 * `spec/locale/addressing.md` gives `lang` as a reader's first preference source and `llms.txt`
 * documents it for machines. One spelling reaches the site and the API. Absent means `mw`, the
 * same answer a bare URL gives; an unknown value is a 400 and never a fallback to another view.
 */
function askedLocale(c: Context): LocaleCode | undefined {
	const asked = c.req.query('lang');
	if (asked === undefined || asked === '') return 'mw';
	return (LOCALE_CODES as readonly string[]).includes(asked) ? (asked as LocaleCode) : undefined;
}

/** The tag this locale's views carry, taken from the first that has one. */
function languageTagOf(root: Root, locale: LocaleCode): string {
	for (const article of root.articles) {
		const tag = article.views[locale]?.locale.language_tag;
		if (tag) return tag;
	}
	return SITE_LANGUAGE;
}

export default corpus;
