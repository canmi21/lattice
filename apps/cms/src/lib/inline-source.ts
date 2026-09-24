/**
 * The marked words under the caret, shown as the markdown they are while the caret is there.
 *
 * As Obsidian and Typora do it: put the caret on bold words and the asterisks are there to edit;
 * move away and the words are bold again. Only the smallest unit is opened -- the run of marked
 * words and inline directives around the caret, never the paragraph -- and it is read back only
 * once the caret has left it, never while it is typed in, so nothing guesses at half-written
 * syntax. Reading back is the markdown parser's own: what parses takes its marks again, and what
 * does not, a lone `**`, stays as the text it is for the author to finish. See
 * spec/architecture/local.md, "A sentence's marks are set, and shown as source where the caret is".
 */
import { parserCtx, serializerCtx } from '@milkdown/core';
import type { Ctx } from '@milkdown/ctx';
import { Fragment, type Node } from '@milkdown/prose/model';
import {
	type EditorState,
	Plugin,
	PluginKey,
	TextSelection,
	type Transaction,
} from '@milkdown/prose/state';
import { Decoration, DecorationSet, type EditorView } from '@milkdown/prose/view';
import { $prose } from '@milkdown/utils';

/** The range of source text now open, or none. */
type Opened = { from: number; to: number } | null;

export const inlineSourceKey = new PluginKey<Opened>('inline-source');

/** Written where the caret was, found in the source, and taken out: never saved. */
const SENTINEL = '';

/** Words that carry something beyond themselves: a mark, or an inline directive. */
function rich(node: Node): boolean {
	return node.marks.length > 0 || node.type.name === 'text_directive';
}

/** The run of rich inline nodes the caret touches, as document positions, or none. */
function unitAt(state: EditorState): { from: number; to: number } | null {
	const { selection } = state;
	if (!(selection instanceof TextSelection) || !selection.empty) return null;
	const $at = selection.$from;
	// The sentence, which is further up than the caret's parent when the caret is in a directive's
	// words.
	let depth = $at.depth;
	while (depth > 0 && !$at.node(depth).isTextblock) depth--;
	const parent = $at.node(depth);
	if (!parent.isTextblock || parent.type.spec.code) return null;
	const start = $at.start(depth);
	const children: { node: Node; from: number; to: number }[] = [];
	parent.forEach((node, offset) => {
		children.push({ node, from: start + offset, to: start + offset + node.nodeSize });
	});
	const at = $at.pos;
	// The children the caret is in or beside; inside a directive, the directive itself.
	const touched = children
		.map((child, index) => ({ child, index }))
		.filter(({ child, index }) =>
			$at.depth > depth
				? index === $at.index(depth)
				: child.from <= at && at <= child.to && rich(child.node),
		);
	if (touched.length === 0) return null;
	let first = Math.min(...touched.map(({ index }) => index));
	let last = Math.max(...touched.map(({ index }) => index));
	while (first > 0 && rich(children[first - 1]!.node)) first--;
	while (last < children.length - 1 && rich(children[last + 1]!.node)) last++;
	return { from: children[first]!.from, to: children[last]!.to };
}

/** The unit as markdown, and where in it the caret belongs. */
function source(ctx: Ctx, state: EditorState, unit: { from: number; to: number }) {
	const caret = state.selection.from;
	const marked = state.tr.insertText(SENTINEL, caret);
	const content = marked.doc.slice(unit.from, unit.to + 1).content;
	const paragraph = state.schema.nodes.paragraph!.create(null, content);
	const doc = state.schema.topNodeType.create(null, [paragraph]);
	const text = ctx.get(serializerCtx)(doc).trim();
	const index = text.indexOf(SENTINEL);
	return { text: text.replace(SENTINEL, ''), offset: Math.max(0, index) };
}

