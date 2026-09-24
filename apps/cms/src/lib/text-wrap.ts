/**
 * A syntax character typed over a selection wraps it rather than replacing it, as GitHub's and
 * Obsidian's editors do: select words and type `*` and they are `*words*`, still selected, so a
 * second `*` makes them bold. See spec/architecture/local.md, "Typing over a selection".
 *
 * A wrap just made can be taken back by deleting: Backspace or Delete with the selection it left
 * removes the last layer rather than the words, so a `*` typed once too often goes the way it came.
 * Anything else -- moving the selection, typing, pasting, undoing -- forgets it, and deleting deletes.
 *
 * Only a character typed does this. A paste arrives by another path -- CodeMirror hands typed text
 * to its input handler and a paste to its clipboard handler -- so a paste still replaces what is
 * selected, which is what pasting over a selection means.
 */
import {
	Annotation,
	type ChangeSet,
	EditorSelection,
	type EditorState,
	Prec,
	StateField,
	type TransactionSpec,
} from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';

/** Characters that wrap a selection inside a line, and what closes each. */
const INLINE: Record<string, string> = { '*': '*', _: '_', '~': '~', '`': '`', '[': ']' };

/** The lines a range covers, as their text's start and end, blank lines left out. */
function linesOf(state: EditorState, from: number, to: number) {
	const lines: { from: number; to: number }[] = [];
	for (let at = from; at <= to;) {
		const line = state.doc.lineAt(at);
		const start = Math.max(line.from, from);
		const end = Math.min(line.to, to);
		if (state.sliceDoc(start, end).trim()) lines.push({ from: start, to: end });
		if (line.to >= to) break;
		at = line.to + 1;
	}
	return lines;
}

/** What typing `text` over the selection does instead of replacing it, or nothing. */
export function wrapping(state: EditorState, text: string): TransactionSpec | null {
	if (state.selection.ranges.every((range) => range.empty)) return null;
	const closer = INLINE[text];
	if (closer === undefined && text !== '>') return null;

	return state.changeByRange((range) => {
		if (range.empty) return { range };
		const multiline = state.doc.lineAt(range.from).number !== state.doc.lineAt(range.to).number;

		// A quote: every line the selection touches is quoted, whole.
		if (text === '>') {
			const first = state.doc.lineAt(range.from);
			const last = state.doc.lineAt(range.to);
			const changes = [];
			for (let number = first.number; number <= last.number; number++) {
				changes.push({ from: state.doc.line(number).from, insert: '> ' });
			}
			const added = (last.number - first.number + 1) * 2;
			return { changes, range: EditorSelection.range(first.from, last.to + added) };
		}

		// A backtick over lines is a fence around them.
		if (text === '`' && multiline) {
			const first = state.doc.lineAt(range.from);
			const last = state.doc.lineAt(range.to);
			return {
				changes: [
					{ from: first.from, insert: '```\n' },
					{ from: last.to, insert: '\n```' },
				],
				range: EditorSelection.range(first.from + 4, last.to + 4),
			};
		}

		// Inline syntax cannot cross a paragraph, so each line is wrapped on its own.
		const lines = multiline ? linesOf(state, range.from, range.to) : [range];
		const changes = lines.flatMap((line) => [
			{ from: line.from, insert: text },
			{ from: line.to, insert: closer! },
		]);
		const added = lines.length * (text.length + closer!.length);
		return {
			changes,
			range: EditorSelection.range(range.from + text.length, range.to + added - closer!.length),
		};
	});
}

/** Marks a transaction as a wrap made, or one taken back. */
const layer = Annotation.define<'wrap' | 'unwrap'>();

/** One wrap: how to take it back, and the selections either side of it. */
type Layer = { undo: ChangeSet; before: EditorSelection; after: EditorSelection };

/**
 * The wraps just made, the latest last. Kept only while nothing else happens: any other change to
 * the text or the selection clears it, which is what keeps Backspace's special case narrow.
 */
const layers = StateField.define<Layer[]>({
	create: () => [],
	update(stack, tr) {
		const said = tr.annotation(layer);
		if (said === 'wrap') {
			const undo = tr.changes.invert(tr.startState.doc);
			return [...stack, { undo, before: tr.startState.selection, after: tr.state.selection }];
		}
		if (said === 'unwrap') return stack.slice(0, -1);
		if (tr.docChanged || (tr.selection && !tr.selection.eq(tr.startState.selection))) return [];
		return stack;
	},
});

/** Typing `text` over the selection as a wrap to be remembered, or nothing. */
export function wrap(state: EditorState, text: string): TransactionSpec | null {
	const spec = wrapping(state, text);
	return spec && { ...spec, annotations: layer.of('wrap') };
}

/** Deleting right after a wrap: the last layer taken back, or nothing when there is none. */
export function unwrapping(state: EditorState): TransactionSpec | null {
	const top = state.field(layers, false)?.at(-1);
	if (!top || !state.selection.eq(top.after)) return null;
	return { changes: top.undo, selection: top.before, annotations: layer.of('unwrap') };
}

const unwrap = (view: EditorView) => {
	const spec = unwrapping(view.state);
	if (!spec) return false;
	view.dispatch(spec, { userEvent: 'delete', scrollIntoView: true });
	return true;
};

/** The wrap on typing, and its undoing by Backspace or Delete. */
export const wrapOnType = [
	layers,
	EditorView.inputHandler.of((view, _from, _to, text) => {
		const spec = wrap(view.state, text);
		if (!spec) return false;
		view.dispatch(view.state.update(spec, { userEvent: 'input.type', scrollIntoView: true }));
		return true;
	}),
	// Ahead of the default keymap, whose Backspace deletes the selection.
	Prec.high(
		keymap.of([
			{ key: 'Backspace', run: unwrap },
			{ key: 'Delete', run: unwrap },
		]),
	),
];
