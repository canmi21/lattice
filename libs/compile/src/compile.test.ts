import { URLS } from '@canmi/urls';
import { expect, it } from 'vitest';
import { articleFrontmatter, compile } from './compile';
import { feedOf } from './compile.harness.ts';

it('rejects malformed source lang metadata with the article file named', async () => {
	const raw = '---\ntitle: Test\nlang: zh_CN\n---\n\nBody.\n';
	await expect(
		compile(raw, '/article', {
			newTabNote: 'opens in new tab',
			resolveAsset: () => null,
			highlight: async () => '',
			sourceFile: 'contents/bad-language.md',
		}),
	).rejects.toThrow('contents/bad-language.md: invalid BCP-47 lang frontmatter "zh_CN"');
});

it('draws an ::article card from the target article rather than from the directive', async () => {
	const compiled = await compile(
		'---\ntitle: Test\nlang: en-US\n---\n\n::article{path=architecture/compile-time-rendering}\n',
		'/article',
		{
			newTabNote: 'opens in new tab',
			resolveAsset: () => null,
			articles: {
				'architecture/compile-time-rendering': {
					title: 'Rendering as a Protocol',
					subtitle: 'UI should be described, not executed.',
					published: '2026-04-13T19:18:28.488Z',
					short_title: 'Rendering as a Protocol',
					short_subtitle: 'Described, not executed.',
				},
			},
			highlight: async () => '',
			sourceFile: 'contents/example.md',
		},
	);

	expect(compiled.blocks[0]).toEqual({
		type: 'article',
		path: 'architecture/compile-time-rendering',
		title: 'Rendering as a Protocol',
		subtitle: 'UI should be described, not executed.',
		published: '2026-04-13T19:18:28.488Z',
		// The card is the homepage's row, so it carries what that row needs on a phone too.
		short_title: 'Rendering as a Protocol',
		short_subtitle: 'Described, not executed.',
	});
	// The feed and /llms.txt targets name the article too; neither runs a layout, so a card
	// there is a link that says what it points at.
	//
	// Both spell out the view, `mw` included. Neither will negotiate on a reader's behalf, and a
	// bare address would be resolved against whatever language their cookie happens to hold --
	// which for a card that just showed them a Japanese title is the wrong answer. The page links
	// the bare address instead, because its router carries the view across the navigation.
	expect(feedOf(compiled)).toContain('>Rendering as a Protocol</a>');
	expect(feedOf(compiled)).toContain(
		`<a href="${URLS.apps.production.site}/architecture/compile-time-rendering?lang=mw">`,
	);
	expect(compiled.markdown).toContain(
		`[Rendering as a Protocol](${URLS.apps.production.site}/architecture/compile-time-rendering?lang=mw)`,
	);
});

/**
 * Every internal link in a feed or a `.md` document names a view, because neither has a router to
 * carry one. A page links the bare address instead: its navigation keeps the view it was in, so
 * writing the language into the markup would only be a second copy of it. See
 * spec/locale/views.md.
 */
it('names the view on an internal link, and leaves a fragment and an outside address alone', async () => {
	const site = URLS.apps.production.site;
	const compiled = await compile(
		[
			'---',
			'title: Test',
			'lang: en-US',
			'---',
			'',
			`Here is [one](${site}/architecture/one#section), [another](/mirror/two) and`,
			'[somewhere else](https://example.com/page).',
			'',
		].join('\n'),
		'/article',
		{ newTabNote: 'opens in new tab', resolveAsset: () => null, highlight: async () => '' },
	);

	const feed = feedOf(compiled);
	// The query goes before the fragment, which is the only order a browser reads.
	expect(feed).toContain(`href="${site}/architecture/one?lang=mw#section"`);
	expect(feed).toContain('href="/mirror/two?lang=mw"');
	// Not ours to annotate, and rewriting it would change where a reader lands.
	expect(feed).toContain('href="https://example.com/page"');

	expect(compiled.markdown).toContain(`${site}/architecture/one?lang=mw#section`);
	expect(compiled.markdown).toContain('https://example.com/page');
});

it('fails the build when an ::article path names no article', async () => {
	await expect(
		compile(
			'---\ntitle: Test\nlang: en-US\n---\n\n::article{path=architecture/typo}\n',
			'/article',
			{
				newTabNote: 'opens in new tab',
				resolveAsset: () => null,
				articles: {},
				highlight: async () => '',
				sourceFile: 'contents/example.md',
			},
		),
	).rejects.toThrow(
		'contents/example.md: ::article path "architecture/typo" does not name an article',
	);
});