/** The text of a range read as markdown: its inline content when it is one paragraph. */
function reading(ctx: Ctx, text: string): Fragment | null {
	if (!text) return Fragment.empty;
	const doc = ctx.get(parserCtx)(text) as Node | undefined;
	// Read alone, `- x` is a list and `# x` a heading. Inside a sentence they are neither, so the
	// text stays as it is written rather than being turned into something it was not.
	if (!doc || doc.childCount !== 1 || doc.firstChild?.type.name !== 'paragraph') return null;
	return doc.firstChild.content;
}

/** Reads every open range back into marks, one textblock at a time. */
function close(ctx: Ctx, tr: Transaction, opened: { from: number; to: number }): Transaction {
	const pieces: { from: number; to: number }[] = [];
	tr.doc.nodesBetween(opened.from, opened.to, (node, at) => {
		if (!node.isTextblock) return true;
		const from = Math.max(opened.from, at + 1);
		const to = Math.min(opened.to, at + 1 + node.content.size);
		if (from < to) pieces.push({ from, to });
		return false;
	});
	// Last first, so the earlier positions still hold.
	for (const { from, to } of pieces.toReversed()) {
		const read = reading(ctx, tr.doc.textBetween(from, to));
		if (read) tr.replaceWith(from, to, read);
	}
	return tr;
}

/** The document as it would be with nothing open: what is saved, never the open source. */
export function settled(ctx: Ctx, state: EditorState): Node {
	const opened = inlineSourceKey.getState(state);
	if (!opened) return state.doc;
	return close(ctx, state.tr, opened).doc;
}

/**
 * The plugin; `open` is the class the open source is drawn with, a faint ground so it reads as
 * the one place syntax is showing.
 */
export const inlineSource = (open: string) =>
	$prose((ctx) => {
		let view: EditorView | undefined;
		return new Plugin<Opened>({
			key: inlineSourceKey,
			state: {
				init: () => null,
				apply(tr, opened) {
					const meta = tr.getMeta(inlineSourceKey) as { opened: Opened } | undefined;
					if (meta) return meta.opened;
					if (!opened) return null;
					const from = tr.mapping.map(opened.from, -1);
					const to = tr.mapping.map(opened.to, 1);
					return from < to ? { from, to } : null;
				},
			},
			view(editor) {
				view = editor;
				return {};
			},
			appendTransaction(_transactions, _old, state) {
				// Nothing is rewritten under an input method that is still composing a word.
				if (view?.composing) return null;
				const opened = inlineSourceKey.getState(state);
				const { from: caretFrom, to: caretTo } = state.selection;
				const inside = opened && caretFrom >= opened.from && caretTo <= opened.to;
				if (inside) return null;

				let tr = state.tr;
				if (opened) tr = close(ctx, tr, opened);
				const next = tr.docChanged
					? state.apply(tr.setMeta(inlineSourceKey, { opened: null }))
					: state;
				const unit = unitAt(next);
				if (!unit) {
					if (!opened) return null;
					return tr.setMeta(inlineSourceKey, { opened: null }).setMeta('addToHistory', false);
				}
				const { text, offset } = source(ctx, next, unit);
				// `next` is `tr`'s result, so the unit's positions are already `tr.doc`'s.
				tr.replaceWith(unit.from, unit.to, state.schema.text(text));
				tr.setSelection(TextSelection.create(tr.doc, unit.from + offset));
				tr.setStoredMarks([]);
				return tr
					.setMeta(inlineSourceKey, { opened: { from: unit.from, to: unit.from + text.length } })
					.setMeta('addToHistory', false);
			},
			props: {
				decorations(state) {
					const opened = inlineSourceKey.getState(state);
					if (!opened) return DecorationSet.empty;
					return DecorationSet.create(state.doc, [
						Decoration.inline(opened.from, opened.to, { class: open }),
					]);
				},
				handleDOMEvents: {
					// A word finished under an input method is the moment the caret may be read again.
					compositionend(editor) {
						queueMicrotask(() => editor.dispatch(editor.state.tr));
						return false;
					},
				},
			},
		});
	});
