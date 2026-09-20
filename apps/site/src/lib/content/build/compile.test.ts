import { feedHtml } from '@canmi/artifacts';
import type { Compiled } from '@canmi/artifacts/types';
import { URLS } from '@canmi/urls';
import { expect, it } from 'vitest';
import { articleFrontmatter, compile, compilePage } from './compile';

/**
 * What a feed makes of this article, which the compiler no longer produces beside it.
 *
 * The feed is a projection of the blocks and is rendered where the view's locale is known, so
 * these assertions call the same function the Worker does rather than reading a second field the
 * compiler kept in step by hand. See libs/artifacts, `feedHtml`.
 */
function feedOf(compiled: Pick<Compiled, 'blocks'>): string {
	return feedHtml(compiled.blocks, {
		site: URLS.apps.production.site,
		resources: `${URLS.apps.production.alias}/`,
		url: '/article',
		locale: 'mw',
	});
}

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

it('keeps an email link working when its visible label is translated', () => {
	const page = compilePage(
		'---\ntitle: Test\n---\n\n:link[メール]{to=t@ffoni.com}\n',
		'opens in new tab',
	);
	const paragraph = page.blocks[0];
	if (paragraph?.type !== 'p') throw new Error('expected a paragraph');

	expect(paragraph.segments).toContainEqual({
		type: 'link',
		icon: 'email',
		href: 'mailto:t@ffoni.com',
		label: 'メール',
		new_tab: false,
	});
});

it('renders a translator note as an explicit control instead of a native tooltip', async () => {
	const compiled = await compile(
		'---\ntitle: Test\nlang: en-US\n---\n\nA :tn[local phrase]{is="Its meaning needs context."}.\n',
		'/article',
		{
			newTabNote: 'opens in new tab',
			resolveAsset: () => null,
			highlight: async () => '',
			sourceFile: 'contents/example.md',
		},
	);
	const prose = compiled.blocks[0];
	if (prose?.type !== 'prose') throw new Error('expected prose');

	expect(prose.html).toContain('<button type="button" class="tn-trigger focus-link"');
	expect(prose.html).toContain('data-tn-note="Its meaning needs context."');
	expect(prose.html).toContain('aria-controls="translator-note" aria-expanded="false"');
	expect(prose.html).toContain(
		'<svg class="tn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"',
	);
	expect(prose.html).toContain('<circle cx="12" cy="12" r="10"></circle>');
	expect(prose.html).toContain('<path d="M12 16v-4"></path>');
	expect(prose.html).not.toContain('title=');
});

it('wraps the noted words so the walk back has something to light', async () => {
	const compiled = await compile(
		'---\ntitle: Test\nlang: en-US\n---\n\nThe :fn[model]{is="Execution, not data."} matters.\n',
		'/article',
		{
			newTabNote: 'opens in new tab',
			resolveAsset: () => null,
			highlight: async () => '',
			sourceFile: 'contents/example.md',
		},
	);
	const prose = compiled.blocks[0];
	if (prose?.type !== 'prose') throw new Error('expected prose');
	expect(prose.html).toContain('<span class="note-words">model</span><sup class="note-marker">');
});

it('fogs a spoiler visually while leaving its words real in both targets', async () => {
	const compiled = await compile(
		'---\ntitle: Test\nlang: en-US\n---\n\nThe ending is :spoiler[nobody wins] after all.\n',
		'/article',
		{
			newTabNote: 'opens in new tab',
			resolveAsset: () => null,
			highlight: async () => '',
			sourceFile: 'contents/example.md',
		},
	);
	const prose = compiled.blocks[0];
	if (prose?.type !== 'prose') throw new Error('expected prose');

	// The fog is CSS; the compiled output only names the class and makes the span reachable
	// without a pointer. The words stay ordinary text inside it.
	expect(prose.html).toContain('<span class="spoiler focus-link" tabindex="0">nobody wins</span>');
	// The markdown target lifts the fog rather than spelling it: its readers are models.
	expect(compiled.markdown).toContain('The ending is nobody wins after all.');
	expect(compiled.markdown).not.toContain('spoiler');
});

