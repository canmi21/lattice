/**
 * Prose edited as the markdown it is, where the author is editing it.
 *
 * As Obsidian and Typora do it: put the caret on bold words and the asterisks are there to edit;
 * move away and the words are bold again. And what the author types is markdown too -- `**word**`
 * typed out becomes bold once the caret leaves it. The site's parser is the only judge of what any
 * of it means. See spec/architecture/local.md, "A sentence's marks are set, and shown as source
 * where the caret is". Four rules carry it:
 *
 * - **Source is kept as ranges of raw text**: a unit opened under the caret, and whatever was typed
 *   or pasted as plain text. Raw text is never escaped; it is what the author wrote.
 * - **A range is read back once the caret has left the sentence's raw span, or the editor has lost
 *   focus** -- never while it is typed in, and not while an input method is composing. The span
 *   is read whole, raw text verbatim and the rest as its markdown, so `**` typed on either side of
 *   an old word closes around it.
 * - **Only the smallest unit opens**: the run of marked words, inline directives and words holding
 *   markdown's punctuation that the caret is in or beside. It opens as the author would have
 *   written it -- without the backslashes the serializer adds -- whenever the parser says the two
 *   mean the same.
 * - **What does not parse stays where it is**, as the text it is, flagged, and opens again as source
 *   the next time the caret reaches it. Text that would read as a block on its own is left as
 *   written, since inside a sentence it is neither.
 */
import { parserCtx, serializerCtx } from '@milkdown/core';
import type { Ctx } from '@milkdown/ctx';
import { Fragment, type Node, type Schema } from '@milkdown/prose/model';
import {
	type EditorState,
	Plugin,
	PluginKey,
	TextSelection,
	type Transaction,
} from '@milkdown/prose/state';
import { ReplaceStep, Transform } from '@milkdown/prose/transform';
import { Decoration, DecorationSet, type EditorView } from '@milkdown/prose/view';
import { $prose } from '@milkdown/utils';

type Range = { from: number; to: number };

/** Raw text, and whether it was opened under the caret (drawn) or typed (not). */
type Raw = Range & { opened: boolean };

type Source = { raw: Raw[]; broken: Range[]; focused: boolean };

type Meta = Partial<Source> & { ours?: boolean };

export const inlineSourceKey = new PluginKey<Source>('inline-source');

/** Written where the caret was, found in the source, and taken out: never saved. */
const CARET = '';

/** Stand-ins for raw ranges while the rest of a span is serialized; one per range. */
const HOLE = 0xe001;

/** Markdown's inline punctuation: a word holding one is a word the parser may read as syntax. */
const SYNTAX = /[*_~`[\]\\]/u;

/** A backslash before punctuation, as the serializer writes it to keep a character literal. */
const ESCAPE = /\\([!-/:-@[-`{-~])/gu;

/** Words that carry something beyond themselves: a mark, or an inline directive. */
function rich(node: Node): boolean {
	return node.marks.length > 0 || node.type.name === 'text_directive';
}

/** The sentence's pieces: rich nodes whole, plain text word by word. */
function pieces(parent: Node, start: number): (Range & { rich: boolean })[] {
	const out: (Range & { rich: boolean })[] = [];
	parent.forEach((node, offset) => {
		const from = start + offset;
		if (!node.isText || node.marks.length > 0) {
			out.push({ from, to: from + node.nodeSize, rich: rich(node) });
			return;
		}
		let at = from;
		for (const word of node.text!.split(/(\s+)/u)) {
			if (!word) continue;
			out.push({ from: at, to: at + word.length, rich: !/^\s+$/u.test(word) && SYNTAX.test(word) });
			at += word.length;
		}
	});
	return out;
}

/** The textblock around a position: its depth, start and end. */
function sentence(doc: Node, position: number) {
	const $at = doc.resolve(position);
	let depth = $at.depth;
	while (depth > 0 && !$at.node(depth).isTextblock) depth--;
	const node = $at.node(depth);
	if (!node.isTextblock || node.type.spec.code) return null;
	return { $at, depth, node, from: $at.start(depth), to: $at.end(depth) };
}

