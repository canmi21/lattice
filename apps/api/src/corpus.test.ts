import { URLS } from '@canmi/urls';
import { Miniflare } from 'miniflare';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import app from './app';
import type { Bindings } from './bindings';
import { standUpDatabase } from './d1.harness';
import { forgetRoot } from './root';
import { unwrap } from '@canmi/artifacts';

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
			canonical: `${SITE}/architecture/one`,
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
	generated: '2026-01-03T00:00:00.000Z',
	articles: [
		{
			path: 'architecture/one',
			url: `${SITE}/architecture/one`,
			markdown: '1'.repeat(32),
			alternates: [{ code: 'ja', language_tag: 'ja-JP', href: `${SITE}/ja/architecture/one` }],
			canonical_urls: [`${SITE}/architecture/one`, `${SITE}/ja/architecture/one`],
			views: {
				mw: view({ content: 'a'.repeat(32) }),
				en: view({ content: 'b'.repeat(32) }),
				ja: view({ content: 'c'.repeat(32), language_tag: 'ja-JP' }),
			},
		},
		{
			path: 'mirror/two',
			url: `${SITE}/mirror/two`,
			markdown: '2'.repeat(32),
			alternates: [],
			canonical_urls: [`${SITE}/mirror/two`],
			views: {
				mw: view({ created: '2026-02-01T00:00:00.000Z', lastmod: '2026-02-02T00:00:00.000Z' }),
				en: view({ created: '2026-02-01T00:00:00.000Z' }),
			},
		},
	],
	pages: {
		homepage: {
			markdown: '3'.repeat(32),
			views: { mw: { content: '4'.repeat(32) }, en: { content: 'd'.repeat(32) } },
		},
	},
	feeds: { en: 'e'.repeat(32) },
	llms: 'f'.repeat(32),
};

beforeEach(async () => {
	forgetRoot();
	await database.prepare('DELETE FROM article_reads').run();
});

describe('GET /view/:slug', () => {
	it('answers with the view, its hashes and five minutes', async () => {
		const res = await get('/view/architecture/one?lang=en');
		expect(res.status).toBe(200);
		expect(res.headers.get('Cache-Control')).toBe('public, max-age=300, stale-if-error=10800');
		expect(await payload(res)).toMatchObject({
			slug: 'architecture/one',
			url: `${SITE}/architecture/one`,
			locale: { code: 'en', language_tag: 'en-US', translated: true },
			objects: { content: 'b'.repeat(32) },
			meta: { title: 'Title', short: { title: 'Short' } },
			dates: { created: '2026-01-01T00:00:00.000Z' },
			// Read from D1 rather than the root, and zero for an article nobody has opened.
			metrics: { words: 900, reads: 0 },
			preview: { paragraphs: ['The opening.'] },
		});
	});

	// Five minutes on a miss too, but no `stale-if-error`: a 404 is not an error worth serving
	// stale. See spec/architecture/artifacts.md.
	it('caches a miss as long as an answer, without offering it stale', async () => {
		const unknown = await get('/view/made/up?lang=en');
		expect(unknown.status).toBe(404);
		expect(unknown.headers.get('Cache-Control')).toBe('public, max-age=300');

		const untranslated = await get('/view/mirror/two?lang=ja');
		expect(untranslated.status).toBe(404);
	});

	it('refuses a locale it does not know rather than falling back to one it does', async () => {
		const res = await get('/view/architecture/one?lang=xx');
		expect(res.status).toBe(400);
	});

	it('carries the read count from D1, for one article and for the listing', async () => {
		await database
			.prepare('INSERT INTO article_reads (slug, count) VALUES (?, ?)')
			.bind('architecture/one', 42)
			.run();

		const one = await payload<{ metrics: { reads: number } }>(
			await get('/view/architecture/one?lang=en'),
		);
		expect(one.metrics.reads).toBe(42);

		// And the listing takes them in one query, so a homepage does not cost a round trip per row.
		const home = await payload<{ articles: { slug: string; metrics: { reads: number } }[] }>(
			await get('/home?lang=en'),
		);
		expect(Object.fromEntries(home.articles.map((a) => [a.slug, a.metrics.reads]))).toEqual({
			'architecture/one': 42,
			'mirror/two': 0,
		});
	});

	// The hash `<url>.md` needs has its own route, and appears in no other answer. See
	// spec/architecture/artifacts.md, "A fact appears in exactly one answer".
	it('does not name the markdown hash', async () => {
		expect(await payload(await get('/view/architecture/one?lang=en'))).not.toHaveProperty(
			'markdown',
		);
	});
});

