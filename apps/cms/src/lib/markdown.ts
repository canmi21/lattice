/**
 * What the editor knows about this repository's markdown beyond CommonMark and GFM.
 *
 * Every construct the site compiles and the stock presets do not parse is given a place in the
 * document here. A block directive is held as its own source text, the way a fence holds its
 * code, because it is edited as text; an inline directive is a node with its name and attributes,
 * whose words are written in the sentence around them; a fence keeps its parameters. Drawing any
 * of them is the node views' business. Installed as one list by the editor and by the round-trip
 * test alike, so the two cannot test different pipelines. See spec/tasks.md, "The editor's round
 * trip keeps structure".
 *
 * Ported from the archived desktop editor, which settled the same question once.
 */
import { config, remarkStringifyOptionsCtx } from '@milkdown/core';
import * as common from '@milkdown/preset-commonmark';
import { codeBlockSchema, linkSchema, paragraphSchema } from '@milkdown/preset-commonmark';
import * as github from '@milkdown/preset-gfm';
import type { JSONRecord, MarkdownNode } from '@milkdown/transformer';
import { $nodeSchema, $remark } from '@milkdown/utils';
import remarkDirective from 'remark-directive';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import remarkStringify from 'remark-stringify';
import { unified } from 'unified';

type Attributes = Record<string, string | null | undefined>;

/**
 * The canonical spelling a saved article is written in. See spec/i18n/segments.md, "The
 * canonical style".
 */
export const CANONICAL = {
	bullet: '-',
	bulletOrdered: '.',
	bulletOther: '*',
	closeAtx: false,
	emphasis: '*',
	fence: '`',
	fences: true,
	incrementListMarker: false,
	listItemIndent: 'one',
	quote: '"',
	resourceLink: true,
	rule: '-',
	ruleRepetition: 3,
	ruleSpaces: false,
	setext: false,
	strong: '*',
	tightDefinitions: false,
} as const;

const directive = $remark('directive', () => remarkDirective);

/** Block directives as text, in the canonical spelling a saved article uses. */
const printer = unified().use(remarkStringify, CANONICAL).use(remarkDirective).use(remarkGfm);

/** And back: the text of a block, read the way the site reads an article. */
const reader = unified().use(remarkParse).use(remarkGfm).use(remarkDirective);

/**
 * A block directive -- `::name{...}`, or `:::name{...}` with what it wraps -- held as its own
 * source text.
 *
 * Text rather than structured attributes, because the author edits it as text: the caret goes in
 * and the block is its markdown until the caret leaves, the way a fence is its code. What is
 * written back is that text read again as markdown, so a directive that has been edited into
 * something else is saved as whatever it now is. See spec/architecture/local.md, "A custom block
 * is drawn in the editor as what it is".
 */
export const directiveBlock = $nodeSchema('directive_block', () => ({
	content: 'text*',
	group: 'block',
	marks: '',
	code: true,
	defining: true,
	parseDOM: [{ tag: 'div[data-directive-block]', preserveWhitespace: 'full' }],
	toDOM: () => ['div', { 'data-directive-block': '' }, 0],
	parseMarkdown: {
		match: ({ type }) => type === 'leafDirective' || type === 'containerDirective',
		runner: (state, node, type) => {
			const text = printer.stringify({ type: 'root', children: [node] } as never).trim();
			state.openNode(type);
			state.addText(text);
			state.closeNode();
		},
	},
	toMarkdown: {
		match: (node) => node.type.name === 'directive_block',
		runner: (state, node) => {
			const tree = reader.parse(node.textContent) as unknown as { children: MarkdownNode[] };
			for (const child of tree.children) {
				const { type, children, value, position: _position, ...props } = child;
				state.addNode(type, children, value as string | undefined, props as JSONRecord);
			}
		},
	},
}));

/** Never written: added and taken away again to read which marks are open. */
const PROBE = '\u200b';

