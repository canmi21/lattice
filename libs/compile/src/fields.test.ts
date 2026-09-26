/**
 * Blocks compiled from the fields they are written with: widgets, diagrams, quadrants, code
 * fences and embeds, and what each refuses. See fields.ts.
 */
import { expect, it } from 'vitest';
import { compile } from './compile';
import { feedOf } from './compile.harness.ts';

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
	// it would say is that `local embed` has not run.
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