/** The smallest unit the caret touches, as document positions, or none. */
function unitAt(state: EditorState, raw: Range[] = []): Range | null {
	const { selection } = state;
	if (!(selection instanceof TextSelection) || !selection.empty) return null;
	const found = sentence(state.doc, selection.from);
	if (!found) return null;
	const { $at, depth, node, from } = found;
	// Raw text is never part of a unit: it is already source, and serialized it would be escaped.
	const list = pieces(node, from).map((piece) => ({
		...piece,
		rich: piece.rich && !raw.some((range) => piece.to > range.from && piece.from < range.to),
	}));
	const at = $at.pos;
	// Inside a directive's words the directive itself is touched; otherwise what the caret is in
	// or beside.
	const inner = $at.depth > depth ? $at.before(depth + 1) : -1;
	const touched = list
		.map((piece, index) => ({ piece, index }))
		.filter(({ piece }) =>
			inner >= 0 ? piece.from === inner : piece.rich && piece.from <= at && at <= piece.to,
		)
		.map(({ index }) => index);
	if (touched.length === 0) return null;
	let first = Math.min(...touched);
	let last = Math.max(...touched);
	while (first > 0 && list[first - 1]!.rich) first--;
	while (last < list.length - 1 && list[last + 1]!.rich) last++;
	return { from: list[first]!.from, to: list[last]!.to };
}

function serialize(ctx: Ctx, schema: Schema, content: Fragment): string {
	const paragraph = schema.nodes.paragraph!.create(null, content);
	return ctx
		.get(serializerCtx)(schema.topNodeType.create(null, [paragraph]))
		.trim();
}

/** The text of a sentence read as markdown: its inline content when it is one paragraph. */
function reading(ctx: Ctx, text: string): Fragment | null {
	if (!text) return Fragment.empty;
	const doc = ctx.get(parserCtx)(text) as Node | undefined;
	if (!doc || doc.childCount !== 1 || doc.firstChild?.type.name !== 'paragraph') return null;
	return doc.firstChild.content;
}

/** The unit as the author would write it, and where in it the caret belongs. */
function opening(ctx: Ctx, state: EditorState, unit: Range) {
	const marked = state.tr.insertText(CARET, state.selection.from);
	let text = serialize(ctx, state.schema, marked.doc.slice(unit.from, unit.to + 1).content);
	// Without the serializer's backslashes, when the parser reads the two as one thing.
	const bare = text.replace(ESCAPE, '$1');
	if (bare !== text) {
		const escaped = reading(ctx, text.replace(CARET, ''));
		const plain = reading(ctx, bare.replace(CARET, ''));
		if (escaped && plain?.eq(escaped)) text = bare;
	}
	const index = text.indexOf(CARET);
	return { text: text.replace(CARET, ''), offset: Math.max(0, index) };
}

/** Raw ranges grouped by the sentence they are in: the span each sentence is read back over. */
function spans(doc: Node, raw: Raw[]): (Range & { raw: Raw[] })[] {
	const bySentence = new Map<number, Range & { raw: Raw[] }>();
	for (const range of raw) {
		const found = sentence(doc, range.from);
		if (!found) continue;
		const held = bySentence.get(found.from);
		if (held) {
			held.from = Math.min(held.from, range.from);
			held.to = Math.max(held.to, range.to);
			held.raw.push(range);
		} else bySentence.set(found.from, { from: range.from, to: range.to, raw: [range] });
	}
	return [...bySentence.values()].toSorted((a, b) => a.from - b.from);
}

/**
 * A span as markdown: its raw ranges verbatim, everything else as the serializer writes it. The
 * raw ranges are held out by stand-in characters while the rest is serialized, so none of what
 * the author typed is escaped.
 */
function spanMarkdown(ctx: Ctx, doc: Node, span: Range & { raw: Raw[] }): string {
	const held = new Transform(doc);
	const texts: string[] = [];
	// Only plain text is held out verbatim. Anything in a raw range that carries a mark or is a node
	// got there by some other way than typing, and is serialized with the rest so it is not lost.
	const plain = (range: Range) => {
		let only = true;
		doc.nodesBetween(range.from, range.to, (node) => {
			if (node.isInline && (!node.isText || node.marks.length > 0)) only = false;
			return only;
		});
		return only;
	};
	const verbatim = span.raw.filter(plain).toSorted((a, b) => b.from - a.from);
	for (const [index, range] of verbatim.entries()) {
		texts[index] = doc.textBetween(range.from, range.to);
		held.replaceWith(
			range.from,
			range.to,
			doc.type.schema.text(String.fromCodePoint(HOLE + index)),
		);
	}
	let text = serialize(
		ctx,
		doc.type.schema,
		held.doc.slice(span.from, held.mapping.map(span.to)).content,
	);
	for (const [index, raw] of texts.entries()) {
		text = text.replace(String.fromCodePoint(HOLE + index), () => raw);
	}
	// Serializing trims a paragraph's edges; a span's are the sentence's, and are put back.
	const whole = doc.textBetween(span.from, span.to);
	const lead = /^\s*/u.exec(whole)![0];
	const trail = /\s*$/u.exec(whole)![0];
	return `${lead}${text.trim()}${trail}`;
}

