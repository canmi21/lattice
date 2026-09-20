import { URLS } from '@canmi/urls';
import { Miniflare } from 'miniflare';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import app from './app';
import type { Bindings } from './bindings';
import { standUpDatabase } from './d1.harness';
import { forgetRoot } from './root';
import { unwrap, type BatchAnswerOf, type FeedAnswer } from '@canmi/artifacts';

/**
 * The payload inside an answer, so a test asserts what a route returns rather than the envelope
 * every route shares. `unwrap` is the same one the site uses; a route that stops wrapping fails
 * here first. See libs/artifacts, `ApiResponse`.
 */
async function payload<T = unknown>(response: Response): Promise<T> {
	return unwrap<T>(await response.json(), response.url || 'test');
}

const SITE = URLS.apps.production.site;

type ViewOverrides = {
	content?: string;
	language_tag?: string;
	created?: string;
	lastmod?: string;
};

function view(overrides: ViewOverrides = {}): Record<string, unknown> {
	return {
		objects: { content: overrides.content ?? '0'.repeat(32) },
		locale: {
			language_tag: overrides.language_tag ?? 'en-US',
			canonical: `${SITE}/architecture/the-first`,
			translated: true,
		},
		meta: {
			title: 'Title',
			subtitle: 'Subtitle',
			description: 'Description',
			short: { title: 'Short', subtitle: 'Shorter' },
		},
		dates: {
			created: overrides.created ?? '2026-01-01T00:00:00.000Z',
			lastmod: overrides.lastmod ?? '2026-01-02T00:00:00.000Z',
		},
		metrics: { words: 900 },
		preview: { paragraphs: ['The opening.'] },
	};
}

// Out of publication order on purpose: the homepage's order is this route's to decide, not the
// root's to be trusted for.
const ROOT = {
	version: 1,
	assets: {},
	generated: '2026-01-03T00:00:00.000Z',
	articles: [
		{
			slug: 'the-first',
			path: 'architecture/the-first',
			url: `${SITE}/architecture/the-first`,
			markdown: '1'.repeat(32),
			alternates: [
				{ code: 'ja', language_tag: 'ja-JP', href: `${SITE}/ja/architecture/the-first` },
			],
			canonical_urls: [`${SITE}/architecture/the-first`, `${SITE}/ja/architecture/the-first`],
			views: {
				mw: view({ content: 'a'.repeat(32) }),
				en: view({ content: 'b'.repeat(32) }),
				ja: view({ content: 'c'.repeat(32), language_tag: 'ja-JP' }),
			},
		},
		{
			slug: 'the-second',
			path: 'mirror/the-second',
			url: `${SITE}/mirror/the-second`,
			markdown: '2'.repeat(32),
			alternates: [],
			canonical_urls: [`${SITE}/mirror/the-second`],
			views: {
				mw: view({ created: '2026-02-01T00:00:00.000Z', lastmod: '2026-02-02T00:00:00.000Z' }),
				en: view({ created: '2026-02-01T00:00:00.000Z', lastmod: '2026-02-02T00:00:00.000Z' }),
			},
		},
	],
	pages: {
		homepage: {
			markdown: '3'.repeat(32),
			views: { mw: { content: '4'.repeat(32) }, en: { content: 'd'.repeat(32) } },
		},
	},
};

beforeEach(async () => {
	forgetRoot();
	await database.prepare('DELETE FROM article_reads').run();
});