it('marks prose links with the shared keyboard focus treatment', async () => {
	const compiled = await compile(
		'---\ntitle: Test\nlang: en-US\n---\n\nRead [the notes](https://example.com).\n',
		'/article',
		{
			newTabNote: 'opens in new tab',
			resolveAsset: () => null,
			highlight: async () => '',
			sourceFile: 'contents/example.md',
		},
	);
	const prose = compiled.blocks[0];
	if (prose?.type !== 'prose') throw new Error('expected prose');

	expect(prose.html).toContain(
		'<a href="https://example.com" class="focus-link spring-underline article-link">',
	);
});

it('rejects translator notes in translated frontmatter with the article named', async () => {
	const raw = '---\ntitle: ":tn[Translated title]{is=\\"a gloss\\"}"\nlang: en-US\n---\n\nBody.\n';
	await expect(
		compile(raw, '/article', {
			newTabNote: 'opens in new tab',
			resolveAsset: () => null,
			highlight: async () => '',
			sourceFile: 'contents/bad-title.md',
		}),
	).rejects.toThrow(
		"contents/bad-title.md: translator's notes are not allowed in frontmatter title",
	);
});

it('compiles repository, crate, and tokei presentation controls into live widgets', async () => {
	const raw = `---
title: Test
lang: en-US
---

\`\`\`tokei title="Language statistics" view="bar"
 Language  Files  Lines  Code  Comments  Blanks
 Rust      1      10     8     1         1
\`\`\`

::github{repo="canmi21/seam" ref="abc123" title="Seam" align="right"}

::cargo{crate="seam-cli" view="table"}

::twitter{tweet="2088060180290302397"}
`;
	const compiled = await compile(raw, '/article', {
		newTabNote: 'opens in new tab',
		resolveAsset: () => null,
		highlight: async () => '',
		sourceFile: 'contents/widgets.md',
		embeds: {
			repos: {
				'canmi21/seam': {
					full_name: 'canmi21/seam',
					description: 'A repository.',
					language: 'Rust',
					stars: 1,
					forks: 2,
					open_issues: 3,
					license: 'MIT',
					pushed_at: '2026-01-01T00:00:00Z',
				},
			},
			crates: {
				'seam-cli': {
					name: 'seam-cli',
					version: '1.0.0',
					rust_version: null,
					features: {},
					deps: [],
					total_dep_size: 0,
				},
			},
			tweets: {
				'2088060180290302397': {
					id: '2088060180290302397',
					author: 'canmi21',
					text: 'A tweet.',
					created: '2026-08-14T00:28:35Z',
					likes: 24,
					reposts: 0,
					replies: 4,
				},
			},
		},
	});

	expect(compiled.blocks).toEqual(
		expect.arrayContaining([
			expect.objectContaining({ type: 'tokei', title: 'Language statistics', view: 'bar' }),
			expect.objectContaining({
				type: 'github',
				git_ref: 'abc123',
				title: 'Seam',
				align: 'right',
			}),
			expect.objectContaining({ type: 'cargo', view: 'table' }),
			expect.objectContaining({
				type: 'twitter',
				tweet: expect.objectContaining({ id: '2088060180290302397' }),
			}),
		]),
	);
});

it('routes a Mermaid fence to the client renderer without highlighting it', async () => {
	const source = `quadrantChart
  accTitle: Compiler trade-offs
  accDescr: A conceptual comparison of compiler visibility and ecosystem maturity.
  Svelte: [0.82, 0.84]`;
	const compiled = await compile(
		`---\ntitle: Test\nlang: en-US\n---\n\n\`\`\`Mermaid ratio="2.77366"\n${source}\n\`\`\`\n`,
		'/article',
		{
			newTabNote: 'opens in new tab',
			resolveAsset: () => null,
			highlight: async () => {
				throw new Error('Mermaid source must not reach Shiki');
			},
			sourceFile: 'contents/diagram.md',
		},
	);

	expect(compiled.blocks).toContainEqual({ type: 'mermaid', source, ratio: 2.77366 });
	expect(feedOf(compiled)).toContain('<code class="language-mermaid">quadrantChart');
	expect(compiled.markdown).toContain(`\`\`\`mermaid\n${source}\n\`\`\``);
});

