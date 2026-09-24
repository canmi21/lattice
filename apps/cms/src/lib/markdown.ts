/**
 * What the editor knows about this repository's markdown beyond CommonMark and GFM.
 *
 * Every construct the site compiles and the stock presets do not parse is given a place in the
 * document here: the three directive forms and a fence's parameters. Each one is the same journey
 * -- an mdast field, a schema attribute to hold it, and a serializer that writes it back -- and
 * nothing else is attempted here: drawing a node is the node view's business. Installed as one
 * list by the editor and by the round-trip test alike, so the two cannot test different pipelines.
 * See spec/tasks.md, "The editor's round trip keeps structure".
 *
 * Ported from the archived desktop editor, which settled the same question once.
 */
import { config, remarkStringifyOptionsCtx } from '@milkdown/core';
import { codeBlockSchema, linkSchema, paragraphSchema } from '@milkdown/preset-commonmark';
import type { MarkdownNode } from '@milkdown/transformer';
import { $nodeSchema, $remark } from '@milkdown/utils';
import remarkDirective from 'remark-directive';

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

type Directive = MarkdownNode & { name?: string; attributes?: Attributes };

/** A label written in brackets on a block directive: `::name[label]` or `:::name[label]`. */
function isLabel(node: MarkdownNode | undefined): boolean {
	const data = node?.data as { directiveLabel?: boolean } | undefined;
	return node?.type === 'paragraph' && data?.directiveLabel === true;
}

/**
 * The directive's name and attributes as schema attributes, and its label kept as the mdast it
 * was: a label is a directive's argument, not prose in the document.
 */
function attrsOf(node: Directive, label: MarkdownNode[] | null) {
	return { name: node.name ?? '', attributes: { ...node.attributes }, label };
}

const DIRECTIVE_ATTRS = {
	name: { default: '' },
	attributes: { default: {} },
	label: { default: null },
};

const directive = $remark('directive', () => remarkDirective);

/** `:::name{...}` around blocks the author writes in as they would anywhere else. */
export const containerDirective = $nodeSchema('container_directive', () => ({
	content: 'block*',
	group: 'block',
	defining: true,
	attrs: DIRECTIVE_ATTRS,
	parseDOM: [{ tag: 'div[data-container-directive]' }],
	toDOM: (node) => ['div', { 'data-container-directive': node.attrs.name }, 0],
	parseMarkdown: {
		match: ({ type }) => type === 'containerDirective',
		runner: (state, node, type) => {
			const children = [...(node.children ?? [])];
			const label = isLabel(children[0]) ? (children.shift()?.children ?? []) : null;
			state.openNode(type, attrsOf(node as Directive, label));
			state.next(children);
			state.closeNode();
		},
	},
	toMarkdown: {
		match: (node) => node.type.name === 'container_directive',
		runner: (state, node) => {
			state.openNode('containerDirective', undefined, {
				name: node.attrs.name,
				attributes: node.attrs.attributes,
			});
			if (node.attrs.label) {
				state.addNode('paragraph', node.attrs.label, undefined, {
					data: { directiveLabel: true },
				});
			}
			state.next(node.content);
			state.closeNode();
		},
	},
}));

/** `::name{...}` on a line of its own: one thing, placed and configured, with no prose inside. */
export const leafDirective = $nodeSchema('leaf_directive', () => ({
	atom: true,
	group: 'block',
	attrs: DIRECTIVE_ATTRS,
	parseDOM: [{ tag: 'div[data-leaf-directive]' }],
	toDOM: (node) => ['div', { 'data-leaf-directive': node.attrs.name }],
	parseMarkdown: {
		match: ({ type }) => type === 'leafDirective',
		runner: (state, node, type) => {
			const label = node.children?.length ? node.children : null;
			state.addNode(type, attrsOf(node as Directive, label));
		},
	},
	toMarkdown: {
		match: (node) => node.type.name === 'leaf_directive',
		runner: (state, node) => {
			state.addNode('leafDirective', node.attrs.label ?? [], undefined, {
				name: node.attrs.name,
				attributes: node.attrs.attributes,
			});
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
			const { name, attributes } = attrsOf(node as Directive, null);
			state.openNode(type, { name, attributes });
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
	...containerDirective,
	...leafDirective,
	...textDirective,
	...fence,
	...outerLink,
	...paragraph,
];