describe('GET /view/:slug', () => {
	it('answers with the view, its hashes and five minutes', async () => {
		const res = await get('/article?slug=the-first&lang=en');
		expect(res.status).toBe(200);
		expect(res.headers.get('Cache-Control')).toBe('public, max-age=300, stale-if-error=10800');
		expect(await payload(res)).toMatchObject({
			// The question carried the identity; the answer carries both, so a caller holding a
			// stale address learns the real one instead of a 404.
			slug: 'the-first',
			path: 'architecture/the-first',
			url: `${SITE}/architecture/the-first`,
			locale: { code: 'en', language_tag: 'en-US', translated: true },
			objects: { content: 'b'.repeat(32) },
			meta: { title: 'Title', short: { title: 'Short' } },
			dates: { created: '2026-01-01T00:00:00.000Z' },
			metrics: { words: 900 },
			preview: { paragraphs: ['The opening.'] },
		});
	});

	// Five minutes on a miss too, but no `stale-if-error`: a 404 is not an error worth serving
	// stale. See spec/architecture/artifacts.md.
	it('caches a miss as long as an answer, without offering it stale', async () => {
		const unknown = await get('/article?slug=made/up&lang=en');
		expect(unknown.status).toBe(404);
		expect(unknown.headers.get('Cache-Control')).toBe('public, max-age=300');

		const untranslated = await get('/article?slug=the-second&lang=ja');
		expect(untranslated.status).toBe(404);
	});

	it('refuses a locale it does not know rather than falling back to one it does', async () => {
		const res = await get('/article?slug=the-first&lang=xx');
		expect(res.status).toBe(400);
	});

	// The hash `<url>.md` needs has its own route, and appears in no other answer. See
	// spec/architecture/artifacts.md, "A fact appears in exactly one answer".
	it('does not name the markdown hash', async () => {
		expect(await payload(await get('/article?slug=the-first&lang=en'))).not.toHaveProperty(
			'markdown',
		);
	});
});

describe('GET /source', () => {
	it('answers for an article and for a standalone page alike', async () => {
		expect(await payload(await get('/source?slug=the-first'))).toEqual({
			hash: '1'.repeat(32),
			path: 'architecture/the-first',
		});
		// A page has no directory, so its identity is already its address.
		expect(await payload(await get('/source?slug=homepage'))).toEqual({
			hash: '3'.repeat(32),
			path: 'homepage',
		});
	});

	it('caches a miss for five minutes, without offering it stale', async () => {
		const res = await get('/source?slug=made/up');
		expect(res.status).toBe(404);
		expect(res.headers.get('Cache-Control')).toBe('public, max-age=300');
	});
});

describe('GET /homepage', () => {
	it('lists the locale views newest first, with the homepage page', async () => {
		const res = await get('/homepage?lang=en');
		expect(res.status).toBe(200);
		const body = await payload<{
			locale: { code: string; language_tag: string };
			page: { objects: { content: string } };
			articles: { slug: string; path: string }[];
		}>(res);
		expect(body.locale).toEqual({ code: 'en', language_tag: 'en-US' });
		expect(body.articles.map((article) => article.slug)).toEqual(['the-second', 'the-first']);
		expect(body.articles.map((article) => article.path)).toEqual([
			'mirror/the-second',
			'architecture/the-first',
		]);
		expect(body.page).toEqual({ objects: { content: 'd'.repeat(32) } });
	});

	// Nothing stands in for a view this locale does not have, here or on /view.
	it('drops an article this locale cannot show, and answers no page at all', async () => {
		const res = await get('/homepage?lang=ja');
		const body = await payload<{ page: unknown; articles: { slug: string }[] }>(res);
		expect(body.articles.map((article) => article.slug)).toEqual(['the-first']);
		expect(body.page).toBeNull();
	});
});

describe('GET /sitemap', () => {
	it('carries one entry per distinct address, dated by the source view', async () => {
		const res = await get('/sitemap');
		expect(await payload(res)).toEqual({
			generated: ROOT.generated,
			views: [
				{
					loc: `${SITE}/architecture/the-first`,
					lastmod: '2026-01-02T00:00:00.000Z',
					alternates: ROOT.articles[0]?.alternates,
				},
				{
					loc: `${SITE}/ja/architecture/the-first`,
					lastmod: '2026-01-02T00:00:00.000Z',
					alternates: ROOT.articles[0]?.alternates,
				},
				{ loc: `${SITE}/mirror/the-second`, lastmod: '2026-02-02T00:00:00.000Z', alternates: [] },
			],
		});
	});
});

/**
 * The envelope is the point of having one, so nothing may answer outside it.
 *
 * A handler's refusal was wrapped from the start; hono's own was not, and the gap only showed in
 * production -- `GET /batch` answered `text/plain` `404 Not Found`, which a caller parsing JSON
 * reads as a syntax error rather than a message. See spec/architecture/artifacts.md.
 */