it('rejects a Mermaid ratio that cannot become a safe aspect ratio', async () => {
	await expect(
		compile(
			'---\ntitle: Test\nlang: en-US\n---\n\n```mermaid ratio="wide"\nA --> B\n```\n',
			'/article',
			{
				newTabNote: 'opens in new tab',
				resolveAsset: () => null,
				highlight: async () => '',
				sourceFile: 'contents/broken-diagram.md',
			},
		),
	).rejects.toThrow('contents/broken-diagram.md: Mermaid ratio must be a positive decimal');
});

it('leaves Mermaid ratio optional', async () => {
	const source = 'flowchart LR\nA --> B';
	const compiled = await compile(
		`---\ntitle: Test\nlang: en-US\n---\n\n\`\`\`mermaid\n${source}\n\`\`\`\n`,
		'/article',
		{
			newTabNote: 'opens in new tab',
			resolveAsset: () => null,
			highlight: async () => '',
			sourceFile: 'contents/diagram.md',
		},
	);

	expect(compiled.blocks).toContainEqual({ type: 'mermaid', source });
});

it('compiles a categorical quadrant without inventing numeric positions', async () => {
	const compiled = await compile(
		`---
title: Test
lang: en-US
---

:::quadrant{title="UI stack trade-offs" description="Relative regions only." left="Smaller ecosystem" right="Broader ecosystem" top="More compile-time leverage" bottom="More runtime dependence"}
::quadrant-item{at="top-left" title="Solid" note="compiler-first"}
::quadrant-item{at="top-left" title="Marko"}
::quadrant-item{at="top-right" title="Svelte" note="visible structure + reach"}
:::
`,
		'/article',
		{
			newTabNote: 'opens in new tab',
			resolveAsset: () => null,
			highlight: async () => '',
			sourceFile: 'contents/quadrant.md',
		},
	);

	expect(compiled.blocks).toContainEqual({
		type: 'quadrant',
		title: 'UI stack trade-offs',
		description: 'Relative regions only.',
		axes: {
			top: 'More compile-time leverage',
			right: 'Broader ecosystem',
			bottom: 'More runtime dependence',
			left: 'Smaller ecosystem',
		},
		items: [
			{ at: 'top-left', title: 'Solid', note: 'compiler-first' },
			{ at: 'top-left', title: 'Marko' },
			{ at: 'top-right', title: 'Svelte', note: 'visible structure + reach' },
		],
	});
	expect(feedOf(compiled)).toContain('<strong>Solid</strong> — compiler-first');
	expect(feedOf(compiled)).toContain('<strong>Marko</strong>');
	expect(compiled.markdown).toContain(
		'> - More compile-time leverage / Smaller ecosystem: Solid — compiler-first',
	);
	expect(compiled.text).toContain('UI stack trade-offs\nRelative regions only.');
});

it('compiles a categorical quadrant without items', async () => {
	const compiled = await compile(
		`---
title: Test
lang: en-US
---

:::quadrant{title="Empty comparison" left="Left" right="Right" top="Top" bottom="Bottom"}
:::
`,
		'/article',
		{
			newTabNote: 'opens in new tab',
			resolveAsset: () => null,
			highlight: async () => '',
			sourceFile: 'contents/quadrant.md',
		},
	);

	expect(compiled.blocks).toContainEqual({
		type: 'quadrant',
		title: 'Empty comparison',
		axes: { top: 'Top', right: 'Right', bottom: 'Bottom', left: 'Left' },
		items: [],
	});
});