it('reads a folded frontmatter title whole, as the card that shows it needs', () => {
	const meta = articleFrontmatter(
		'---\ntitle: >-\n  A title that was\n  written across two lines\nlang: en-US\n---\n\nBody.\n',
		'contents/example.md',
	);

	expect(meta.title).toBe('A title that was written across two lines');
});

it('crops a link card cover like ::image, defaults and overrides alike', async () => {
	const source = [
		'---',
		'title: Test',
		'lang: en-US',
		'---',
		'',
		'::linkcard{src="a.avif" url="https://example.com" title="Plain"}',
		'',
		'::linkcard{src="b.avif" url="https://example.com" title="Tall" ratio="4:5" align="top"}',
		'',
	].join('\n');
	const compiled = await compile(source, '/article', {
		newTabNote: 'opens in new tab',
		resolveAsset: () => null,
		highlight: async () => '',
	});

	const cards = compiled.blocks.filter((block) => block.type === 'linkcard');
	expect(cards).toHaveLength(2);
	// A cover the author said nothing about takes the shared default, so a column of cards is
	// one shape rather than one per screenshot.
	expect(cards[0]).toMatchObject({ crop: '16 / 9' });
	expect(cards[0]?.type === 'linkcard' && cards[0].align).toBeUndefined();
	expect(cards[1]).toMatchObject({ crop: '4 / 5', align: 'top' });
});

/**
 * A reference nothing answers for fails the compile rather than becoming a URL.
 *
 * It used to become the authored reference under the CDN's origin, which is a guaranteed 404 and
 * reads as a working link wherever it is inspected -- in a feed most of all, where nobody looks.
 * That fallback is also how a base ending in `/image/` was once joined to another, so this
 * replaces the test that guarded the join: there is no join left to get wrong.
 */
it('refuses an image reference nothing resolves, rather than addressing it anyway', async () => {
	await expect(
		compile('---\ntitle: Test\nlang: en-US\n---\n\n::image{src="a.avif" alt="A"}\n', '/article', {
			newTabNote: 'opens in new tab',
			resolveAsset: () => null,
			highlight: async () => '',
		}),
	).rejects.toThrow(/"a\.avif" names no published asset/);
});

/**
 * Only renditions are published; the id an author writes names the original, which the bucket
 * never receives. The page survived that because the resolver rewrites its `src` and `srcset`,
 * and the feed and the markdown did not -- every image in both was a 404. So both targets name
 * what the resolver found, and a reference it did not find fails the compile.
 */
it('names the published rendition in the markdown and the rid in the feed, never the authored id', async () => {
	const resolved = {
		resource: 'k7m2x',
		src: 'https://cdn.example/object/rendition.avif',
		srcset: 'https://cdn.example/object/rendition.avif 640w',
		width: 100,
		height: 100,
		ratio: '1:1',
	};
	const compiled = await compile(
		'---\ntitle: Test\nlang: en-US\n---\n\n::image{src="original.avif" alt="A"}\n\n![B](original.avif)\n',
		'/article',
		{
			newTabNote: 'opens in new tab',
			resolveAsset: () => resolved,
			highlight: async () => '',
		},
	);

	// Two documents and two answers, because they can follow different things. The markdown
	// target is read by something that will not run a layout and cannot resolve anything, so it
	// gets the rendition the build found; a feed names the rid and lets the alias layer say what
	// that currently means, which is the address that survives a re-encode.
	expect(compiled.markdown).not.toContain('original.avif');
	expect(compiled.markdown.match(/rendition\.avif/g)).toHaveLength(2);
	const feed = feedOf(compiled);
	expect(feed).not.toContain('original.avif');
	expect(feed).not.toContain('rendition.avif');
	expect(feed.match(/ill\.li\/k7m2x/g)).toHaveLength(2);
});

/**
 * The block a picture compiles to, which is the rid and what the article itself decided.
 *
 * Everything else about a picture moves when it is encoded again, on nobody's schedule but the
 * corpus's -- so carrying it here is what made a re-encode republish every article naming it.
 * See spec/architecture/resource.md, "A rid is resolved three times".
 */