describe('a refusal nothing handled', () => {
	it('wraps a route that does not exist, and caches it as a miss', async () => {
		const res = await get('/nonexistent');
		expect(res.status).toBe(404);
		expect(res.headers.get('Content-Type')).toContain('application/json');
		expect(await res.json()).toEqual({ status: 'error', message: 'no_such_route' });
		expect(res.headers.get('Cache-Control')).toBe('public, max-age=300');
	});

	// The first thing anyone does with a URL is open it in a browser, and a browser sends GET.
	it('tells a GET on the batch route which method it takes', async () => {
		const res = await get('/batch');
		expect(res.status).toBe(405);
		expect(res.headers.get('Allow')).toBe('POST');
		expect(await res.json()).toEqual({ status: 'error', message: 'batch_takes_post' });
	});
});

describe('POST /batch', () => {
	// One route for every question asked about many things, discriminated by `type`. A language
	// menu is one slug and many locales; a homepage warming its list is the other way round, and
	// this is one question. See spec/architecture/artifacts.md, "One batch entry point".
	it('answers the cross product, names each article once, and leaves out what it has not', async () => {
		const answered = await payload<BatchAnswerOf<'articles'>>(
			await get('/batch', {
				method: 'POST',
				body: {
					type: 'articles',
					slugs: ['the-first', 'the-second', 'made-up'],
					locales: ['en', 'ja'],
				},
			}),
		);
		expect(answered.type).toBe('articles');
		// `made-up` names no article, so it is absent rather than an error.
		expect(Object.keys(answered.articles).toSorted()).toEqual(['the-first', 'the-second']);
		expect(answered.articles['the-first']?.url).toBe(`${SITE}/architecture/the-first`);
		// `the-second` has no Japanese view, so that locale is absent from it alone.
		expect(Object.keys(answered.articles['the-first']?.views ?? {}).toSorted()).toEqual([
			'en',
			'ja',
		]);
		expect(Object.keys(answered.articles['the-second']?.views ?? {})).toEqual(['en']);
		expect(answered.articles['the-first']?.views.ja).toMatchObject({
			objects: { content: 'c'.repeat(32) },
			locale: { code: 'ja', language_tag: 'ja-JP' },
		});
		// The address is named once above the views, and the identity is the key it is filed under,
		// so neither is repeated inside one.
		expect(answered.articles['the-first']?.path).toBe('architecture/the-first');
		expect(answered.articles['the-first']?.views.ja).not.toHaveProperty('slug');
		expect(answered.articles['the-first']?.views.ja).not.toHaveProperty('path');
	});

	it('refuses a body whose type it cannot read, and one that names no type at all', async () => {
		for (const body of [
			{ type: 'articles', slugs: 'not-a-list', locales: ['en'] },
			{ type: 'reads' },
			{ type: 'nonsense', slugs: [] },
			{ slugs: ['the-first'] },
		]) {
			expect((await get('/batch', { method: 'POST', body })).status).toBe(400);
		}
	});

	it('refuses a locale that is not one, rather than dropping it quietly', async () => {
		const res = await get('/batch', {
			method: 'POST',
			body: { type: 'articles', slugs: ['the-first'], locales: ['en', 'nonsense'] },
		});
		expect(res.status).toBe(400);
	});

	/**
	 * A page names resources and asks what they mean once. See spec/architecture/resource.md,
	 * "One question per page, not one per resource".
	 */
	it('answers rids with their stored records, and leaves out the ones nothing publishes', async () => {
		const record = { version: 5, resource: 'k7m2x', type: 'media.image.icon' };
		const asked: string[] = [];
		const store = async (url: string): Promise<Response> => {
			asked.push(new URL(url).pathname);
			return new URL(url).pathname === '/meta/k7m2x.json'
				? new Response(JSON.stringify(record))
				: new Response('not found', { status: 404 });
		};

		const answered = await payload<BatchAnswerOf<'resources'>>(
			await get('/batch', {
				fetch: store,
				method: 'POST',
				// `zzzzz` is a rid nothing publishes; `NOPE!` could never be one at all.
				body: { type: 'resources', rids: ['k7m2x', 'k7m2x', 'zzzzz', 'NOPE!'] },
			}),
		);

		expect(answered.type).toBe('resources');
		expect(Object.keys(answered.resources)).toEqual(['k7m2x']);
		expect(answered.resources['k7m2x']).toEqual(record);
		// Deduplicated, and a string that could never be an id costs no lookup at all.
		expect(asked.toSorted()).toEqual(['/meta/k7m2x.json', '/meta/zzzzz.json']);
	});

	it('takes a rid however it was spelled, the record being filed in one case', async () => {
		const store = async (url: string): Promise<Response> =>
			new URL(url).pathname === '/meta/k7m2x.json'
				? new Response(JSON.stringify({ resource: 'k7m2x' }))
				: new Response('not found', { status: 404 });
		const answered = await payload<BatchAnswerOf<'resources'>>(
			await get('/batch', {
				fetch: store,
				method: 'POST',
				body: { type: 'resources', rids: ['K7M2X'] },
			}),
		);
		expect(Object.keys(answered.resources)).toEqual(['k7m2x']);
	});
});