/** Words left holding markdown's punctuation after a read: syntax that did not close. */
function leftovers(content: Fragment, start: number): Range[] {
	const found: Range[] = [];
	content.forEach((node, offset) => {
		if (!node.isText || node.marks.some((mark) => mark.type.name === 'inlineCode')) return;
		let at = start + offset;
		for (const word of node.text!.split(/(\s+)/u)) {
			if (word && !/^\s+$/u.test(word) && SYNTAX.test(word)) {
				found.push({ from: at, to: at + word.length });
			}
			at += word.length;
		}
	});
	return found;
}

/** Reads spans back into marks, last first so earlier positions hold. What stayed raw is kept. */
function readBack(ctx: Ctx, tr: Transaction, list: (Range & { raw: Raw[] })[]) {
	const broken: { range: Range; steps: number }[] = [];
	for (const span of list.toReversed()) {
		const text = spanMarkdown(ctx, tr.doc, span);
		// A span is a piece of a sentence, and read alone its edges would be a paragraph's, which
		// markdown trims. The spaces around it are the sentence's and go back where they were.
		const [, lead = '', body = '', trail = ''] = /^(\s*)([\s\S]*?)(\s*)$/u.exec(text) ?? [];
		const read = reading(ctx, body);
		const schema = tr.doc.type.schema;
		const edge = (space: string) => (space ? Fragment.from(schema.text(space)) : Fragment.empty);
		if (read) {
			tr.replaceWith(span.from, span.to, edge(lead).append(read).append(edge(trail)));
			for (const range of leftovers(read, span.from + lead.length)) {
				broken.push({ range, steps: tr.steps.length });
			}
		} else {
			// Read alone it is a block; inside a sentence it is not. It stays as it was written.
			tr.replaceWith(span.from, span.to, schema.text(text));
			broken.push({
				range: { from: span.from + lead.length, to: span.from + lead.length + body.length },
				steps: tr.steps.length,
			});
		}
	}
	return broken.map(({ range, steps }) => ({
		from: tr.mapping.slice(steps).map(range.from, 1),
		to: tr.mapping.slice(steps).map(range.to, -1),
	}));
}

/** The document as it would be with nothing raw: what is saved, never the open source. */
export function settled(ctx: Ctx, state: EditorState): Node {
	const source = inlineSourceKey.getState(state);
	if (!source || source.raw.length === 0) return state.doc;
	const tr = state.tr;
	readBack(ctx, tr, spans(state.doc, source.raw));
	return tr.doc;
}

/** Whether a range meets any raw text: the formatting bar stands back from it. */
export function inRaw(state: EditorState, from: number, to: number): boolean {
	const source = inlineSourceKey.getState(state);
	return !!source?.raw.some((range) => to >= range.from && from <= range.to);
}

/** Overlapping or touching ranges become one; an opened one stays opened. */
function merged(list: Raw[]): Raw[] {
	const out: Raw[] = [];
	for (const range of list.toSorted((a, b) => a.from - b.from)) {
		const last = out.at(-1);
		if (last && range.from <= last.to) {
			last.to = Math.max(last.to, range.to);
			last.opened ||= range.opened;
		} else out.push({ ...range });
	}
	return out;
}

/** Plain text a step put in, as a range of the transaction's final document. */
function typed(tr: Transaction): Raw[] {
	const out: Raw[] = [];
	tr.steps.forEach((step, index) => {
		if (!(step instanceof ReplaceStep)) return;
		const { content } = step.slice;
		let plain = content.size > 0;
		content.forEach((node) => {
			if (!node.isText || node.marks.length > 0) plain = false;
		});
		if (!plain) return;
		const after = tr.mapping.slice(index + 1);
		out.push({
			from: after.map(step.from, -1),
			to: after.map(step.from + content.size, 1),
			opened: false,
		});
	});
	return out;
}

/**
 * The plugin. `open` is the class opened source is drawn with, a faint ground so it reads as the one
 * place syntax is showing; `broken` marks syntax that did not close.
 */
