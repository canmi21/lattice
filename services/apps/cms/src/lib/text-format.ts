/**
 * Setting a mark on a selection, from the keys or from the bar over it: bold, italic, strike, code.
 *
 * A toggle, and the parser says which way: when the selection lies inside a run of that mark, the
 * run's delimiters are taken off; otherwise the selection is wrapped in them. Over several lines
 * each line is wrapped on its own, since inline syntax cannot cross a paragraph. See
 * spec/architecture/local.md, "Every block has a handle, and a selection a bar".
 */
import { EditorSelection, type EditorState, type TransactionSpec } from '@codemirror/state';
import type { Nodes, Parent, Root } from 'mdast';

/** The marks the bar and the keys set, by their node in the syntax tree, and what writes each. */
export const MARKERS = {
	strong: '**',
	emphasis: '*',
	delete: '~~',
	inlineCode: '`',
} as const;

export type Mark = keyof typeof MARKERS;

type Run = { start: number; end: number; open: number; close: number };

/** Every run of `type` holding the whole of `[from, to]` between its delimiters, innermost last. */
function runs(text: string, tree: Root, type: Mark, from: number, to: number): Run[] {
	const found: Run[] = [];
	(function visit(nodes: Nodes[]) {
		for (const node of nodes) {
			if (!node.position) continue;
			const start = node.position.start.offset!;
			const end = node.position.end.offset!;
			if (end < from || start > to) continue;
			if (node.type === type) {
				let open: number;
				let close: number;
				if (node.type === 'inlineCode') {
					const source = text.slice(start, end);
					open = start + (/^`+/u.exec(source)?.[0].length ?? 0);
					close = end - (/`+$/u.exec(source)?.[0].length ?? 0);
				} else {
					const children = (node as Parent).children;
					open = children.length ? children[0]!.position!.start.offset! : start;
					close = children.length ? children.at(-1)!.position!.end.offset! : end;
				}
				if (from >= open && to <= close) found.push({ start, end, open, close });
			}
			if ('children' in node) visit(node.children as Nodes[]);
		}
	})(tree.children as Nodes[]);
	return found;
}

/** The marks the selection is inside, for the bar to show as set. */
export function marksAt(state: EditorState, tree: Root): Mark[] {
	const { from, to } = state.selection.main;
	const text = state.doc.toString();
	return (Object.keys(MARKERS) as Mark[]).filter(
		(type) => runs(text, tree, type, from, to).length > 0,
	);
}

/** Setting or taking off `type` over the selection, or nothing when nothing is selected. */
export function toggle(state: EditorState, tree: Root, type: Mark): TransactionSpec | null {
	const range = state.selection.main;
	if (range.empty) return null;
	const text = state.doc.toString();
	const inside = runs(text, tree, type, range.from, range.to).at(-1);
	if (inside) {
		const opening = inside.open - inside.start;
		return {
			changes: [
				{ from: inside.start, to: inside.open },
				{ from: inside.close, to: inside.end },
			],
			selection: EditorSelection.range(range.from - opening, range.to - opening),
			userEvent: 'input.format',
		};
	}
	const marker = MARKERS[type];
	const lines: { from: number; to: number }[] = [];
	for (let at = range.from; at <= range.to;) {
		const line = state.doc.lineAt(at);
		const from = Math.max(line.from, range.from);
		const to = Math.min(line.to, range.to);
		if (state.sliceDoc(from, to).trim()) lines.push({ from, to });
		if (line.to >= range.to) break;
		at = line.to + 1;
	}
	const added = lines.length * marker.length * 2;
	return {
		changes: lines.flatMap((line) => [
			{ from: line.from, insert: marker },
			{ from: line.to, insert: marker },
		]),
		selection: EditorSelection.range(range.from + marker.length, range.to + added - marker.length),
		userEvent: 'input.format',
	};
}
