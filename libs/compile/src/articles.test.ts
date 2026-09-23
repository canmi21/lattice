import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { URLS } from '@canmi/urls';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildArticles, summaryFor, translatedRaws } from './articles';
import { sourceFingerprint, type SegmentSpan } from './assemble';
import { articleFrontmatter } from './compile';

const ROOT = new URL('../../../', import.meta.url);

/** The real corpus, which is what both suites below are about. */
function paths() {
	return {
		contents: fileURLToPath(new URL('contents', ROOT)),
		messages: fileURLToPath(new URL('apps/site/messages', ROOT)),
		cdnUrl: URLS.apps.production.cdn,
		assets: fileURLToPath(new URL('data/record/metadata.json', ROOT)),
		media: fileURLToPath(new URL('data/record/media.yaml', ROOT)),
		diagrams: fileURLToPath(new URL('data/record/diagram.json', ROOT)),
		segments: fileURLToPath(new URL('data/build/segments.json', ROOT)),
		routes: fileURLToPath(new URL('apps/site/src/routes', ROOT)),
		crates: fileURLToPath(new URL('data/build/crates.json', ROOT)),
		repos: fileURLToPath(new URL('data/build/repos.json', ROOT)),
		tweets: fileURLToPath(new URL('data/build/twitter.json', ROOT)),
	};
}

/**
 * Whether the corpus has been through `local migrate`, which everything compiling it needs.
 *
 * A build reads resources, and the manifest holds them only once the ids have been granted; for
 * the length of one migration round there is nothing here to compile. Standing down is the
 * honest answer and not a gap: that the manifest is readable at all is asserted in
 * ./assets.test.ts, where this same file is held to the schemas rather than skipped.
 */
const MIGRATED = Object.values(
	(JSON.parse(readFileSync(paths().assets, 'utf8')) as { media: Record<string, object> }).media,
).every((record) => 'layers' in record);

/**
 * One build of the real corpus, shared by everything below that needs the published set.
 *
 * Compiling every article is the expensive part of this file and was being paid three times.
 * The one remaining second build cannot be shared, because its whole point is the other policy.
 *
 * `beforeAll` carries its own timeout because the default is five seconds and this is a real
 * compile of the whole corpus -- it fits alone and does not fit beside a Rust build, which is
 * exactly what `mise run verify` runs it beside.
 */
let withDrafts: Awaited<ReturnType<typeof buildArticles>>;

beforeAll(async () => {
	if (MIGRATED) withDrafts = await buildArticles(paths(), { drafts: true });
}, 60_000);

describe.skipIf(!MIGRATED)('article widget build inputs', () => {
	it('watches embed records and compiles every widget in the real article', async () => {
		const { crates, repos, tweets } = paths();
		const { articles, files } = withDrafts;

		expect(files).toEqual(expect.arrayContaining([crates, repos, tweets]));
		const article = articles.find(
			(candidate) => candidate.path === 'development/rust-cargo-cranelift-tuning',
		);
		expect(article).toBeDefined();
		if (!article) throw new Error('missing rust-cargo-cranelift-tuning');
		for (const view of Object.values(article.views)) {
			// The initial document needs the ToC before browser-side heading measurement can run.
			expect(view.toc).toEqual(
				view.blocks.flatMap((block) =>
					block.type === 'heading'
						? [{ slug: block.slug, text: block.text, depth: block.depth }]
						: [],
				),
			);
			expect(view.blocks.filter(({ type }) => type === 'tokei')).toHaveLength(1);
			expect(view.blocks.filter(({ type }) => type === 'github')).toHaveLength(1);
			expect(view.blocks.filter(({ type }) => type === 'cargo')).toHaveLength(2);
			// Which provider answered is a fact about the last run, not about the build: regenerating
			// the summaries with another runner must not fail this test. That a view carries a
			// summary with provenance at all is the invariant.
			expect(view.summary?.provider).toEqual(expect.any(String));
			expect(view.summary?.provider).not.toEqual('');
		}
		expect(files).toContain(
			fileURLToPath(new URL('contents/development/rust-cargo-cranelift-tuning.summary.yaml', ROOT)),
		);

		const friends = articles.find(
			(candidate) => candidate.path === 'mirror/friends-come-in-phases',
		);
		expect(friends?.blocks).toContainEqual(
			expect.objectContaining({
				type: 'twitter',
				tweet: expect.objectContaining({ id: '2088060180290302397' }),
			}),
		);
	});
});