describe('the feed', () => {
	// Entries and not a document: the feed is assembled by whoever asked, out of objects this
	// answer names. See spec/architecture/artifacts.md, "Which objects exist".
	it('lists what one locale has, newest change first, and nothing for a locale with none', async () => {
		const answered = await payload<FeedAnswer>(await get('/feed?lang=en'));
		expect(answered.locale).toEqual({ code: 'en' });
		// Not the root's order: `mirror/the-second` is second there and changed later, so it leads.
		expect(answered.entries.map((entry) => entry.slug)).toEqual(['the-second', 'the-first']);
		expect(answered.entries[1]).toMatchObject({
			url: `${SITE}/architecture/the-first`,
			objects: { content: 'b'.repeat(32) },
			locale: { language_tag: 'en-US', translated: true },
			meta: { title: 'Title', description: 'Description' },
		});

		// A locale no article has a view in is an empty feed, not a 404: the site still exists.
		expect((await payload<FeedAnswer>(await get('/feed?lang=ko'))).entries).toEqual([]);
	});
});

// The asymmetry the design turns on: a failure that is cached for five minutes is a blip that
// became an outage, so it is the one answer here that is never stored.
describe('a root that cannot be read', () => {
	it('fails rather than reporting an empty corpus, and is not cached', async () => {
		const res = await get('/homepage?lang=en', {
			fetch: async () => new Response('nope', { status: 404 }),
		});
		expect(res.status).toBe(500);
		expect(res.headers.get('Cache-Control')).toBe('no-store');
	});

	it('fails on a root it cannot parse', async () => {
		const stale = { ...ROOT, version: 0 };
		const res = await get('/sitemap', { fetch: async () => new Response(JSON.stringify(stale)) });
		expect(res.status).toBe(500);
		expect(res.headers.get('Cache-Control')).toBe('no-store');
	});
});

let miniflare: Miniflare;
let database: Awaited<ReturnType<Miniflare['getD1Database']>>;

// A real D1, because the article answers now carry a read count and a stub would only prove the
// route reads something. See spec/architecture/data.md on why the count lives here and not in the
// root: a visitor writes it, and the mirror runs one way.
beforeAll(async () => {
	({ miniflare, database } = await standUpDatabase());
});

afterAll(async () => {
	await miniflare.dispose();
});

type Asked = {
	/** The store this request reads through. Takes the key, so a test can hold more than one. */
	fetch?: (url: string) => Promise<Response>;
	method?: string;
	body?: Record<string, unknown>;
};

async function get(path: string, asked: Asked = {}): Promise<Response> {
	const bindings = {
		ASSETS: {
			fetch: asked.fetch ?? (async (): Promise<Response> => new Response(JSON.stringify(ROOT))),
		} as unknown as Bindings['ASSETS'],
		DATABASE: database as unknown as Bindings['DATABASE'],
	} as Bindings;
	return app.fetch(
		new Request(`${URLS.apps.production.api}${path}`, {
			method: asked.method,
			headers: asked.body ? { 'Content-Type': 'application/json' } : undefined,
			body: asked.body ? JSON.stringify(asked.body) : undefined,
		}),
		bindings,
	);
}