it('rejects a quadrant item outside the four categorical regions', async () => {
	await expect(
		compile(
			`---
title: Test
lang: en-US
---

:::quadrant{title="Broken" left="Left" right="Right" top="Top" bottom="Bottom"}
::quadrant-item{at="center" title="Nowhere"}
:::
`,
			'/article',
			{
				newTabNote: 'opens in new tab',
				resolveAsset: () => null,
				highlight: async () => '',
				sourceFile: 'contents/broken-quadrant.md',
			},
		),
	).rejects.toThrow(
		'contents/broken-quadrant.md: quadrant-item at must be one of top-left, top-right, bottom-left, bottom-right',
	);
});

it('rejects a quadrant item without its container', async () => {
	await expect(
		compile(
			'---\ntitle: Test\nlang: en-US\n---\n\n::quadrant-item{at="top-left" title="Loose"}\n',
			'/article',
			{
				newTabNote: 'opens in new tab',
				resolveAsset: () => null,
				highlight: async () => '',
				sourceFile: 'contents/loose-quadrant.md',
			},
		),
	).rejects.toThrow('contents/loose-quadrant.md: quadrant-item must be inside a quadrant');
});

it('compiles titled code fences into explicit disclosure states', async () => {
	const compiled = await compile(
		`---
title: Test
lang: en-US
---

\`\`\`ts title="Reference"
const open = true;
\`\`\`

\`\`\`ts title="Closed" default="collapsed"
const open = false;
\`\`\`

\`\`\`ts title="Fixed" collapsible="false"
const fixed = true;
\`\`\`
`,
		'/article',
		{
			newTabNote: 'opens in new tab',
			resolveAsset: () => null,
			highlight: async (code) => `<pre>${code}</pre>`,
			sourceFile: 'contents/code-disclosures.md',
		},
	);

	expect(compiled.blocks).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				type: 'code',
				title: 'Reference',
				collapsible: true,
				default_expanded: true,
			}),
			expect.objectContaining({
				type: 'code',
				title: 'Closed',
				collapsible: true,
				default_expanded: false,
			}),
			expect.objectContaining({
				type: 'code',
				title: 'Fixed',
				collapsible: false,
				default_expanded: true,
			}),
		]),
	);
});

it('rejects contradictory code disclosure metadata', async () => {
	await expect(
		compile(
			'---\ntitle: Test\nlang: en-US\n---\n\n```ts title="Fixed" collapsible="false" default="collapsed"\ncode\n```\n',
			'/article',
			{
				newTabNote: 'opens in new tab',
				resolveAsset: () => null,
				highlight: async () => '',
				sourceFile: 'contents/broken-code-disclosure.md',
			},
		),
	).rejects.toThrow(
		'contents/broken-code-disclosure.md: a code fence cannot be fixed open and default collapsed',
	);
});

it('leaves an unfetched tweet visible as a directive placeholder', async () => {
	const compiled = await compile(
		'---\ntitle: Test\nlang: en-US\n---\n\n::twitter{tweet="2088060180290302397"}\n',
		'/article',
		{
			newTabNote: 'opens in new tab',
			resolveAsset: () => null,
			highlight: async () => '',
			sourceFile: 'contents/widgets.md',
		},
	);

	// `pending` is what separates this from the stub an author writes with ::placeholder. The two
	// had one shape, and the feed is where that showed: this one says nothing there, because what
	// it would say is that `cms embed` has not run.
	expect(compiled.blocks).toContainEqual({
		type: 'placeholder',
		kind: 'twitter',
		meta: { tweet: '2088060180290302397' },
		pending: true,
	});
	expect(feedOf(compiled)).toBe('');
});