it('falls back the whole view when any live body translation is missing', () => {
	const raw = '---\ntitle: Source\nlang: en\n---\n\nFirst paragraph.\n\nSecond paragraph.\n';
	const encoder = new TextEncoder();
	const span = (id: string, source: string): SegmentSpan => {
		const start = raw.indexOf(source);
		return {
			id,
			start: encoder.encode(raw.slice(0, start)).length,
			end: encoder.encode(raw.slice(0, start + source.length)).length,
			fingerprint: sourceFingerprint(encoder.encode(source)),
			region: 'body',
		};
	};
	const spans = [span('first', 'First paragraph.'), span('second', 'Second paragraph.')];
	const result = translatedRaws(
		'contents/example.md',
		'example.md',
		raw,
		{
			segments: {
				first: {
					'de-DE': { text: 'Erster Absatz.' },
					'en-US': { text: 'First translated.' },
				},
				second: { 'en-US': { text: 'Second translated.' } },
			},
		},
		{ version: 3, articles: { 'example.md': spans }, words: {} },
	);

	expect(result.translation_available.de).toBe(false);
	expect(result.raws.de).toBe(raw);
	expect(result.translatable.de).toBe(result.translatable.mw);
	expect(result.translation_available.en).toBe(true);
	expect(result.raws.en).toContain('First translated.\n\nSecond translated.');
});

it('falls back a missing localized summary to English and then to no summary', () => {
	const english = { text: 'English summary', provider: 'openai' };
	const german = { text: 'Deutsche Zusammenfassung', provider: 'openai' };

	expect(summaryFor({ 'en-US': english, 'de-DE': german }, 'de-DE')).toBe(german);
	expect(summaryFor({ 'en-US': english }, 'de-DE')).toBe(english);
	expect(summaryFor({}, 'de-DE')).toBeUndefined();
});

describe.skipIf(!MIGRATED)('drafts', () => {
	it('keeps a draft out of a production build and in every other one', async () => {
		const withoutDrafts = await buildArticles(paths(), { drafts: false });

		const drafted = withDrafts.articles.filter((article) => article.meta.draft === true);
		// An assertion about the corpus, not about a fixture: it is what makes the next two mean
		// anything, and a corpus with no draft left in it should retire this suite rather than
		// let it pass by having nothing to find.
		expect(drafted.length).toBeGreaterThan(0);

		const withheld = new Set(drafted.map((article) => article.path));
		const published = withoutDrafts.articles.map((article) => article.path);
		expect(published.filter((path) => withheld.has(path))).toEqual([]);
		// Everything else survives, so the filter is the draft flag and not the build shape.
		expect(published).toEqual(
			withDrafts.articles.map((article) => article.path).filter((path) => !withheld.has(path)),
		);
		expect(withoutDrafts.articles.every((article) => article.meta.draft !== true)).toBe(true);
	}, 60_000);

	// The bug this covers: the site tested `=== true` while `local document::is_draft` accepted the
	// quoted spelling, so `draft: "true"` was a draft to the CMS and a published page here --
	// the one direction the flag exists to prevent. Read against the frontmatter reader rather
	// than the corpus, because the corpus has no article written that way and should not gain one
	// to hold a test up. See spec/drafts.md.
	it.each(['true', '"true"', "'true'", '" true "'])('withholds an article written %s', (flag) => {
		const raw = `---\nlang: en-US\ntitle: A\ndraft: ${flag}\n---\n\nBody.\n`;
		expect(articleFrontmatter(raw, 'test.md').draft).toBe(true);
	});

	it.each(['false', '"false"', '"yes"'])('publishes an article written %s', (flag) => {
		const raw = `---\nlang: en-US\ntitle: A\ndraft: ${flag}\n---\n\nBody.\n`;
		expect(articleFrontmatter(raw, 'test.md').draft).toBe(false);
	});
});
