/**
 * The article as a list of blocks, and what the handle does to one: move, duplicate, delete.
 *
 * A block is an island -- a child of the syntax tree's root, whole lines from the one it starts on
 * to the one it ends on. See spec/architecture/local.md, "What a block is has a standard". Every
 * operation is a change to the text, and moves the blank line that separates a block from the next
 * along with it, so two blocks never end up run together into one paragraph.
 */
import type { ChangeSpec } from '@codemirror/state';
import type { Nodes, Root } from 'mdast';

export type Island = {
	/** Where the block's first line starts, and where its last character ends. */
	from: number;
	to: number;
	/** What the block is, for the card a drag carries: `paragraph`, `heading`, `image`, `code`... */
	kind: string;
	/** The first words of it, or the name of what it is. */
	label: string;
};

/** How much of a block a drag's card shows. */
const LABEL = 48;

function describe(node: Nodes, source: string): { kind: string; label: string } {
	const first = source.split('\n')[0] ?? '';
	if (node.type === 'leafDirective' || node.type === 'containerDirective') {
		return { kind: node.name, label: `::${node.name}` };
	}
	if (node.type === 'code') {
		return { kind: 'code', label: node.lang ? `Code · ${node.lang}` : 'Code' };
	}
	if (node.type === 'table') return { kind: 'table', label: 'Table' };
	if (node.type === 'thematicBreak') return { kind: 'rule', label: 'Rule' };
	// Prose reads as its words: the syntax around them is left off the card.
	const words = first
		.replace(/^\s*(?:#{1,6}\s+|>\s?|[-*+]\s+|\d+[.)]\s+)/u, '')
		.replace(/[*_~`]/gu, '');
	const label = words.length > LABEL ? `${words.slice(0, LABEL)}…` : words;
	return { kind: node.type, label };
}

/** Every block in the text, in order. */
export function islands(text: string, tree: Root): Island[] {
	return tree.children.flatMap((node) => {
		if (!node.position) return [];
		const from = text.lastIndexOf('\n', node.position.start.offset! - 1) + 1;
		const to = node.position.end.offset!;
		return [{ from, to, ...describe(node, text.slice(from, to)) }];
	});
}

/** What taking block `index` out of the text removes: the block, and one side's separation. */
function taken(list: readonly Island[], index: number): { from: number; to: number } | null {
	const block = list[index];
	if (!block) return null;
	const next = list[index + 1];
	if (next) return { from: block.from, to: next.from };
	const previous = list[index - 1];
	if (previous) return { from: previous.to, to: block.to };
	return null;
}

/**
 * Moving block `from` to stand before block `to`; `to` equal to the count means after the last.
 * The changes are in the text's positions before the move, and `at` is where the moved block's
 * text is inserted, for the caller to map. Nothing when the block would land where it is.
 */
export function move(
	text: string,
	list: readonly Island[],
	from: number,
	to: number,
): { changes: ChangeSpec[]; at: number } | null {
	if (to === from || to === from + 1) return null;
	const out = taken(list, from);
	const block = list[from];
	if (!out || !block) return null;
	const source = text.slice(block.from, block.to);
	const landing = list[to];
	const insert = landing
		? { from: landing.from, insert: `${source}\n\n` }
		: { from: list.at(-1)!.to, insert: `\n\n${source}` };
	return {
		changes: [{ from: out.from, to: out.to }, insert],
		at: insert.from,
	};
}

/** A copy of block `index` after it. */
export function duplicate(text: string, list: readonly Island[], index: number): ChangeSpec | null {
	const block = list[index];
	if (!block) return null;
	return { from: block.to, insert: `\n\n${text.slice(block.from, block.to)}` };
}

/** Block `index` gone, with the separation it leaves. */
export function remove(list: readonly Island[], index: number): ChangeSpec | null {
	const out = taken(list, index);
	if (out) return out;
	// The only block: its text goes and the document is empty.
	const block = list[index];
	return block ? { from: block.from, to: block.to } : null;
}
