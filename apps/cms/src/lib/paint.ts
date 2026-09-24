/**
 * What the text looks like: the site's syntax tree turned into instructions for drawing it.
 *
 * The text is the document and is never changed here. The tree says where each construct is, and
 * each becomes paint over those positions: the words of a bold run drawn in `<strong>`, its
 * asterisks hidden unless the selection touches the run, a heading's line set in the heading's
 * type, a directive or a fence replaced by the site's rendering until the caret is in it. A
 * function of the text, its tree and the selection, and of nothing else -- which is what lets it be
 * tested without a page. See spec/architecture/local.md, "The editor's document is the markdown
 * text".
 */
import { styleClasses } from '@canmi/compile/style-classes';
import type { Nodes, Parent, Root } from 'mdast';

export type Paint =
	/** Words drawn inside an element, so the article body's own rules style them. */
	| {
			kind: 'mark';
			from: number;
			to: number;
			tag: string;
			class?: string;
			attributes?: Record<string, string>;
	  }
	/** Syntax that is not shown while the selection is elsewhere. */
	| { kind: 'hide'; from: number; to: number }
	/** A class on the line that starts at `at`. */
	| { kind: 'line'; at: number; class: string }
	/** A newline the page joins into a space, marked where the line ends. */
	| { kind: 'soft'; at: number }
	/** A thematic break drawn as the page's rule over its dashes. */
	| { kind: 'rule'; from: number; to: number }
	/** A block replaced by the site's rendering of its source, with the room above it. */
	| { kind: 'block'; from: number; to: number; source: string; gap: number }
	/** A note's number after its words, and what the note says. */
	| { kind: 'note'; at: number; number: number; says: string };

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
	/** The lines of a block while its source is shown. */
	source: { line: string; first: string; last: string };
	/** A `:t` run the page shows at one width only, which the editor shows at every width. */
	only: string;
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