it('shows an authored ::placeholder in the feed, and a pending embed not at all', async () => {
	const compiled = await compile(
		'---\ntitle: Test\nlang: en-US\n---\n\n::placeholder{kind="chart" note="later"}\n\n::cargo{crate="nothing"}\n',
		'/article',
		{ newTabNote: 'opens in new tab', resolveAsset: () => null, highlight: async () => '' },
	);

	expect(feedOf(compiled)).toBe('<pre>::chart\nnote = "later"</pre>');
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

const noteContext = {
	newTabNote: 'opens in new tab',
	resolveAsset: () => null,
	highlight: async () => '',
	sourceFile: 'contents/example.md',
};

it('numbers notes across the whole article, not within each block', async () => {
	const compiled = await compile(
		'---\ntitle: Test\nlang: en-US\n---\n\n' +
			'The :fn[first]{is="One."} para.\n\n' +
			'The :fn[second]{is="Two."} para.\n\n' +
			'The :fn[third]{is="Three."} para.\n',
		'/article',
		noteContext,
	);

	const markers = compiled.blocks
		.filter((block) => block.type === 'prose')
		.map((block) => (block.type === 'prose' ? block.html : ''))
		.map((html) => html.match(/>(\d+)<\/a>/)?.[1]);

	expect(markers).toEqual(['1', '2', '3']);
	expect(compiled.blocks.at(-1)).toEqual({
		type: 'footnotes',
		notes: [
			{ number: 1, phrase: 'first', text: 'One.' },
			{ number: 2, phrase: 'second', text: 'Two.' },
			{ number: 3, phrase: 'third', text: 'Three.' },
		],
	});
});

// Two notes saying the same thing are two notes: there is no label to merge them by, and a
// reader who met the explanation twice was given it twice deliberately.
it('keeps notes with identical text apart', async () => {
	const compiled = await compile(
		'---\ntitle: Test\nlang: en-US\n---\n\n:fn[A]{is="Same."} and :fn[B]{is="Same."}.\n',
		'/article',
		noteContext,
	);

	expect(compiled.blocks.at(-1)).toEqual({
		type: 'footnotes',
		notes: [
			{ number: 1, phrase: 'A', text: 'Same.' },
			{ number: 2, phrase: 'B', text: 'Same.' },
		],
	});
});

// The reason the marker carries no children: a heading is flattened to a string for the ToC and
// the slug, and a childless directive leaves nothing behind when it is.
// The marked words are the heading's own, so they belong in its entry; what must not arrive there
// is the note. Flattening a heading to a string keeps the children and drops the attribute, which
// is the whole reason the note lives in one.
it('keeps a marked headings words in the table of contents and its note out', async () => {
	const compiled = await compile(
		'---\ntitle: Test\nlang: en-US\n---\n\n## The :fn[model]{is="Execution, not data."} matters {#model}\n',
		'/article',
		noteContext,
	);

	expect(compiled.toc).toEqual([{ slug: 'model', text: 'The model matters', depth: 2 }]);
	expect(compiled.blocks[0]).toEqual({
		type: 'heading',
		depth: 2,
		slug: 'model',
		text: 'The model matters',
		notes: [1],
	});
	expect(compiled.blocks.at(-1)).toEqual({
		type: 'footnotes',
		notes: [{ number: 1, phrase: 'model', text: 'Execution, not data.' }],
	});
});

// A straight quote ends the attribute early, so the parser drops it and leaves a directive that
// says nothing. Silent, and indistinguishable from a typo, so it stops the build instead.
it('refuses a note whose text was lost to a straight quote', async () => {
	await expect(
		compile(
			'---\ntitle: Test\nlang: en-US\n---\n\nHe :fn[said]{is="quote "hi" here"} it.\n',
			'/article',
			noteContext,
		),
	).rejects.toThrow('contents/example.md: :fn is :fn[the words]{is="what they mean"}');
});

it('gives the markdown target real footnotes', async () => {
	const compiled = await compile(
		'---\ntitle: Test\nlang: en-US\n---\n\n## :fn[Model]{is="One."} {#model}\n\n:fn[Body]{is="Two."} here.\n',
		'/article',
		noteContext,
	);

	expect(compiled.markdown).toContain('## Model[^1]');
	expect(compiled.markdown).toContain('Body[^2] here.');
	expect(compiled.markdown).toContain('[^1]: One.');
	expect(compiled.markdown).toContain('[^2]: Two.');
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
