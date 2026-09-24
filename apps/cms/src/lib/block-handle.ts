/**
 * A handle beside every block, as Notion has one: pressed, it opens the block's menu; dragged, it
 * moves the block between the others.
 *
 * "Block" is a child of the document -- a paragraph, a heading, a list, a custom block -- because
 * that is the unit an article is rearranged in. The handle follows the pointer rather than being
 * drawn beside every block at once, so the page reads as the article until the pointer asks. See
 * spec/architecture/local.md, "Every block has a handle".
 */
import type { Node } from '@milkdown/prose/model';
import { Plugin, PluginKey, TextSelection } from '@milkdown/prose/state';
import type { EditorView } from '@milkdown/prose/view';
import { $prose } from '@milkdown/utils';
import ArrowDown from '@lucide/svelte/icons/arrow-down';
import ArrowUp from '@lucide/svelte/icons/arrow-up';
import Code from '@lucide/svelte/icons/code';
import Copy from '@lucide/svelte/icons/copy';
import Trash from '@lucide/svelte/icons/trash';
import { mount, unmount } from 'svelte';
import BlockGrip from './block-grip.svelte';
import { gripState } from './block-props.svelte';
import ContextMenu, { SEPARATOR, type MenuItem } from './context-menu.svelte';

/** How far left of the text the handle stands, and how far out the pointer may be and keep it. */
const GUTTER = 28;
const REACH = 56;

/** How far a press has to travel before it is a drag rather than a click. */
const SLOP = 4;

/** Blocks whose source is shown while the caret is inside them. See block-views.ts. */
const SOURCED = new Set(['directive_block', 'code_block']);

type Placed = { index: number; at: number; node: Node; dom: HTMLElement; box: DOMRect };

class Handle {
	readonly grip = gripState();
	readonly #view: EditorView;
	readonly #shown: ReturnType<typeof mount>;
	/** The block the handle stands beside. */
	#target: Placed | undefined;
	#menu: ReturnType<typeof mount> | undefined;