/** A heading's own anchor, `{#slug}`, which the page takes as the slug and does not show. */
const ANCHOR = /\s*\{#[\w-]+\}\s*$/u;

/** Blocks the site draws with a component: shown as that rendering until the caret is in them. */
const RENDERED = new Set(['leafDirective', 'containerDirective', 'code', 'table']);

/** Constructs whose words are wrapped in an element of the same meaning. */
const TAGS: Partial<Record<Nodes['type'], string>> = {
	strong: 'strong',
	emphasis: 'em',
	delete: 'del',
};

/**
 * The classes that decide whether a run is on screen at a width. The page drops a `wide` run on a
 * phone and a `narrow` one elsewhere; the editor drops neither, because a run it hides is one the
 * author cannot reach to edit. It is marked and named instead.
 */
const LAYOUT = new Set(['hidden', 'sm:inline', 'sm:hidden', 'max-sm:block', 'max-sm:mt-4']);

type Attributes = Record<string, string | null | undefined>;

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

/** Every line from the one holding `from` to the one holding `to`, as the offsets they start at. */
function linesOf(text: string, from: number, to: number): number[] {
	const lines: number[] = [];
	for (let at = lineStart(text, from); at <= to;) {
		lines.push(at);
		const next = text.indexOf('\n', at);
		if (next < 0) break;
		at = next + 1;
	}
	return lines;
}

/** The words a construct wraps: from its first child to its last, or nothing between. */
function words(node: Nodes): [number, number] {
	const children = 'children' in node ? (node.children as Nodes[]) : [];
	return children.length
		? [start(children[0]!), end(children.at(-1)!)]
		: [start(node), start(node)];
}

/** The classes a `:t` asks for, less the ones that hide it, or none when a token is unknown. */
function tClasses(attributes: Attributes): string {
	try {
		return styleClasses(attributes, 'editor')
			.filter((name) => !LAYOUT.has(name))
			.join(' ');
	} catch {
		return '';
	}
}

export function paint(text: string, tree: Root, selected: Selected, classes: Classes): Paint[] {
	const out: Paint[] = [];
	let notes = 0;

	/** A construct's delimiters, hidden unless the selection touches the construct. */
	function delimit(node: Nodes, open: number, close: number) {
		if (touched(selected, start(node), end(node))) return;
		if (open > start(node)) out.push({ kind: 'hide', from: start(node), to: open });
		if (end(node) > close) out.push({ kind: 'hide', from: close, to: end(node) });
	}

	/** An inline directive, as the element the compiler writes for it. */
	function directive(node: Nodes & { name: string; attributes?: Attributes | null }) {
		const attributes = node.attributes ?? {};
		const [open, close] = words(node);
		// A directive with no words would vanish with its syntax hidden, so it keeps its source.
		if (open === close) return;
		const note = typeof attributes.is === 'string' ? attributes.is : '';
		const shown = touched(selected, start(node), end(node));
		if (node.name === 'fn') {
			notes += 1;
			out.push({
				kind: 'mark',
				from: open,
				to: close,
				tag: 'span',
				attributes: { 'data-note-words': '' },
			});
			out.push({ kind: 'note', at: end(node), number: notes, says: note });
		} else if (node.name === 'spoiler') {
			// Fogged as the page fogs it, and clear while the caret is in it, or it is typed blind.
			const fog: Record<string, string> = shown ? {} : { 'data-spoiler': '' };
			out.push({
				kind: 'mark',
				from: open,
				to: close,
				tag: 'span',
				class: 'focus-link',
				attributes: fog,
			});
		} else if (node.name === 'link') {
			const to = typeof attributes.to === 'string' ? attributes.to : '';
			out.push({
				kind: 'mark',
				from: open,
				to: close,
				tag: 'span',
				class: classes.link,
				attributes: { title: to },
			});
		} else if (node.name === 'tn') {
			out.push({
				kind: 'mark',
				from: open,
				to: close,
				tag: 'span',
				class: 'underline decoration-dotted underline-offset-4',
				attributes: { title: note },
			});
		} else if (node.name === 't') {
			const only =
				'wide' in attributes
					? 'Shown on wide screens only'
					: 'narrow' in attributes
						? 'Shown on narrow screens only'
						: '';
			const names = [tClasses(attributes), only ? classes.only : ''].filter(Boolean).join(' ');
			out.push({
				kind: 'mark',
				from: open,
				to: close,
				tag: 'span',
				class: names,
				attributes: only ? { title: only } : {},
			});
		} else {
			out.push({ kind: 'mark', from: open, to: close, tag: 'span' });
		}
		delimit(node, open, close);
	}

	function visit(node: Nodes) {
		if (!node.position) return;
		const tag = TAGS[node.type];
		if (tag) {
			const [open, close] = words(node);
			out.push({ kind: 'mark', from: open, to: close, tag });
			delimit(node, open, close);
		} else if (node.type === 'inlineCode') {
			const source = text.slice(start(node), end(node));
			const open = start(node) + (/^`+/u.exec(source)?.[0].length ?? 0);
			const close = end(node) - (/`+$/u.exec(source)?.[0].length ?? 0);
			out.push({ kind: 'mark', from: open, to: close, tag: 'code' });
			delimit(node, open, close);
		} else if (node.type === 'link') {
			// An autolink has no brackets: its words are its address.
			const [open, close] = node.children.length ? words(node) : [start(node), end(node)];
			out.push({ kind: 'mark', from: open, to: close, tag: 'a', class: classes.link });
			delimit(node, open, close);
		} else if (node.type === 'textDirective') {
			directive(node);
		} else if (node.type === 'heading') {
			heading(node);
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

	/** A heading's line in the heading's type, its marker and its anchor hidden off it. */
	function heading(node: Nodes & { depth: number }) {
		out.push({
			kind: 'line',
			at: lineStart(text, start(node)),
			class: classes.heading(node.depth),
		});
		const [open, close] =
			'children' in node && node.children.length ? words(node) : [end(node), end(node)];
		const anchor = ANCHOR.exec(text.slice(open, close))?.[0].length ?? 0;
		delimit(node, open, close - anchor);
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
		const lines = linesOf(text, start(node), end(node));
		lines.forEach((at, index) => {
			const names = [classes.quote.line];
			if (index === 0) names.push(classes.quote.first);
			if (index === lines.length - 1) names.push(classes.quote.last);
			out.push({ kind: 'line', at, class: names.join(' ') });
			const stop = text.indexOf('\n', at);
			const mark = QUOTE_MARK.exec(text.slice(at, stop < 0 ? text.length : stop))?.[0].length ?? 0;
			if (!shown && mark) out.push({ kind: 'hide', from: at, to: at + mark });
		});
	}

	/**
	 * A block the site draws with a component: that rendering while the caret is elsewhere, its
	 * source on a frame while the caret is in it. Nothing inside is painted as prose -- a fence's
	 * asterisks are not emphasis.
	 */
	function rendered(node: Nodes, room: number) {
		const from = lineStart(text, start(node));
		if (!touched(selected, from, end(node))) {
			out.push({
				kind: 'block',
				from,
				to: end(node),
				source: text.slice(from, end(node)),
				gap: room,
			});
			return;
		}
		if (room > 0) out.push({ kind: 'line', at: from, class: classes.gap(room) });
		const lines = linesOf(text, from, end(node));
		lines.forEach((at, index) => {
			const names = [classes.source.line];
			if (index === 0) names.push(classes.source.first);
			if (index === lines.length - 1) names.push(classes.source.last);
			out.push({ kind: 'line', at, class: names.join(' ') });
		});
	}

	// The space between blocks first: a block the site renders carries its room itself, because
	// the lines it replaces are not there to carry a class.
	tree.children.forEach((node, index) => {
		if (!node.position) return;
		let room = 0;
		if (index > 0) {
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
			room = Math.max(0, spaceBefore(previous, node) - (blanks > 0 ? BLANK : 0));
		}
		if (RENDERED.has(node.type)) {
			rendered(node, room);
			return;
		}
		if (room > 0)
			out.push({ kind: 'line', at: lineStart(text, start(node)), class: classes.gap(room) });
		visit(node);
	});
	return out;
}