describe('GET /markdown/:slug', () => {
	it('answers for an article and for a standalone page alike', async () => {
		expect(await payload(await get('/markdown/architecture/one'))).toEqual({
			hash: '1'.repeat(32),
		});
		expect(await payload(await get('/markdown/homepage'))).toEqual({ hash: '3'.repeat(32) });
	});

	it('caches a miss for five minutes, without offering it stale', async () => {
		const res = await get('/markdown/made/up');
		expect(res.status).toBe(404);
		expect(res.headers.get('Cache-Control')).toBe('public, max-age=300');
	});
});

describe('GET /home', () => {
	it('lists the locale views newest first, with the homepage page', async () => {
		const res = await get('/home?lang=en');
		expect(res.status).toBe(200);
		const body = await payload<{
			locale: { code: string; language_tag: string };
			page: { objects: { content: string } };
			articles: { slug: string }[];
		}>(res);
		expect(body.locale).toEqual({ code: 'en', language_tag: 'en-US' });
		expect(body.articles.map((article) => article.slug)).toEqual([
			'mirror/two',
			'architecture/one',
		]);
		expect(body.page).toEqual({ objects: { content: 'd'.repeat(32) } });
	});

	// Nothing stands in for a view this locale does not have, here or on /view.
	it('drops an article this locale cannot show, and answers no page at all', async () => {
		const res = await get('/home?lang=ja');
		const body = await payload<{ page: unknown; articles: { slug: string }[] }>(res);
		expect(body.articles.map((article) => article.slug)).toEqual(['architecture/one']);
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
					loc: `${SITE}/architecture/one`,
					lastmod: '2026-01-02T00:00:00.000Z',
					alternates: ROOT.articles[0]?.alternates,
				},
				{
					loc: `${SITE}/ja/architecture/one`,
					lastmod: '2026-01-02T00:00:00.000Z',
					alternates: ROOT.articles[0]?.alternates,
				},
				{ loc: `${SITE}/mirror/two`, lastmod: '2026-02-02T00:00:00.000Z', alternates: [] },
			],
		});
	});
});

describe('the whole-corpus documents', () => {
	it('names the locale feed, and refuses a locale with none', async () => {
		expect(await payload(await get('/feed?lang=en'))).toEqual({ hash: 'e'.repeat(32) });
		expect((await get('/feed?lang=ja')).status).toBe(404);
	});

	it('names llms.txt', async () => {
		expect(await payload(await get('/llms'))).toEqual({ hash: 'f'.repeat(32) });
	});
});

// The asymmetry the design turns on: a failure that is cached for five minutes is a blip that
// became an outage, so it is the one answer here that is never stored.
describe('a root that cannot be read', () => {
	it('fails rather than reporting an empty corpus, and is not cached', async () => {
		const res = await get('/home?lang=en', {
			fetch: async () => new Response('nope', { status: 404 }),
		});
		expect(res.status).toBe(500);
		expect(res.headers.get('Cache-Control')).toBe('no-store');
	});

	it('fails on a root it cannot parse', async () => {
		const stale = { ...ROOT, version: 0 };
		const res = await get('/llms', { fetch: async () => new Response(JSON.stringify(stale)) });
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

async function get(path: string, store?: { fetch: () => Promise<Response> }): Promise<Response> {
	const bindings = {
		ASSETS: (store ?? {
			fetch: async () => new Response(JSON.stringify(ROOT)),
		}) as unknown as Bindings['ASSETS'],
		DATABASE: database as unknown as Bindings['DATABASE'],
	} as Bindings;
	return app.fetch(new Request(`${URLS.apps.production.api}${path}`), bindings);
}
