/**
 * A syntax character typed over a selection wraps it rather than replacing it, as GitHub's and
 * Obsidian's editors do: select words and type `*` and they are `*words*`, still selected, so a
 * second `*` makes them bold. See spec/architecture/local.md, "Typing over a selection".
 *
 * Only a character typed does this. A paste arrives by another path -- CodeMirror hands typed text
 * to its input handler and a paste to its clipboard handler -- so a paste still replaces what is
 * selected, which is what pasting over a selection means.
 */
import { EditorSelection, type EditorState, type TransactionSpec } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

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

/** The input handler: a typed character over a selection is offered to `wrapping` first. */
export const wrapOnType = EditorView.inputHandler.of((view, _from, _to, text) => {
	const spec = wrapping(view.state, text);
	if (!spec) return false;
	view.dispatch(view.state.update(spec, { userEvent: 'input.type', scrollIntoView: true }));
	return true;
});
