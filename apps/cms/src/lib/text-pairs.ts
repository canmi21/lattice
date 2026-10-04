/**
 * Deleting one side of a mark deletes its other side with it. See spec/architecture/local.md,
 * "Deleting a delimiter deletes its partner".
 *
 * Backspace on the left `*` of `**bold**` leaves `*bold*`, and again leaves `bold`: each step is a
 * mark the parser reads, never half of one. Which delimiter answers which is the parser's answer --
 * the positions in the site's syntax tree -- so nothing is matched by counting characters. A
 * delimiter the parser did not pair is a character like any other and is deleted alone. Adding
 * never pairs: a single `*` may be exactly what the author meant to type.
 */
import type { EditorState, TransactionSpec } from '@codemirror/state';
import type { Nodes, Parent, Root } from 'mdast';

/** Marks whose delimiters pair. A link does not: its other half is its whole address. */
const PAIRED = new Set(['strong', 'emphasis', 'delete', 'inlineCode']);

/** A construct's opening and closing delimiter runs, as `[from, to)` offsets. */
function runs(text: string, node: Nodes): { open: [number, number]; close: [number, number] } {
	const start = node.position!.start.offset!;
	const end = node.position!.end.offset!;
	if (node.type === 'inlineCode') {
		const source = text.slice(start, end);
		const open = start + (/^`+/u.exec(source)?.[0].length ?? 0);
		const close = end - (/`+$/u.exec(source)?.[0].length ?? 0);
		return { open: [start, open], close: [close, end] };
	}
	const children = (node as Parent).children;
	const open = children.length ? children[0]!.position!.start.offset! : start;
	const close = children.length ? children.at(-1)!.position!.end.offset! : end;
	return { open: [start, open], close: [close, end] };
}

/** The character that answers the one at `at`, or none when `at` is not a paired delimiter. */
export function partner(text: string, tree: Root, at: number): number | null {
	let found: number | null = null;
	(function visit(nodes: Nodes[]) {
		for (const node of nodes) {
			if (found !== null || !node.position) continue;
			if (at < node.position.start.offset! || at >= node.position.end.offset!) continue;
			if (PAIRED.has(node.type)) {
				const { open, close } = runs(text, node);
				// Mirrored from the words outward: the innermost `*` of one side answers the
				// innermost of the other.
				if (at >= open[0] && at < open[1]) {
					const other = close[0] + (open[1] - 1 - at);
					if (other < close[1] && text[other] === text[at]) found = other;
					return;
				}
				if (at >= close[0] && at < close[1]) {
					const other = open[1] - 1 - (at - close[0]);
					if (other >= open[0] && text[other] === text[at]) found = other;
					return;
				}
			}
			if ('children' in node) visit(node.children as Nodes[]);
		}
	})(tree.children as Nodes[]);
	return found;
}

/**
 * Backspace (`forward` false) or Delete with the caret beside a paired delimiter: both deleted,
 * as one change and so one undo. Nothing when there is a selection or no partner.
 */
export function pairedDelete(
	state: EditorState,
	tree: Root,
	forward: boolean,
): TransactionSpec | null {
	const range = state.selection.main;
	if (state.selection.ranges.length !== 1 || !range.empty) return null;
	const at = forward ? range.head : range.head - 1;
	if (at < 0 || at >= state.doc.length) return null;
	const text = state.doc.toString();
	const other = partner(text, tree, at);
	if (other === null) return null;
	const [first, second] = at < other ? [at, other] : [other, at];
	const changes = [
		{ from: first, to: first + 1 },
		{ from: second, to: second + 1 },
	];
	// The caret stays where the deleted character was; only the partner before it moves it.
	const head = at - (other < at ? 1 : 0);
	return { changes, selection: { anchor: head }, userEvent: 'delete', scrollIntoView: true };
}
