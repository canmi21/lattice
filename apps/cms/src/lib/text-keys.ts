/**
 * What Enter and Shift+Enter write. See spec/architecture/local.md, "A line break the author makes
 * is a line break on the page".
 *
 * Enter writes a blank line, which is a new paragraph; Shift+Enter a trailing backslash, which is a
 * break inside one. Inside source that is not prose -- a fence, a directive -- Enter is a plain
 * newline; inside a list it continues the list, and inside a quote the quote.
 */
import type { Line } from '@codemirror/state';
import type { Command, EditorView } from '@codemirror/view';
import type { Nodes, Root } from 'mdast';

/** Constructs whose lines are source rather than prose: a newline there is just a newline. */
const SOURCE = new Set(['code', 'html', 'yaml', 'containerDirective', 'leafDirective', 'table']);

/** A list item's opening, with its indent: `- `, `* `, `1. `, `- [ ] `. */
const ITEM = /^(\s*)([-*+]|(\d+)([.)]))(\s+)(\[[ xX]\]\s+)?/u;

/** A quote's opening, possibly nested: `> `, `> > `. */
const QUOTE = /^(\s*(?:>\s?)+)/u;

/** The constructs that hold `at`, outermost first. */
function around(tree: Root, at: number): Nodes[] {
	const path: Nodes[] = [];
	let children = tree.children as Nodes[];
	for (;;) {
		const next = children.find(
			(node) => node.position!.start.offset! <= at && at <= node.position!.end.offset!,
		);
		if (!next) return path;
		path.push(next);
		if (!('children' in next)) return path;
		children = next.children as Nodes[];
	}
}

/** Ends a list or a quote from its empty last line: a blank line, and the caret after it. */
function leave(view: EditorView, line: Line): boolean {
	view.dispatch({
		changes: { from: line.from, to: line.to, insert: '\n' },
		selection: { anchor: line.from + 1 },
		scrollIntoView: true,
		userEvent: 'input',
	});
	return true;
}

/** Enter, reading the tree the editor already holds to know what the caret is in. */
export function enter(tree: () => Root): Command {
	return (view) => {
		const { state } = view;
		const range = state.selection.main;
		const line = state.doc.lineAt(range.head);
		const before = line.text.slice(0, range.head - line.from);
		const path = around(tree(), range.head);
		let insert = '\n\n';

		if (path.some((node) => SOURCE.has(node.type))) {
			insert = '\n';
		} else if (path.some((node) => node.type === 'list') && ITEM.test(line.text)) {
			const [marker = '', indent = '', , number, closer, gap = ' ', box] = ITEM.exec(line.text)!;
			// An item with nothing after its marker ends the list. The line becomes the blank line
			// that closes it -- without one, the next line would be read as more of the item above.
			if (line.text.slice(marker.length).trim() === '' && range.head >= line.from + marker.length) {
				return leave(view, line);
			}
			const next = number ? `${Number(number) + 1}${closer}` : marker.trim().split(/\s/u)[0];
			insert = `\n${indent}${next}${gap}${box ? '[ ] ' : ''}`;
		} else if (QUOTE.test(before)) {
			const [prefix = ''] = QUOTE.exec(line.text)!;
			if (line.text.slice(prefix.length).trim() === '') return leave(view, line);
			insert = `\n${prefix}`;
		} else if (line.text.trim() === '') {
			// Already on a blank line: one more newline is the paragraph the author asked for.
			insert = '\n';
		}

		view.dispatch(state.replaceSelection(insert), { scrollIntoView: true, userEvent: 'input' });
		return true;
	};
}

/** Shift+Enter: a break inside the paragraph, written as a trailing backslash. */
export const lineBreak: Command = (view) => {
	view.dispatch(view.state.replaceSelection('\\\n'), { scrollIntoView: true, userEvent: 'input' });
	return true;
};
