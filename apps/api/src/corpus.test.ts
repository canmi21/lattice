import { URLS } from '@canmi/urls';
import { beforeEach, describe, expect, it } from 'vitest';
import app from './app';
import type { Bindings } from './bindings';
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

function view(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		content: '0'.repeat(32),
		title: 'Title',
		subtitle: 'Subtitle',
		description: 'Description',
		shortTitle: 'Short',
		shortSubtitle: 'Shorter',
		created: '2026-01-01T00:00:00.000Z',
		lastmod: '2026-01-02T00:00:00.000Z',
		languageTag: 'en-US',
		canonical: `${SITE}/architecture/one`,
		translationAvailable: true,
		words: 900,
		paragraphs: ['The opening.'],
		...overrides,
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
			alternates: [{ code: 'ja', languageTag: 'ja-JP', href: `${SITE}/ja/architecture/one` }],
			canonicalUrls: [`${SITE}/architecture/one`, `${SITE}/ja/architecture/one`],
			views: {
				mw: view({ content: 'a'.repeat(32) }),
				en: view({ content: 'b'.repeat(32) }),
				ja: view({ content: 'c'.repeat(32), languageTag: 'ja-JP' }),
			},
		},
		{
			path: 'mirror/two',
			url: `${SITE}/mirror/two`,
			markdown: '2'.repeat(32),
			alternates: [],
			canonicalUrls: [`${SITE}/mirror/two`],
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

beforeEach(() => {
	forgetRoot();
});

describe('GET /view/:locale/:slug', () => {
	it('answers with the view, its hashes and five minutes', async () => {
		const res = await get('/view/en/architecture/one');
		expect(res.status).toBe(200);
		expect(res.headers.get('Cache-Control')).toBe('public, max-age=300, stale-if-error=10800');
		expect(await payload(res)).toMatchObject({
			slug: 'architecture/one',
			locale: 'en',
			content: 'b'.repeat(32),
			title: 'Title',
			paragraphs: ['The opening.'],
		});
	});

	// Five minutes on a miss too, but no `stale-if-error`: a 404 is not an error worth serving
	// stale. See spec/architecture/artifacts.md.
	it('caches a miss as long as an answer, without offering it stale', async () => {
		const unknown = await get('/view/en/made/up');
		expect(unknown.status).toBe(404);
		expect(unknown.headers.get('Cache-Control')).toBe('public, max-age=300');

		const untranslated = await get('/view/ja/mirror/two');
		expect(untranslated.status).toBe(404);
	});

	it('refuses a locale it does not know rather than falling back to one it does', async () => {
		const res = await get('/view/xx/architecture/one');
		expect(res.status).toBe(400);
	});

	// The hash `<url>.md` needs has its own route, and appears in no other answer. See
	// spec/architecture/artifacts.md, "A fact appears in exactly one answer".
	it('does not name the markdown hash', async () => {
		expect(await payload(await get('/view/en/architecture/one'))).not.toHaveProperty('markdown');
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

describe('GET /home/:locale', () => {
	it('lists the locale views newest first, with the homepage page', async () => {
		const res = await get('/home/en');
		expect(res.status).toBe(200);
		const body = await payload<{
			page: { content: string };
			articles: { path: string; content: string }[];
		}>(res);
		expect(body.articles.map((article) => article.path)).toEqual([
			'mirror/two',
			'architecture/one',
		]);
		expect(body.page).toEqual({ content: 'd'.repeat(32) });
	});

	// Nothing stands in for a view this locale does not have, here or on /view.
	it('drops an article this locale cannot show, and answers no page at all', async () => {
		const res = await get('/home/ja');
		const body = await payload<{ page: unknown; articles: { path: string }[] }>(res);
		expect(body.articles.map((article) => article.path)).toEqual(['architecture/one']);
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
		expect(await payload(await get('/feed/en'))).toEqual({ hash: 'e'.repeat(32) });
		expect((await get('/feed/ja')).status).toBe(404);
	});

	it('names llms.txt', async () => {
		expect(await payload(await get('/llms'))).toEqual({ hash: 'f'.repeat(32) });
	});
});

// The asymmetry the design turns on: a failure that is cached for five minutes is a blip that
// became an outage, so it is the one answer here that is never stored.
describe('a root that cannot be read', () => {
	it('fails rather than reporting an empty corpus, and is not cached', async () => {
		const res = await get('/home/en', { fetch: async () => new Response('nope', { status: 404 }) });
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

async function get(path: string, store?: { fetch: () => Promise<Response> }): Promise<Response> {
	const bindings = {
		ASSETS: (store ?? {
			fetch: async () => new Response(JSON.stringify(ROOT)),
		}) as unknown as Bindings['ASSETS'],
	} as Bindings;
	return app.fetch(new Request(`${URLS.apps.production.api}${path}`), bindings);
}
