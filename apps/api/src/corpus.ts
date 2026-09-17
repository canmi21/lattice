import type {
	DocumentAnswer,
	HomeAnswer,
	Root,
	RootView,
	SitemapAnswer,
	ViewAnswer,
} from '@canmi/artifacts';
import { LOCALE_CODES, SITE_LANGUAGE, type LocaleCode } from '@canmi/locales';
import { inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { Hono, type Context } from 'hono';
import type { Bindings } from './bindings';
import { failure, success } from './respond';
import { findArticle, rootOf } from './root';
import { articleReads } from './schema';

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

corpus.get('/view/:slug{.+}', async (c) => {
	const locale = askedLocale(c);
	if (!locale) return failure(c, 400, 'unknown_locale', MISSED);

	const article = findArticle(await rootOf(c.env), c.req.param('slug'));
	const view = article?.views[locale];
	if (!article || !view) return failure(c, 404, 'not_found', MISSED);

	// The article's own path rather than the one that was asked for, because it is what the
	// consumer checks the fetched object's envelope against and keys the read counter by. The
	// markdown hash is not here: it has its own route, and a fact appears in exactly one answer.
	const { locale: language, metrics, ...rest } = view;
	const reads = await readsFor(c.env, [article.path]);
	const answer = {
		...rest,
		slug: article.path,
		url: article.url,
		locale: { ...language, code: locale },
		metrics: { ...metrics, reads: reads.get(article.path) ?? 0 },
	};
	return success(c, answer satisfies ViewAnswer, ANSWERED);
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

	// One query for the whole listing rather than one per row: a homepage that costs N round
	// trips to the database is a homepage that gets slower as the corpus grows.
	const reads = await readsFor(
		c.env,
		listed.map(({ article }) => article.path),
	);
	const articles: HomeAnswer['articles'] = listed.map(({ article, view }) => {
		const { locale: _language, metrics, ...rest } = view;
		return {
			...rest,
			slug: article.path,
			url: article.url,
			metrics: { ...metrics, reads: reads.get(article.path) ?? 0 },
		};
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

corpus.get('/feed', async (c) => {
	const locale = askedLocale(c);
	if (!locale) return failure(c, 400, 'unknown_locale', MISSED);

	const hash = (await rootOf(c.env)).feeds[locale];
	if (!hash) return failure(c, 404, 'not_found', MISSED);
	return success(c, { hash } satisfies DocumentAnswer, ANSWERED);
});

corpus.get('/llms', async (c) =>
	success(c, { hash: (await rootOf(c.env)).llms } satisfies DocumentAnswer, ANSWERED),
);

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

/**
 * How often each article has been read, in one query.
 *
 * D1 rather than the root, because a visitor writes this and the mirror is one-way -- see
 * spec/architecture/data.md. An article nobody has opened has no row, which is zero.
 */
async function readsFor(env: Bindings, slugs: string[]): Promise<Map<string, number>> {
	if (slugs.length === 0) return new Map();
	const rows = await drizzle(env.DATABASE)
		.select({ slug: articleReads.slug, count: articleReads.count })
		.from(articleReads)
		.where(inArray(articleReads.slug, slugs));
	return new Map(rows.map((row) => [row.slug, row.count]));
}

export default corpus;