/** `:name[words]{...}` inside a sentence, with words the author keeps writing. */
export const textDirective = $nodeSchema('text_directive', () => ({
	content: 'inline*',
	group: 'inline',
	inline: true,
	attrs: { name: { default: '' }, attributes: { default: {} } },
	parseDOM: [{ tag: 'span[data-text-directive]' }],
	toDOM: (node) => ['span', { 'data-text-directive': node.attrs.name }, 0],
	parseMarkdown: {
		match: ({ type }) => type === 'textDirective',
		runner: (state, node, type) => {
			const { name, attributes } = node as MarkdownNode & {
				name?: string;
				attributes?: Attributes;
			};
			state.openNode(type, { name: name ?? '', attributes: { ...attributes } });
			// Closing a node drops every open mark, so the words after a directive inside
			// `~~...~~` would fall out of the strike. The marks are read off a text added to the
			// node while it is still empty -- nothing to merge with -- and opened again after it.
			state.addText(PROBE);
			const around = state.top()?.pop()?.marks ?? [];
			state.next(node.children ?? []);
			state.closeNode();
			for (const mark of around) state.openMark(mark.type, mark.attrs);
		},
	},
	toMarkdown: {
		match: (node) => node.type.name === 'text_directive',
		runner: (state, node) => {
			state.openNode('textDirective', undefined, {
				name: node.attrs.name,
				attributes: node.attrs.attributes,
			});
			state.next(node.content);
			state.closeNode();
		},
	},
}));

/**
 * A fence keeps everything after its language word. The stock schema keeps `language` alone and
 * drops `meta`, which is where a parameterised fence says what it is -- and it is written back as
 * its own field, because packed into the language remark escapes the space. See spec/tasks.md.
 */
export const fence = codeBlockSchema.extendSchema((previous) => (ctx) => {
	const base = previous(ctx);
	return {
		...base,
		attrs: { ...base.attrs, meta: { default: '' } },
		parseMarkdown: {
			match: ({ type }) => type === 'code',
			runner: (state, node, type) => {
				state.openNode(type, { language: node.lang ?? '', meta: node.meta ?? '' });
				if (node.value) state.addText(node.value as string);
				state.closeNode();
			},
		},
		toMarkdown: {
			match: (node) => node.type.name === 'code_block',
			runner: (state, node) => {
				state.addNode('code', undefined, node.content.firstChild?.text ?? '', {
					lang: node.attrs.language || null,
					meta: node.attrs.meta || null,
				});
			},
		},
	};
});

/**
 * A link is the outermost mark, so bold words in a link are written `[**words**](to)`. The stock
 * order puts the emphasis outside, and `以**[` does not open a strong span: a delimiter run between
 * a letter and a bracket is not left-flanking, so the asterisks come back as text.
 */
export const outerLink = linkSchema.extendSchema((previous) => (ctx) => ({
	...previous(ctx),
	priority: 10,
}));

/**
 * An empty paragraph writes nothing. The stock schema writes `<br />` to keep a blank line, which
 * the site does not draw -- and inside a table it turns an empty cell into one holding HTML.
 */
export const paragraph = paragraphSchema.extendSchema((previous) => (ctx) => {
	const base = previous(ctx);
	return {
		...base,
		toMarkdown: {
			match: (node) => node.type.name === 'paragraph',
			runner: (state, node) => {
				if (node.content.size === 0) {
					state.openNode('paragraph').closeNode();
					return;
				}
				base.toMarkdown.runner(state, node);
			},
		},
	};
});

const canonical = config((ctx) => {
	ctx.update(remarkStringifyOptionsCtx, (options) => ({ ...options, ...CANONICAL }));
});

/** Installed after `commonmark` and `gfm`, which it overrides where the two disagree. */
export const extensions = [
	canonical,
	...directive,
	...directiveBlock,
	...textDirective,
	...fence,
	...outerLink,
	...paragraph,
];

/**
 * CommonMark and GFM without the rules that turn typed marks into marks as they are typed.
 *
 * Those rules match `**word**` by pattern the moment the second pair closes, which is guessing at
 * syntax mid-word; here what is typed is source, and the parser reads it once the caret has left.
 * See inline-source.ts. The block rules -- `# ` for a heading, `- ` for a list -- are kept.
 */
export const presets = [
	common.schema,
	common.inputRules,
	common.commands,
	common.keymap,
	common.plugins,
	github.schema,
	github.inputRules,
	github.pasteRules,
	github.keymap,
	github.commands,
	github.plugins,
].flat();
