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
	| { kind: 'soft'; at: number }
	/** A thematic break drawn as the page's rule over its dashes. */
	| { kind: 'rule'; from: number; to: number };

/** The ranges the author has selected; a caret is a range whose ends meet. */
export type Selected = readonly { from: number; to: number }[];

/** Classes the drawing needs from the page it is drawn on, named rather than written here. */
export type Classes = {
	heading: (depth: number) => string;
	link: string;
	/** Room above a block's first line, in pixels, beyond what a blank line gives. */
	gap: (pixels: number) => string;
	/** A blank line between blocks, which is the page's space between two of them. */
	blank: string;
	quote: { line: string; first: string; last: string };
	/** The line a drawn rule stands on, which is only as tall as the rule. */
	rule: string;
};

/**
 * The page's space between blocks, measured on the preview: 16 between most, 48 above a section
 * heading, 32 above a subsection, 40 either side of a rule. A blank line is drawn 16 high, so it is
 * the space between two paragraphs, and a block needing more takes the rest above its first line.
 */
export const BLANK = 16;

function spaceBefore(previous: Nodes, node: Nodes): number {
	if (node.type === 'heading') return node.depth === 2 ? 48 : 32;
	if (node.type === 'thematicBreak' || previous.type === 'thematicBreak') return 40;
	return BLANK;
}

/** A quote's marker on one of its lines: `>` and the space after it. */
const QUOTE_MARK = /^[ \t]*>[ \t]?/u;

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
		} else if (node.type === 'blockquote') {
			quote(node);
		} else if (node.type === 'thematicBreak') {
			if (!touched(selected, start(node), end(node))) {
				out.push({ kind: 'rule', from: start(node), to: end(node) });
				out.push({ kind: 'line', at: lineStart(text, start(node)), class: classes.rule });
			}
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

	/** Every line of a quote on the quote's ground, its markers hidden unless the caret is in it. */
	function quote(node: Nodes) {
		const shown = touched(selected, start(node), end(node));
		const first = lineStart(text, start(node));
		for (let at = first; at <= end(node);) {
			const next = text.indexOf('\n', at);
			const stop = next < 0 ? text.length : next;
			const names = [classes.quote.line];
			if (at === first) names.push(classes.quote.first);
			if (next < 0 || next >= end(node)) names.push(classes.quote.last);
			out.push({ kind: 'line', at, class: names.join(' ') });
			const mark = QUOTE_MARK.exec(text.slice(at, stop))?.[0].length ?? 0;
			if (!shown && mark) out.push({ kind: 'hide', from: at, to: at + mark });
			if (next < 0) break;
			at = next + 1;
		}
	}

	/** The space between blocks: blank lines drawn as the page's gap, and room above where it asks more. */
	function layout() {
		tree.children.forEach((node, index) => {
			if (index === 0 || !node.position) return;
			const previous = tree.children[index - 1]!;
			let blanks = 0;
			for (let at = text.indexOf('\n', end(previous)) + 1; at > 0 && at < start(node);) {
				const next = text.indexOf('\n', at);
				if (next < 0 || next >= start(node)) break;
				if (text.slice(at, next).trim() === '') {
					out.push({ kind: 'line', at, class: classes.blank });
					blanks += 1;
				}
				at = next + 1;
			}
			const room = spaceBefore(previous, node) - (blanks > 0 ? BLANK : 0);
			if (room > 0)
				out.push({ kind: 'line', at: lineStart(text, start(node)), class: classes.gap(room) });
		});
	}

	for (const child of tree.children) visit(child);
	layout();
	return out;
}