it('compiles a picture to its rid and nothing derived from what that resource holds', async () => {
	const compiled = await compile(
		'---\ntitle: Test\nlang: en-US\n---\n\n::image{src="original.avif" alt="A" ratio="16:9"}\n',
		'/article',
		{
			newTabNote: 'opens in new tab',
			resolveAsset: () => ({
				resource: 'k7m2x',
				src: 'https://cdn.example/object/rendition.avif',
				srcset: 'https://cdn.example/object/rendition.avif 640w',
				width: 100,
				height: 100,
				ratio: '1:1',
				placeholder: 'data:image/webp;base64,PLACEHOLDER',
			}),
			highlight: async () => '',
		},
	);

	const picture = compiled.blocks.find((block) => block.type === 'image');
	expect(picture).toEqual({
		type: 'image',
		resources: { picture: 'k7m2x' },
		alt: 'A',
		crop: '16 / 9',
		align: undefined,
	});
	// The ladder, the placeholder and the box, none of which a compiled article may carry.
	const written = JSON.stringify(picture);
	expect(written).not.toContain('rendition.avif');
	expect(written).not.toContain('PLACEHOLDER');
	expect(written).not.toContain('100');
});

it('names ::linkcard, not ::image, when a card ratio is malformed', async () => {
	await expect(
		compile(
			'---\ntitle: Test\nlang: en-US\n---\n\n::linkcard{src="a.avif" url="https://example.com" title="T" ratio="wide"}\n',
			'/article',
			{ newTabNote: 'opens in new tab', resolveAsset: () => null, highlight: async () => '' },
		),
	).rejects.toThrow('::linkcard ratio must be W:H with positive numbers');
});

/**
 * A drawing is invisible to everything but a pair of eyes until it is described.
 *
 * Four consumers read the description and none of them can read the fence: the block hands it to
 * the control as an accessible description, the feed says it in place of the article's own title,
 * the plain text carries it into the search index, and the Markdown target takes it for an SVG
 * canvas. A Mermaid fence keeps its source in Markdown, because that one a reader can render.
 */
it('carries a diagram description into the block, the feed and the search text', async () => {
	const svg = '<svg viewBox="0 0 10 10"></svg>';
	const mermaid = 'graph TD\nA-->B';
	// Keyed by the block's whole source, which is what the resolver is handed: a fence could have
	// been found by its payload and a directive could not, so both are found the same way.
	const described: Record<string, string> = {
		['```svg-canvas\n' + svg + '\n```']: 'A pipeline from source to binary.',
		['```mermaid\n' + mermaid + '\n```']: 'A goes to B.',
		[':::quadrant{title="Fit" left="Niche" right="Broad" top="Compiler" bottom="Runtime"}\n' +
		'::quadrant-item{title="One" at="top-left"}\n' +
		':::']: 'One sits in the niche compiler region.',
	};
	const compiled = await compile(
		'---\ntitle: Test\nlang: en-US\n---\n\n' +
			'```svg-canvas\n' +
			svg +
			'\n```\n\n```mermaid\n' +
			mermaid +
			'\n```\n\n' +
			':::quadrant{title="Fit" left="Niche" right="Broad" top="Compiler" bottom="Runtime"}\n' +
			'::quadrant-item{title="One" at="top-left"}\n' +
			':::\n',
		'/article',
		{
			newTabNote: 'opens in new tab',
			resolveAsset: () => null,
			describeDiagram: (source) => described[source],
			highlight: async () => '',
			sourceFile: 'contents/example.md',
		},
	);

	const canvas = compiled.blocks.find((block) => block.type === 'svgCanvas');
	const graph = compiled.blocks.find((block) => block.type === 'mermaid');
	const matrix = compiled.blocks.find((block) => block.type === 'quadrant');
	expect(canvas?.description).toBe('A pipeline from source to binary.');
	expect(graph?.description).toBe('A goes to B.');
	// A quadrant keeps `description` for the author's own line and takes the derived one as its
	// reading, which is the part a screen reader is given.
	expect(matrix?.reading).toBe('One sits in the niche compiler region.');

	expect(feedOf(compiled)).toContain(
		'[Diagram: A pipeline from source to binary. — view at /article]',
	);
	expect(feedOf(compiled)).toContain('[Diagram: A goes to B. — view at /article]');
	expect(feedOf(compiled)).not.toContain('language-mermaid');
	expect(compiled.markdown).toContain('> [diagram: A pipeline from source to binary. — /article]');
	// The one target that keeps the source, because it is the one that can draw it.
	expect(compiled.markdown).toContain('```mermaid\n' + mermaid + '\n```');
	expect(compiled.text).toContain('A pipeline from source to binary.');
	expect(compiled.text).toContain('A goes to B.');
});

/** Nothing described yet is the ordinary state, and every consumer falls back to what it said. */
it('leaves an undescribed diagram saying exactly what it said before', async () => {
	const compiled = await compile(
		'---\ntitle: Test\nlang: en-US\n---\n\n```svg-canvas\n<svg viewBox="0 0 10 10"></svg>\n```\n',
		'/article',
		{
			newTabNote: 'opens in new tab',
			resolveAsset: () => null,
			highlight: async () => '',
			sourceFile: 'contents/example.md',
		},
	);
	const canvas = compiled.blocks.find((block) => block.type === 'svgCanvas');
	expect(canvas?.description).toBeUndefined();
	expect(feedOf(compiled)).toContain('[Diagram: Test — view at /article]');
});

