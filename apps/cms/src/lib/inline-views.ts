/**
 * Inline directives drawn the way the page draws them, with their words still typed in place.
 *
 * Each one mirrors what the compiler writes for it -- the same element, the same data attribute
 * or class -- so the rules the article body already carries apply here unchanged: a spoiler is
 * fogged, a note's words are followed by its number, a `:t` run takes the classes its tokens ask
 * for. What the directive says beyond its words, a note's text or a link's target, is shown on
 * hover and not yet edited here. See spec/architecture/local.md, "Inline directives are drawn".
 */
import { styleClasses } from '@canmi/compile/style-classes';
import type { Node } from '@milkdown/prose/model';
import { Plugin, PluginKey } from '@milkdown/prose/state';
import { Decoration, DecorationSet, type NodeViewConstructor } from '@milkdown/prose/view';
import { $prose, $view } from '@milkdown/utils';
import { textDirective } from './markdown';

type Attributes = Record<string, string | null | undefined>;

/** A note's number and whether the caret is in the directive, as decorations its view reads. */
type Said = { number?: number; editing?: boolean };

/**
 * Numbers every `:fn` in document order and marks the directive the caret is in. Decorations,
 * because a note added early renumbers every note after it, and a view hears of that only
 * through them.
 */
const inlineState = $prose(
	() =>
		new Plugin({
			key: new PluginKey('inline-directives'),
			props: {
				decorations(state) {
					const found: Decoration[] = [];
					let number = 0;
					state.doc.descendants((node, at) => {
						if (node.type.name === 'text_directive' && node.attrs.name === 'fn') {
							number += 1;
							found.push(Decoration.node(at, at + node.nodeSize, {}, { number }));
						}
					});
					const { $from } = state.selection;
					for (let depth = $from.depth; depth > 0; depth--) {
						if ($from.node(depth).type.name !== 'text_directive') continue;
						const at = $from.before(depth);
						found.push(Decoration.node(at, at + $from.node(depth).nodeSize, {}, { editing: true }));
					}
					return DecorationSet.create(state.doc, found);
				},
			},
		}),
);

function said(decorations: readonly Decoration[]): Said {
	const out: Said = {};
	for (const decoration of decorations) Object.assign(out, decoration.spec as Said);
	return out;
}

/**
 * The classes that decide whether a run is on screen at a width. The page drops a `wide` run on a
 * phone and a `narrow` one elsewhere; the editor drops neither, because a run it hides is one the
 * author cannot reach to edit. It is marked and named instead.
 */
const LAYOUT = new Set(['hidden', 'sm:inline', 'sm:hidden', 'max-sm:block', 'max-sm:mt-4']);

const ONLY = { wide: 'Shown on wide screens only', narrow: 'Shown on narrow screens only' };

/** The classes a `:t` asks for, or none when a token is one the table does not know. */
function tClasses(attributes: Attributes): string {
	try {
		return styleClasses(attributes, 'editor')
			.filter((name) => !LAYOUT.has(name))
			.join(' ');
	} catch {
		return '';
	}
}

const view: NodeViewConstructor = (initial, _view, _getPos, decorations) => {
	const name = String(initial.attrs.name);
	const attributes = initial.attrs.attributes as Attributes;
	const note = typeof attributes.is === 'string' ? attributes.is : undefined;

	const dom = document.createElement('span');
	let contentDOM: HTMLElement = dom;
	let marker: HTMLAnchorElement | undefined;

	if (name === 'spoiler') {
		dom.dataset.spoiler = '';
		dom.className = 'focus-link';
	} else if (name === 'fn') {
		const words = document.createElement('span');
		words.dataset.noteWords = '';
		const sup = document.createElement('sup');
		sup.dataset.noteMarker = '';
		sup.contentEditable = 'false';
		marker = document.createElement('a');
		marker.dataset.noteMarkerLink = '';
		if (note) marker.title = note;
		sup.append(marker);
		dom.append(words, sup);
		contentDOM = words;
	} else if (name === 'link') {
		dom.className = 'spring-underline article-link text-text-strong';
		const to = attributes.to;
		if (typeof to === 'string') dom.title = to;
	} else if (name === 'tn') {
		dom.className = 'underline decoration-dotted underline-offset-4';
		if (note) dom.title = note;
	} else if (name === 't') {
		const only = 'wide' in attributes ? ONLY.wide : 'narrow' in attributes ? ONLY.narrow : '';
		dom.className = tClasses(attributes);
		if (only) {
			dom.classList.add('underline', 'decoration-dashed', 'underline-offset-4');
			dom.title = only;
		}
	}

	function show(from: readonly Decoration[]) {
		const { number, editing } = said(from);
		if (marker) marker.textContent = String(number ?? '');
		// A fogged run is lifted while the caret is in it, or its words are typed blind.
		if (name === 'spoiler') dom.style.filter = editing ? 'none' : '';
	}
	show(decorations);

	return {
		dom,
		contentDOM,
		update(node: Node, next) {
			if (node.type !== initial.type || node.attrs.name !== name) return false;
			if (JSON.stringify(node.attrs.attributes) !== JSON.stringify(attributes)) return false;
			show(next);
			return true;
		},
		ignoreMutation: (mutation) =>
			mutation.type !== 'selection' && !!marker && marker.contains(mutation.target),
	};
};

export const inlineViews = [inlineState, $view(textDirective.node, () => view)];
