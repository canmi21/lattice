/**
 * What a paragraph's inline syntax compiles to: links and mailboxes, translator's notes, spoilers,
 * and footnotes. See inline.ts.
 */
import { expect, it } from 'vitest';
import { compile, compilePage } from './compile';

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

/**
 * The three cases the corpus meets: the author, a site box, and a name nothing answers for.
 *
 * Addresses are not asserted literally -- they are the config's to move, and a test repeating
 * them is the second copy this change exists to remove. What is asserted is that a name became
 * an address at all: `to=author` used to compile to `mailto:author`, a live link to nowhere.
 */
it('resolves the author by name rather than by address', () => {
	const page = compilePage(
		'---\ntitle: Test\n---\n\n:link[email]{to=author}\n',
		'opens in new tab',
	);
	const paragraph = page.blocks[0];
	if (paragraph?.type !== 'p') throw new Error('expected a paragraph');
	const [segment] = paragraph.segments;
	if (segment?.type !== 'link') throw new Error('expected a link');

	expect(segment.href).not.toBe('mailto:author');
	expect(segment.href).toMatch(/^mailto:[^@\s]+@[^@\s]+$/u);
});

it('composes a site box out of the one domain the config carries', () => {
	const page = compilePage(
		'---\ntitle: Test\n---\n\n:link[email]{to=support}\n',
		'opens in new tab',
	);
	const paragraph = page.blocks[0];
	if (paragraph?.type !== 'p') throw new Error('expected a paragraph');
	const [segment] = paragraph.segments;
	if (segment?.type !== 'link') throw new Error('expected a link');

	expect(segment.href).toMatch(/^mailto:support@[^@\s]+$/u);
});

it('refuses a mailbox nothing answers for with the file named', () => {
	expect(() =>
		compilePage(
			'---\ntitle: Test\n---\n\n:link[email]{to=postmaster}\n',
			'opens in new tab',
			'contents/homepage.md',
		),
	).toThrow('contents/homepage.md: :link[email] to must be an address or one of');
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

	// The address is the attribute alone. `focus-link` is a recipe and stays a class; the icon
	// carries no recipe, so it is left with no class at all.
	// See spec/architecture/css/authoring.md.
	expect(prose.html).toContain('<button type="button" class="focus-link" data-tn-trigger');
	expect(prose.html).toContain('data-tn-note="Its meaning needs context."');
	expect(prose.html).toContain('aria-controls="translator-note" aria-expanded="false"');
	expect(prose.html).toContain(
		'<svg data-tn-icon viewBox="0 0 24 24" fill="none" stroke="currentColor"',
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
	expect(prose.html).toContain('<span data-note-words>model</span><sup data-note-marker>');
	// The two recipes stay classes; only the address the escape hatch reaches by travels.
	expect(prose.html).toContain('class="focus-link jump-target" data-note-marker-link');
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

	// The fog is CSS; the compiled output only addresses the span and makes it reachable without
	// a pointer. The words stay ordinary text inside it.
	expect(prose.html).toContain(
		'<span class="focus-link" data-spoiler tabindex="0">nobody wins</span>',
	);
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