/**
 * `::video` names an asset the way `::image` does, and the block carries what the resolver found.
 *
 * The reference keeps its extension into the block on purpose: an article can name a clip nothing
 * has imported yet, and the component addresses the CDN with it rather than the page failing to
 * build. That is the same bargain a picture strikes.
 */
it('resolves ::video by the same reference an image uses, and survives one that resolves to nothing', async () => {
	const source = [
		'---',
		'title: Test',
		'lang: en-US',
		'---',
		'',
		'::video{src="clip.mp4"}',
		'',
		'::video{src="missing.mp4"}',
		'',
	].join('\n');
	const compiled = await compile(source, '/article', {
		newTabNote: 'opens in new tab',
		resolveAsset: () => null,
		resolveVideo: (reference) =>
			reference === 'clip.mp4'
				? {
						rungs: [
							{
								src: 'https://cdn.example/object/a.mp4',
								type: 'video/mp4; codecs="av01.0.05M.08"',
								width: 1920,
								height: 1080,
							},
						],
						width: 1920,
						height: 1080,
						poster: 'https://cdn.example/object/p.avif',
						captions: [],
						description: 'A hand turns the machine over.',
						gain: 1,
					}
				: null,
		highlight: async () => '',
	});

	const clips = compiled.blocks.filter((block) => block.type === 'video');
	expect(clips).toHaveLength(2);
	expect(clips[0]).toMatchObject({
		src: 'clip.mp4',
		poster: 'https://cdn.example/object/p.avif',
		description: 'A hand turns the machine over.',
	});
	expect(clips[1]).toEqual({ type: 'video', src: 'missing.mp4' });

	// Neither target can play anything, so both name the poster and say where the clip is. The
	// clip's own description is the poster's text there -- it is the only sentence either target
	// has about what is in the frame.
	expect(feedOf(compiled)).toContain('<img src="https://cdn.example/object/p.avif"');
	expect(feedOf(compiled)).toContain('watch at /article');
	expect(compiled.markdown).toContain('> [video — /article]');
	expect(compiled.text).toContain('A hand turns the machine over.');
});

it('refuses a ::video that names nothing', async () => {
	await expect(
		compile('---\ntitle: Test\nlang: en-US\n---\n\n::video\n', '/article', {
			newTabNote: 'opens in new tab',
			resolveAsset: () => null,
			highlight: async () => '',
		}),
	).rejects.toThrow('video requires a non-empty src attribute');
});

/**
 * A link card compiles to the rid of the site's mark, and never to an address for it.
 *
 * What the resource holds changes on somebody else's schedule, so baking it here would mean
 * republishing every article naming that site the day they redraw it. See
 * spec/architecture/resource.md, "A rid is resolved three times".
 */
it('turns a link card url into the rid of that site mark, keeping the tone unresolved', async () => {
	const source = [
		'---',
		'title: Test',
		'lang: en-US',
		'---',
		'',
		'::linkcard{src="a.avif" url="https://Example.com/deep/page" title="One" tone="dark"}',
		'',
		'::linkcard{src="b.avif" url="https://nobody.example" title="Two"}',
		'',
	].join('\n');
	const asked: string[] = [];
	const compiled = await compile(source, '/article', {
		newTabNote: 'opens in new tab',
		resolveAsset: () => null,
		resolveIcon: (url) => {
			asked.push(url);
			return new URL(url).hostname.toLowerCase() === 'example.com' ? 'k7m2x' : undefined;
		},
		highlight: async () => '',
	});

	const cards = compiled.blocks.filter((block) => block.type === 'linkcard');
	// The whole URL is handed over, not a hostname this side extracted: which resource a card
	// means is the library's question, and two spellings of that lookup would eventually differ.
	expect(asked).toEqual(['https://Example.com/deep/page', 'https://nobody.example']);
	expect(cards[0]).toMatchObject({ resources: { icon: 'k7m2x' }, tone: 'dark' });
	// Nothing collected for a site is an ordinary state, and the card still compiles.
	expect(cards[1]?.type === 'linkcard' && cards[1].resources).toBeUndefined();
	// No address anywhere in the block: a hostname or a cid here would be the baked resolution.
	expect(JSON.stringify(cards[0])).not.toContain('example.com/favicon');
});
