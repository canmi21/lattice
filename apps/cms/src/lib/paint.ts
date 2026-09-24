/**
 * What the text looks like: the site's syntax tree turned into instructions for drawing it.
 *
 * The text is the document and is never changed here. The tree says where each construct is, and
 * each becomes paint over those positions: the words of a bold run drawn in `<strong>`, its
 * asterisks hidden unless the selection touches the run, a heading's line set in the heading's
 * type. A function of the text, its tree and the selection, and of nothing else -- which is what
 * lets it be tested without a page. See spec/architecture/local.md, "The editor's document is the
 * markdown text".
 */
import type { Nodes, Parent, Root } from 'mdast';

export type Paint =
	/** Words drawn inside an element, so the article body's own rules style them. */
	| { kind: 'mark'; from: number; to: number; tag: string; class?: string }
	/** Syntax that is not shown while the selection is elsewhere. */
	| { kind: 'hide'; from: number; to: number }
	/** A class on the line that starts at `at`. */
	| { kind: 'line'; at: number; class: string }
	/** A newline the page joins into a space, marked where the line ends. */
	| { kind: 'soft'; at: number };

/** The ranges the author has selected; a caret is a range whose ends meet. */
export type Selected = readonly { from: number; to: number }[];

/** Classes the drawing needs from the page it is drawn on, named rather than written here. */
export type Classes = { heading: (depth: number) => string; link: string };

/** Constructs whose words are wrapped in an element of the same meaning. */
const TAGS: Partial<Record<Nodes['type'], string>> = {
	strong: 'strong',
	emphasis: 'em',
	delete: 'del',
};

const start = (node: Nodes) => node.position!.start.offset!;
const end = (node: Nodes) => node.position!.end.offset!;

/** Whether any selected range meets `[from, to]`, edges included: a caret beside it counts. */
function touched(selected: Selected, from: number, to: number): boolean {
	return selected.some((range) => range.from <= to && range.to >= from);
}

/** The line that holds `at`, as the offset it starts at. */
function lineStart(text: string, at: number): number {
	return text.lastIndexOf('\n', at - 1) + 1;
}

export function paint(text: string, tree: Root, selected: Selected, classes: Classes): Paint[] {
	const out: Paint[] = [];

	/** A construct's delimiters, hidden unless the selection touches the construct. */
	function delimit(node: Nodes, open: number, close: number) {
		if (touched(selected, start(node), end(node))) return;
		if (open > start(node)) out.push({ kind: 'hide', from: start(node), to: open });
		if (end(node) > close) out.push({ kind: 'hide', from: close, to: end(node) });
	}

	function visit(node: Nodes) {
		if (!node.position) return;
		const tag = TAGS[node.type];
		if (tag) {
			const children = (node as Parent).children;
			const open = children.length ? start(children[0]!) : start(node);
			const close = children.length ? end(children.at(-1)!) : end(node);
			out.push({ kind: 'mark', from: open, to: close, tag });
			delimit(node, open, close);
		} else if (node.type === 'inlineCode') {
			const source = text.slice(start(node), end(node));
			const open = start(node) + (/^`+/u.exec(source)?.[0].length ?? 0);
			const close = end(node) - (/`+$/u.exec(source)?.[0].length ?? 0);
			out.push({ kind: 'mark', from: open, to: close, tag: 'code' });
			delimit(node, open, close);
		} else if (node.type === 'link') {
			const children = node.children;
			// An autolink has no brackets: its words are its address.
			const open = children.length ? start(children[0]!) : start(node);
			const close = children.length ? end(children.at(-1)!) : end(node);
			out.push({ kind: 'mark', from: open, to: close, tag: 'a', class: classes.link });
			delimit(node, open, close);
		} else if (node.type === 'heading') {
			const at = lineStart(text, start(node));
			out.push({ kind: 'line', at, class: classes.heading(node.depth) });
			const words = node.children.length ? start(node.children[0]!) : end(node);
			delimit(node, words, node.children.length ? end(node.children.at(-1)!) : end(node));
		} else if (node.type === 'break') {
			// A trailing backslash is a break the author asked for; drawn, it is just the break.
			const source = text.slice(start(node), end(node));
			if (source.startsWith('\\') && !touched(selected, start(node), end(node))) {
				out.push({ kind: 'hide', from: start(node), to: start(node) + 1 });
			}
		} else if (node.type === 'paragraph') {
			softBreaks(node);
		}
		if ('children' in node) for (const child of node.children) visit(child as Nodes);
	}

	/** Every newline in a paragraph that is not a hard break: the page joins those lines. */
	function softBreaks(node: Parent & Nodes) {
		const hard = new Set<number>();
		const code: [number, number][] = [];
		(function collect(parent: Parent) {
			for (const child of parent.children) {
				if (child.type === 'break') hard.add(end(child) - 1);
				if (child.type === 'inlineCode') code.push([start(child), end(child)]);
				if ('children' in child) collect(child);
			}
		})(node);
		for (let at = text.indexOf('\n', start(node)); at >= 0 && at < end(node);) {
			if (!hard.has(at) && !code.some(([from, to]) => at > from && at < to)) {
				out.push({ kind: 'soft', at });
			}
			at = text.indexOf('\n', at + 1);
		}
	}

	for (const child of tree.children) visit(child);
	return out;
}