export const inlineSource = (classes: { open: string; broken: string }) =>
	$prose((ctx) => {
		let view: EditorView | undefined;
		const focus = (focused: boolean) => {
			if (!view) return;
			view.dispatch(view.state.tr.setMeta(inlineSourceKey, { focused, ours: true } as Meta));
		};
		const onFocus = () => focus(true);
		const onBlur = () => focus(false);
		return new Plugin<Source>({
			key: inlineSourceKey,
			state: {
				init: () => ({ raw: [], broken: [], focused: true }),
				apply(tr, value) {
					const meta = tr.getMeta(inlineSourceKey) as Meta | undefined;
					const map = (range: Range, assoc: [number, number]) => ({
						from: tr.mapping.map(range.from, assoc[0]),
						to: tr.mapping.map(range.to, assoc[1]),
					});
					let raw = meta?.raw ?? value.raw.map((range) => ({ ...range, ...map(range, [-1, 1]) }));
					let broken = meta?.broken ?? value.broken.map((range) => map(range, [1, -1]));
					if (!meta?.ours && tr.docChanged) {
						const added = typed(tr);
						raw = [...raw, ...added];
						broken = broken.filter((b) => !added.some((a) => a.to >= b.from && a.from <= b.to));
					}
					return {
						raw: merged(raw.filter((range) => range.from < range.to)),
						broken: broken.filter((range) => range.from < range.to),
						focused: meta?.focused ?? value.focused,
					};
				},
			},
			view(editor) {
				view = editor;
				editor.dom.addEventListener('focus', onFocus);
				editor.dom.addEventListener('blur', onBlur);
				return {
					destroy() {
						editor.dom.removeEventListener('focus', onFocus);
						editor.dom.removeEventListener('blur', onBlur);
					},
				};
			},
			appendTransaction(_transactions, _old, state) {
				// Nothing is rewritten under an input method that is still composing a word.
				if (view?.composing) return null;
				const source = inlineSourceKey.getState(state)!;
				const { from: caretFrom, to: caretTo } = state.selection;
				const all = spans(state.doc, source.raw);
				const caretSentence = source.focused ? sentence(state.doc, caretFrom) : null;
				const leaving: (Range & { raw: Raw[] })[] = [];
				const staying: (Range & { raw: Raw[] })[] = [];
				for (const span of all) {
					const here =
						!!caretSentence && span.from >= caretSentence.from && span.to <= caretSentence.to;
					const within = (range: Range) => caretFrom >= range.from && caretTo <= range.to;
					if (!here) leaving.push(span);
					// A sentence with anything typed in it is read back whole once the caret leaves
					// the sentence: `**` typed before a word and `**` after it are one span.
					else if (span.raw.some((range) => !range.opened)) staying.push(span);
					// Units opened under the caret close the moment the caret leaves each.
					else {
						for (const range of span.raw) {
							(within(range) ? staying : leaving).push({ ...range, raw: [range] });
						}
					}
				}
				const inRawNow = staying.some((span) =>
					span.raw.some((range) => caretFrom >= range.from && caretTo <= range.to),
				);

				const tr = state.tr;
				const read = readBack(ctx, tr, leaving);
				const broken = [
					...source.broken.map((range) => ({
						from: tr.mapping.map(range.from, 1),
						to: tr.mapping.map(range.to, -1),
					})),
					...read,
				];
				const kept = staying.flatMap((span) => span.raw);
				let raw: Raw[] = kept.map((range) => ({
					...range,
					from: tr.mapping.map(range.from, -1),
					to: tr.mapping.map(range.to, 1),
				}));
				let brokenNow = broken;

				// Open the unit under the caret, unless the caret is already in raw text.
				if (source.focused && !inRawNow) {
					const next = tr.docChanged
						? state.apply(
								tr.setMeta(inlineSourceKey, { raw, broken: brokenNow, ours: true } as Meta),
							)
						: state;
					const unit = unitAt(next, raw);
					if (unit) {
						const { text, offset } = opening(ctx, next, unit);
						tr.replaceWith(unit.from, unit.to, state.schema.text(text));
						tr.setSelection(TextSelection.create(tr.doc, unit.from + offset));
						tr.setStoredMarks([]);
						const after = tr.mapping.slice(tr.steps.length - 1);
						raw = [
							...raw.map((r) => ({ ...r, from: after.map(r.from, -1), to: after.map(r.to, 1) })),
							{
								from: unit.from,
								to: unit.from + text.length,
								opened: true,
							},
						];
						brokenNow = brokenNow
							.map((r) => ({ from: after.map(r.from, 1), to: after.map(r.to, -1) }))
							.filter((r) => r.to <= unit.from || r.from >= unit.from + text.length);
					}
				}

				if (!tr.docChanged && leaving.length === 0) return null;
				return tr
					.setMeta(inlineSourceKey, { raw, broken: brokenNow, ours: true } as Meta)
					.setMeta('addToHistory', false);
			},
			props: {
				decorations(state) {
					const source = inlineSourceKey.getState(state);
					if (!source) return DecorationSet.empty;
					return DecorationSet.create(state.doc, [
						...source.raw
							.filter((range) => range.opened)
							.map((range) => Decoration.inline(range.from, range.to, { class: classes.open })),
						...source.broken.map((range) =>
							Decoration.inline(range.from, range.to, {
								class: classes.broken,
								title: 'This syntax does not close',
							}),
						),
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
