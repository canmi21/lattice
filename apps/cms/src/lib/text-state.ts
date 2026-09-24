/**
 * The editor's reading of its text: the site's syntax tree, and the drawing made from it.
 *
 * The tree is taken again only when the text changes; the drawing is made again when the text or
 * the selection does, because what is hidden depends on where the selection is. The whole text is
 * parsed each time, which is the correct first version -- see spec/architecture/local.md, "An edit
 * can move the boundaries it sits between".
 */
import { syntaxTree } from '@canmi/compile/parser';
import { type EditorState, type Range, StateField } from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView, WidgetType } from '@codemirror/view';
import type { Root } from 'mdast';
import { type Classes, paint } from './paint';

/** The mark a soft break is given at its line's end: the page joins these two lines. */
class SoftBreak extends WidgetType {
	constructor(readonly className: string) {
		super();
	}
	override eq(other: SoftBreak) {
		return other.className === this.className;
	}
	toDOM() {
		const mark = document.createElement('span');
		mark.className = this.className;
		mark.textContent = '↵';
		mark.title = 'A single line break: the page joins these lines with a space';
		mark.setAttribute('aria-hidden', 'true');
		return mark;
	}
	override ignoreEvent() {
		return false;
	}
}

type Reading = { tree: Root; decorations: DecorationSet };

/** The classes the drawing is made with, which belong to the page that holds the editor. */
export type Drawing = Classes & { soft: string };

function draw(state: EditorState, tree: Root, classes: Drawing): DecorationSet {
	const text = state.doc.toString();
	const selected = state.selection.ranges.map(({ from, to }) => ({ from, to }));
	const ranges: Range<Decoration>[] = [];
	for (const piece of paint(text, tree, selected, classes)) {
		if (piece.kind === 'mark') {
			ranges.push(
				Decoration.mark({ tagName: piece.tag, class: piece.class }).range(piece.from, piece.to),
			);
		} else if (piece.kind === 'hide') {
			ranges.push(Decoration.replace({}).range(piece.from, piece.to));
		} else if (piece.kind === 'line') {
			ranges.push(Decoration.line({ class: piece.class }).range(piece.at));
		} else {
			const widget = new SoftBreak(classes.soft);
			ranges.push(Decoration.widget({ widget, side: -1 }).range(piece.at));
		}
	}
	return Decoration.set(ranges, true);
}

/** The field, and the tree it holds, which the keys read to know what the caret is in. */
export function reading(classes: Drawing) {
	return StateField.define<Reading>({
		create(state) {
			const tree = syntaxTree(state.doc.toString());
			return { tree, decorations: draw(state, tree, classes) };
		},
		update(value, transaction) {
			if (!transaction.docChanged && !transaction.selection) return value;
			const tree = transaction.docChanged
				? syntaxTree(transaction.state.doc.toString())
				: value.tree;
			return { tree, decorations: draw(transaction.state, tree, classes) };
		},
		provide: (field) => EditorView.decorations.from(field, (value) => value.decorations),
	});
}
