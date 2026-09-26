/**
 * A block the site draws with a component, drawn with it -- and edited in its own place.
 *
 * The source is compiled by `local` and handed to the article body (block-view.svelte). Pressing the
 * rendering, or asking the block's menu for its source, puts a box of plain source text where the
 * rendering stood, at the height the rendering last had, so nothing around it moves. Source longer
 * than that scrolls inside the box; the page scrolls outside it. The box is the source's only while
 * it has focus: leaving it writes the text back into the document as one change -- one step of the
 * history -- and the block is drawn again, or shows why it cannot be. See
 * spec/architecture/local.md, "A rendered block is edited in its own place".
 */
import { isolateHistory } from '@codemirror/commands';
import { type EditorView, ViewPlugin, WidgetType } from '@codemirror/view';
import { mount, unmount } from 'svelte';
import { blockProps } from './block-props.svelte';
import EdgeFades from '@canmi/prose/components/edge-fades.svelte';
import BlockView from './block-view.svelte';

/** Asked of a rendered block's element to open its source box: the block menu's "Edit source". */
export const EDIT_SOURCE = 'edit-source';

/**
 * The height each block was last drawn at, by where it starts, kept apart from the block's own
 * widget: a block whose source has changed is a new widget, and a refusal draws short, so the box
 * that opens on either takes the height the block last had when it drew.
 */
const heights = new WeakMap<EditorView, Map<number, number>>();

function heightsOf(view: EditorView): Map<number, number> {
	let held = heights.get(view);
	if (!held) {
		held = new Map();
		heights.set(view, held);
	}
	return held;
}

/** Keeps the heights at their blocks as the text around them changes. */
export const renderedHeights = ViewPlugin.define(() => ({
	update(update) {
		if (!update.docChanged) return;
		const held = heightsOf(update.view);
		const moved = new Map<number, number>();
		// A block's start stays before what is written at it: its own source rewritten in place
		// begins where it began.
		for (const [at, height] of held) moved.set(update.changes.mapPos(at, -1), height);
		heights.set(update.view, moved);
	},
}));

type Element = HTMLElement & { unmount?: () => void; resized?: ResizeObserver };

export class Rendered extends WidgetType {
	constructor(
		readonly source: string,
		readonly language: string,
		readonly gap: number,
	) {
		super();
	}

	override eq(other: Rendered) {
		return (
			other.source === this.source && other.language === this.language && other.gap === this.gap
		);
	}

	toDOM(view: EditorView) {
		const dom: Element = document.createElement('div');
		dom.className = 'rendered';
		dom.style.paddingTop = `${this.gap}px`;
		const drawing = document.createElement('div');
		dom.append(drawing);
		const shown = mount(BlockView, {
			target: drawing,
			props: blockProps({ markdown: this.source, language: this.language, selected: false }),
		});
		dom.unmount = () => void unmount(shown);

		// The height it draws at, once it has drawn and not refused. While it is still being
		// compiled it holds the height it last drew at, so a block written back does not fold to
		// a placeholder's line and open again when the answer comes.
		dom.resized = new ResizeObserver(() => {
			const at = view.posAtDOM(dom);
			if (drawing.querySelector('[data-pending]')) {
				const held = heightsOf(view).get(at);
				if (held) drawing.style.minHeight = `${held}px`;
				return;
			}
			drawing.style.minHeight = '';
			const height = drawing.getBoundingClientRect().height;
			if (height > 0 && !drawing.querySelector('[data-refused]')) heightsOf(view).set(at, height);
		});
		dom.resized.observe(drawing);

		dom.addEventListener('mousedown', (event) => {
			if (event.button !== 0 || dom.querySelector('.source')) return;
			event.preventDefault();
			this.#edit(view, dom, drawing);
		});
		dom.addEventListener(EDIT_SOURCE, () => this.#edit(view, dom, drawing));
		return dom;
	}

	#edit(view: EditorView, dom: HTMLElement, drawing: HTMLElement) {
		if (dom.querySelector('.source')) return;
		const at = view.posAtDOM(dom);
		const drawn = drawing.getBoundingClientRect().height;
		// Exactly the height the block last drew at: taller or shorter, the page would move.
		const height = heightsOf(view).get(at) ?? drawn;

		const frame = document.createElement('div');
		frame.className = 'source';
		const box = document.createElement('textarea');
		box.value = this.source;
		box.spellcheck = false;
		box.style.height = `${height}px`;
		box.setAttribute('aria-label', 'Block source');
		frame.append(box);
		// The code block's own edge fades, on all four sides as the code block draws them: the box
		// wraps its lines and scrolls down, and shows no scrollbar, so the fade is where the text is seen to go on.
		const fades = mount(EdgeFades, { target: frame, props: { framed: true } });
		drawing.hidden = true;
		dom.append(frame);
		// Focused where it stands: the browser would otherwise scroll a tall box into view, which
		// is the movement this box exists to avoid.
		box.focus({ preventScroll: true });
		box.setSelectionRange(0, 0);

		const commit = () => {
			window.removeEventListener('pagehide', commit);
			const text = box.value;
			const from = view.posAtDOM(dom);
			const still = view.state.sliceDoc(from, from + this.source.length) === this.source;
			if (text !== this.source && still) {
				// Written back whole: the block is drawn anew from it, and the edit is one step.
				view.dispatch({
					changes: { from, to: from + this.source.length, insert: text },
					userEvent: 'input.source',
					annotations: isolateHistory.of('full'),
				});
				return;
			}
			void unmount(fades);
			frame.remove();
			drawing.hidden = false;
		};

		box.addEventListener('blur', commit, { once: true });
		// A tab closed or navigated away from while the box is open still keeps what was typed.
		window.addEventListener('pagehide', commit);
		box.addEventListener('keydown', (event) => {
			if (event.key === 'Escape') {
				event.preventDefault();
				box.blur();
				view.focus();
			} else if (event.key === 'Tab' && !event.shiftKey) {
				event.preventDefault();
				box.setRangeText('\t', box.selectionStart, box.selectionEnd, 'end');
			}
		});
	}

	override destroy(dom: Element) {
		dom.resized?.disconnect();
		dom.unmount?.();
	}

	// The component and the source box take their own events: a video's controls, the typing.
	override ignoreEvent() {
		return true;
	}

	override get estimatedHeight() {
		return 200;
	}
}
