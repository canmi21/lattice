import type {
	AssetAnswer,
	DocumentAnswer,
	FeedAnswer,
	HomeAnswer,
	Root,
	RootView,
	SitemapAnswer,
	ViewAnswer,
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

/** The only standalone page there is; see libs/artifacts, `PublishedPage`. */
const HOMEPAGE = 'homepage';

/**
 * One article, in one language.
 *
 * Both identifiers are query parameters, which is the rule here rather than this route's taste: a
 * single lookup asks with a query and a batch asks with a body, so nothing about a question lives
 * in the path. See spec/architecture/artifacts.md.
 *
 * `slug` takes the identity and nothing else -- one segment, no directory. The answer names the
 * path, so a caller that had only a stale address gets the real one back rather than a 404.
 */
corpus.get('/article', async (c) => {
	const locale = askedLocale(c);
	if (!locale) return failure(c, 400, 'unknown_locale', MISSED);
	const slug = c.req.query('slug');
	if (!slug) return failure(c, 400, 'expected_slug', MISSED);

	const article = findArticle(await rootOf(c.env), slug);
	const view = article?.views[locale];
	if (!article || !view) return failure(c, 404, 'not_found', MISSED);

	// Both halves, because the question only carried one. `slug` is what the consumer checks the
	// fetched object's envelope against and keys the read counter by; `path` is what it compares
	// the address in the browser's bar against, and redirects to when the two differ. The markdown
	// hash is not here: it has its own route, and a fact appears in exactly one answer.
	const { locale: language, ...rest } = view;
	const answer = {
		...rest,
		slug: article.slug,
		path: article.path,
		url: article.url,
		locale: { ...language, code: locale },
	};
	return success(c, answer satisfies ViewAnswer, ANSWERED);
});

/**
 * What a fixed name currently means.
 *
 * The one question the alias layer asks. A name like `favicon.ico` is what a browser or a mail
 * client is able to construct on its own, and this says which content-addressed object it stands
 * for today -- so the bytes keep a year and the name keeps its meaning. See
 * spec/architecture/delivery.md, "A name is resolved, never stored".
 */
corpus.get('/asset', async (c) => {
	const name = c.req.query('name');
	if (!name) return failure(c, 400, 'expected_name', MISSED);
	const asset = (await rootOf(c.env)).assets[name];
	if (!asset) return failure(c, 404, 'not_found', MISSED);
	return success(c, { name, ...asset } satisfies AssetAnswer, ANSWERED);
});

/**
 * The source `<url>.md` serves, for an article and for a standalone page alike.
 *
 * No locale, because the source is what was written whichever view asked for it -- so this has
 * no variant dimension and caches best, which is what pays for a sixth route. It is also the
 * only place a page's markdown hash is named.
 */
corpus.get('/source', async (c) => {
	const root = await rootOf(c.env);
	const slug = c.req.query('slug');
	if (!slug) return failure(c, 400, 'expected_slug', MISSED);
	// A page has no directory, so its identity is already its address.
	const article = findArticle(root, slug);
	const hash = article?.markdown ?? root.pages[slug]?.markdown;
	if (!hash) return failure(c, 404, 'not_found', MISSED);
	return success(c, { hash, path: article?.path ?? slug } satisfies DocumentAnswer, ANSWERED);
});

corpus.get('/homepage', async (c) => {
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
		return { ...rest, slug: article.slug, path: article.path, url: article.url };
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
			// The identity, because this is checked against the object's envelope and nothing else.
			slug: article.slug,
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
	const view = root.pages[HOMEPAGE]?.views[locale];
	return view ? { objects: { content: view.content, card: view.card } } : null;
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
