/**
 * The editor's round trip keeps every article's structure. See spec/tasks.md, "The editor's round
 * trip keeps structure".
 *
 * The real editor, built as the page builds it, is given each article in `contents/` and asked
 * for its markdown back; both texts are parsed by the site's own parser and the trees compared
 * with positions set aside. A spelling may change, a node or an attribute may not.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { syntaxTree } from '@canmi/compile/compile';
import { Editor, defaultValueCtx, rootCtx } from '@milkdown/core';
import { commonmark } from '@milkdown/preset-commonmark';
import { gfm } from '@milkdown/preset-gfm';
import { getMarkdown } from '@milkdown/utils';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import { extensions } from './markdown.ts';

/**
 * A window for the editor alone. The file is not run under jsdom as a whole, because jsdom's own
 * `URL` replaces the one the site's compiler reads its configuration by.
 */
const { window } = new JSDOM();
const GLOBALS = [
	'document',
	'navigator',
	'MutationObserver',
	'getComputedStyle',
	'DOMParser',
] as const;
// Milkdown's plugin timers signal through the global event target with node's own `Event`, which
// jsdom's window refuses, so the global one is node's.
const events = new EventTarget();
Object.assign(globalThis, {
	window,
	addEventListener: events.addEventListener.bind(events),
	removeEventListener: events.removeEventListener.bind(events),
	dispatchEvent: events.dispatchEvent.bind(events),
	...Object.fromEntries(
		GLOBALS.filter((name) => !(name in globalThis)).map((name) => [name, window[name]]),
	),
});

const CONTENTS = fileURLToPath(new URL('../../../../contents/', import.meta.url));

function articles(directory: string): string[] {
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const path = join(directory, entry.name);
		if (entry.isDirectory()) return articles(path);
		return entry.name.endsWith('.md') ? [path] : [];
	});
}

/** The body the editor is given: a draft carries its metadata in columns, not in frontmatter. */
function body(file: string): string {
	return readFileSync(file, 'utf8').replace(/^---\n[\s\S]*?\n---\n/, '');
}

async function roundTrip(markdown: string): Promise<string> {
	const editor = await Editor.make()
		.config((ctx) => {
			ctx.set(rootCtx, document.createElement('div'));
			ctx.set(defaultValueCtx, markdown);
		})
		.use(commonmark)
		.use(gfm)
		.use(extensions)
		.create();
	const written = editor.action(getMarkdown());
	await editor.destroy();
	return written;
}

type Tree = {
	type: string;
	value?: string;
	url?: string;
	title?: string | null;
	children?: Tree[];
	[key: string]: unknown;
};

/** The marks a run of text is under: phrasing that wraps words and says nothing else. */
const MARKS = new Set(['emphasis', 'strong', 'delete']);

/** Nodes whose children are a sentence, compared as marked runs rather than as a nest. */
const PHRASING = new Set(['paragraph', 'heading', 'tableCell', 'leafDirective', 'textDirective']);

type Run = { marks: string[] } & Record<string, unknown>;

/**
 * A sentence as runs of text, each under the set of marks it is under.
 *
 * `~~*a*~~` and `*~~a~~*` are one thing said twice, and so is a space inside or just outside a
 * span: the editor holds marks as a set on each character, not as a nest, so the nest it writes is
 * its own. A link is a mark here too, carrying where it goes. Anything else inline -- code, an
 * image, a directive -- stays a node, and a directive's words are runs under the marks around it.
 */
function runs(children: Tree[], marks: string[]): Run[] {
	const out: Run[] = [];
	const push = (run: Run) => {
		const last = out.at(-1);
		if (run.type === 'text' && last?.type === 'text' && last.marks.join() === run.marks.join()) {
			last.value = `${last.value as string}${run.value as string}`;
		} else out.push(run);
	};
	for (const child of children) {
		if (MARKS.has(child.type)) {
			for (const run of runs(child.children ?? [], [...marks, child.type])) push(run);
		} else if (child.type === 'link') {
			const link = `link ${child.url ?? ''} ${child.title ?? ''}`;
			for (const run of runs(child.children ?? [], [...marks, link])) push(run);
		} else if (child.type === 'textDirective') {
			// The directive is the node; the marks around it fall on its words.
			const { position: _position, children: words, ...rest } = child;
			push({ ...rest, children: runs(words ?? [], marks), marks: [] });
		} else if (child.type === 'text') {
			// Whitespace carries no emphasis a reader can see; a link it stays inside of.
			for (const piece of (child.value ?? '').split(/(\s+)/u).filter(Boolean)) {
				const bare = /^\s+$/u.test(piece) ? marks.filter((mark) => mark.startsWith('link')) : marks;
				push({ type: 'text', value: piece, marks: [...new Set(bare)].toSorted() });
			}
		} else {
			push({ ...shape(child), marks: [...new Set(marks)].toSorted() });
		}
	}
	return out;
}

/** What a node says, with its place in the source set aside. */
function shape(node: Tree): Tree {
	const { position: _position, children, ...rest } = node;
	if (!children) return rest as Tree;
	if (PHRASING.has(node.type))
		return { ...rest, children: runs(children, []) as unknown as Tree[] };
	return { ...rest, children: children.map(shape) } as Tree;
}

function structure(markdown: string): Tree {
	return shape(syntaxTree(markdown) as unknown as Tree);
}

async function expectKept(markdown: string) {
	expect(structure(await roundTrip(markdown))).toEqual(structure(markdown));
}

describe('the editor round trip', () => {
	it('keeps every directive form, its attributes and its label', async () => {
		await expectKept(
			[
				'A note:fn[an aside, with **weight**] and :spoiler[hidden] and :t[term]{lang=zh .accent}.',
				'',
				'::image{src=abcde alt="A cat on a mat"}',
				'',
				'::linkcard{href="https://example.com/a?b=c"}',
				'',
				'::article[A label]{rid=q8w3e}',
				'',
				':::quadrant{title="Fit" left="Niche" right="Mainstream"}',
				'::quadrant-item{x=1 y=2 label="Svelte"}',
				':::',
				'',
				':::note[Heading words]',
				'Prose inside a container.',
				':::',
				'',
			].join('\n'),
		);
	});

	it('keeps the marks around an inline directive on the words after it', async () => {
		await expectKept('~~Strike a :fn[note]{is="an aside"}and what follows~~ plain.\n');
	});

	it('keeps bold link words bold after a letter', async () => {
		await expectKept('具体可以[**参考这里**](https://example.com/a)\n');
	});

	it('keeps an empty table cell empty', async () => {
		await expectKept('|  | a |\n|---|---|\n| b | c |\n');
	});

	it("keeps a fence's parameters", async () => {
		await expectKept(
			[
				'```svg-canvas {w=300 h=200}',
				'<rect/>',
				'```',
				'',
				'```{font georgia}',
				'Text',
				'```',
				'',
			].join('\n'),
		);
	});

	for (const file of articles(CONTENTS)) {
		it(`keeps ${relative(CONTENTS, file)}`, async () => {
			await expectKept(body(file));
		});
	}
});