	constructor(view: EditorView) {
		this.#view = view;
		this.#shown = mount(BlockGrip, {
			target: document.body,
			props: { grip: this.grip, press: (event: PointerEvent) => this.#press(event) },
		});
		document.addEventListener('mousemove', this.#follow);
		window.addEventListener('scroll', this.#hide, { capture: true, passive: true });
	}

	/** Every block, where it starts in the document and where it is on screen. */
	#placed(): Placed[] {
		const placed: Placed[] = [];
		this.#view.state.doc.forEach((node, at, index) => {
			const dom = this.#view.nodeDOM(at);
			if (dom instanceof HTMLElement) {
				placed.push({ index, at, node, dom, box: dom.getBoundingClientRect() });
			}
		});
		return placed;
	}

	/** The block level with a height on screen, or the nearest one to it. */
	#beside(y: number, placed: Placed[]): Placed | undefined {
		let best: Placed | undefined;
		let distance = Infinity;
		for (const block of placed) {
			const off = y < block.box.top ? block.box.top - y : Math.max(0, y - block.box.bottom);
			if (off < distance) {
				distance = off;
				best = block;
			}
		}
		return best;
	}

	#follow = (event: MouseEvent) => {
		if (this.grip.dragging || this.#menu) return;
		const area = this.#view.dom.getBoundingClientRect();
		const inside =
			event.clientX >= area.left - REACH &&
			event.clientX <= area.right &&
			event.clientY >= area.top &&
			event.clientY <= area.bottom;
		if (!inside) {
			this.#hide();
			return;
		}
		const target = this.#beside(event.clientY, this.#placed());
		if (!target) return;
		this.#target = target;
		// Level with the block's first line, whatever its size: a heading's is taller than prose.
		const style = getComputedStyle(target.dom);
		const line = Number.parseFloat(style.lineHeight) || 24;
		const padding = Number.parseFloat(style.paddingTop) || 0;
		this.grip.top = target.box.top + padding + Math.max(0, (line - 24) / 2);
		this.grip.left = area.left - GUTTER;
		this.grip.shown = true;
	};

	#hide = () => {
		if (this.grip.dragging || this.#menu) return;
		this.grip.shown = false;
	};

	#press(event: PointerEvent) {
		if (event.button !== 0) return;
		const target = this.#target;
		if (!target) return;
		event.preventDefault();
		const startX = event.clientX;
		const startY = event.clientY;
		let drop: number | undefined;

		const move = (moved: PointerEvent) => {
			if (!this.grip.dragging) {
				if (Math.hypot(moved.clientX - startX, moved.clientY - startY) < SLOP) return;
				this.grip.dragging = true;
				target.dom.style.opacity = '0.4';
			}
			const placed = this.#placed();
			drop = placed.findIndex((block) => moved.clientY < block.box.top + block.box.height / 2);
			if (drop < 0) drop = placed.length;
			const area = this.#view.dom.getBoundingClientRect();
			const above = placed[drop - 1]?.box;
			const below = placed[drop]?.box;
			const top = above && below ? (above.bottom + below.top) / 2 : (below?.top ?? above!.bottom);
			this.grip.line = { top, left: area.left, width: area.width };
		};

		const up = () => {
			window.removeEventListener('pointermove', move);
			window.removeEventListener('pointerup', up);
			if (this.grip.dragging) {
				target.dom.style.opacity = '';
				this.grip.dragging = false;
				this.grip.line = null;
				if (drop !== undefined) this.#moveTo(target.index, drop);
				this.grip.shown = false;
			} else {
				this.#open(target);
			}
		};

		window.addEventListener('pointermove', move);
		window.addEventListener('pointerup', up);
	}

	/** Where the block at `index` starts, or the document's end past the last one. */
	#start(index: number): number {
		const { doc } = this.#view.state;
		let at = 0;
		for (let i = 0; i < index && i < doc.childCount; i++) at += doc.child(i).nodeSize;
		return at;
	}

	/** Moves block `from` to stand before what is now block `to`; `childCount` means the end. */
	#moveTo(from: number, to: number) {
		if (to === from || to === from + 1) return;
		const { state } = this.#view;
		const node = state.doc.child(from);
		const start = this.#start(from);
		const landing = this.#start(to);
		const tr = state.tr.delete(start, start + node.nodeSize);
		tr.insert(tr.mapping.map(landing), node);
		this.#view.dispatch(tr.scrollIntoView());
	}

	#open(target: Placed) {
		const { index, node } = target;
		const count = this.#view.state.doc.childCount;
		const at = this.#start(index);
		const items: MenuItem[] = [];
		if (SOURCED.has(node.type.name)) {
			items.push({
				label: 'Edit source',
				icon: Code,
				run: () => {
					const end = at + 1 + node.content.size;
					const { state } = this.#view;
					this.#view.dispatch(state.tr.setSelection(TextSelection.create(state.doc, end)));
					this.#view.focus();
				},
			});
		}
		items.push(
			{
				label: 'Duplicate',
				icon: Copy,
				run: () => {
					const { state } = this.#view;
					this.#view.dispatch(state.tr.insert(at + node.nodeSize, node.copy(node.content)));
				},
			},
			{
				label: 'Move up',
				icon: ArrowUp,
				refused: index === 0 ? 'Already the first block' : undefined,
				run: () => this.#moveTo(index, index - 1),
			},
			{
				label: 'Move down',
				icon: ArrowDown,
				refused: index === count - 1 ? 'Already the last block' : undefined,
				run: () => this.#moveTo(index, index + 2),
			},
			SEPARATOR,
			{
				label: 'Delete',
				icon: Trash,
				danger: true,
				run: () => {
					const { state } = this.#view;
					this.#view.dispatch(state.tr.delete(at, at + node.nodeSize));
				},
			},
		);
		const close = () => {
			if (!this.#menu) return;
			void unmount(this.#menu);
			this.#menu = undefined;
			this.grip.shown = false;
		};
		this.#menu = mount(ContextMenu, {
			target: document.body,
			props: { x: this.grip.left, y: this.grip.top + 28, items, close },
		});
	}

	destroy() {
		document.removeEventListener('mousemove', this.#follow);
		window.removeEventListener('scroll', this.#hide, { capture: true });
		if (this.#menu) void unmount(this.#menu);
		void unmount(this.#shown);
	}
}

export const blockHandle = $prose(
	() =>
		new Plugin({
			key: new PluginKey('block-handle'),
			view: (view) => new Handle(view),
		}),
);
