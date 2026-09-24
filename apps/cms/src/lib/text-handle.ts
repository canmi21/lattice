/**
 * A handle beside every block, as Notion has one: pressed, it opens the block's menu; dragged, it
 * moves the block between the others. See spec/architecture/local.md, "Every block has a handle".
 *
 * It stands level with what the eye takes as the block's start: beside prose, centred on the first
 * line of words; beside a rendered component, level with the component's top edge, since a
 * component has no first line and its room above is not part of it. Across, it stands in one
 * column for every block, left of the text.
 */
import type { Root } from 'mdast';
import type { EditorState } from '@codemirror/state';
import { type EditorView, ViewPlugin } from '@codemirror/view';
import ArrowDown from '@lucide/svelte/icons/arrow-down';
import ArrowUp from '@lucide/svelte/icons/arrow-up';
import Code from '@lucide/svelte/icons/code';
import Copy from '@lucide/svelte/icons/copy';
import Trash from '@lucide/svelte/icons/trash';
import { mount, unmount } from 'svelte';
import BlockGrip from './block-grip.svelte';
import { gripState } from './block-props.svelte';
import { type Island, duplicate, islands, move, remove } from './blocks';
import ContextMenu, { SEPARATOR, type MenuItem } from './context-menu.svelte';

/** How far left of the text the handle stands, and how far out the pointer may be and keep it. */
const GUTTER = 28;
const REACH = 56;

/** The handle's own height, which it is centred by. */
const GRIP = 24;

/** How far below the landing line the outline of what would land there starts. */
const OUTLINE_GAP = 6;

/** How far a press travels before it is a drag rather than a click. */
const SLOP = 4;

/** Within this much of the scroller's edge a drag scrolls it, faster the closer it is. */
const EDGE = 64;

type Placed = Island & { index: number; top: number; bottom: number; mark: number };

/** The rendered component a block is drawn as, when it is drawn as one. */
function rendered(view: EditorView, from: number): HTMLElement | null {
	for (const element of view.contentDOM.querySelectorAll<HTMLElement>('.rendered')) {
		if (view.posAtDOM(element) === from) return element;
	}
	return null;
}

/** Where the first visible words of the line at `from` are drawn, or nothing off screen. */
function firstWords(view: EditorView, from: number): { top: number; bottom: number } | null {
	const node = view.domAtPos(from).node;
	const line = (node instanceof HTMLElement ? node : node.parentElement)?.closest('.cm-line');
	if (!line) return view.coordsAtPos(from, 1);
	const range = document.createRange();
	range.selectNodeContents(line);
	const rect = [...range.getClientRects()].find((box) => box.height > 0 && box.width > 0);
	return rect ?? view.coordsAtPos(from, 1);
}

/** The first scrolling ancestor, which a drag near its edge scrolls. */
function scroller(element: HTMLElement): HTMLElement | null {
	for (let at = element.parentElement; at; at = at.parentElement) {
		const overflow = getComputedStyle(at).overflowY;
		if ((overflow === 'auto' || overflow === 'scroll') && at.scrollHeight > at.clientHeight) {
			return at;
		}
	}
	return null;
}

class Handle {
	readonly grip = gripState();
	readonly #view: EditorView;
	readonly #tree: (state: EditorState) => Root;
	readonly #shown: ReturnType<typeof mount>;
	#target: Placed | undefined;
	#menu: ReturnType<typeof mount> | undefined;

	constructor(view: EditorView, tree: (state: EditorState) => Root) {
		this.#view = view;
		this.#tree = tree;
		this.#shown = mount(BlockGrip, {
			target: document.body,
			props: { grip: this.grip, press: (event: PointerEvent) => this.#press(event) },
		});
		document.addEventListener('mousemove', this.#follow);
		window.addEventListener('scroll', this.#hide, { capture: true, passive: true });
	}

	/** Every block with where it is on screen, and where the handle stands beside it. */
	#placed(): Placed[] {
		const view = this.#view;
		const text = view.state.doc.toString();
		return islands(text, this.#tree(view.state)).flatMap((island, index) => {
			const component = rendered(view, island.from);
			if (component) {
				// The component's own top: the widget's padding is the room above it.
				const box = component.getBoundingClientRect();
				const inner = (component.firstElementChild ?? component).getBoundingClientRect();
				return [{ ...island, index, top: inner.top, bottom: box.bottom, mark: inner.top }];
			}
			// The words as drawn on the first line: its syntax may be hidden -- a heading's `##` --
			// and a position inside what is hidden has no glyph to stand level with.
			const first = firstWords(view, island.from);
			const last = view.coordsAtPos(island.to, -1);
			if (!first || !last) return [];
			const centre = (first.top + first.bottom) / 2;
			return [{ ...island, index, top: first.top, bottom: last.bottom, mark: centre - GRIP / 2 }];
		});
	}

	#follow = (event: MouseEvent) => {
		if (this.grip.dragging || this.#menu) return;
		const area = this.#view.contentDOM.getBoundingClientRect();
		const inside =
			event.clientX >= area.left - REACH &&
			event.clientX <= area.right &&
			event.clientY >= area.top &&
			event.clientY <= area.bottom;
		if (!inside) {
			this.#hide();
			return;
		}
		let best: Placed | undefined;
		let distance = Infinity;
		for (const block of this.#placed()) {
			const off =
				event.clientY < block.top
					? block.top - event.clientY
					: Math.max(0, event.clientY - block.bottom);
			if (off < distance) {
				distance = off;
				best = block;
			}
		}
		if (!best) return;
		this.#target = best;
		this.grip.top = best.mark;
		this.grip.left = area.left - GUTTER;
		this.grip.shown = true;
	};

	#hide = () => {
		if (this.grip.dragging || this.#menu) return;
		this.grip.shown = false;
	};

	/** The block's own elements, which a drag dims while it carries the block. */
	#elements(block: Island): HTMLElement[] {
		const view = this.#view;
		const component = rendered(view, block.from);
		if (component) return [component];
		const lines = new Set<HTMLElement>();
		for (let at = block.from; at <= block.to;) {
			const line = view.state.doc.lineAt(at);
			const node = view.domAtPos(line.from).node;
			const element = (
				node instanceof HTMLElement ? node : node.parentElement
			)?.closest<HTMLElement>('.cm-line');
			if (element) lines.add(element);
			if (line.to >= block.to) break;
			at = line.to + 1;
		}
		return [...lines];
	}

	/**
	 * The room a block takes as drawn, read before it is lifted: from its first line to its last,
	 * or its component's frame, without the room above it that belongs to the gap. The outline a
	 * drag shows is this size, so words and components are carried the same way.
	 */
	#footprint(elements: HTMLElement[]): { width: number; height: number } {
		const first = elements[0];
		const last = elements.at(-1);
		if (!first || !last) return { width: 0, height: 0 };
		if (first.classList.contains('rendered')) {
			const inner = (first.firstElementChild ?? first).getBoundingClientRect();
			return { width: inner.width, height: first.getBoundingClientRect().bottom - inner.top };
		}
		const top =
			first.getBoundingClientRect().top + Number.parseFloat(getComputedStyle(first).paddingTop);
		const bottom =
			last.getBoundingClientRect().bottom - Number.parseFloat(getComputedStyle(last).paddingBottom);
		return { width: first.getBoundingClientRect().width, height: bottom - top };
	}

	#press(event: PointerEvent) {
		if (event.button !== 0) return;
		const target = this.#target;
		if (!target) return;
		event.preventDefault();
		const startX = event.clientX;
		const startY = event.clientY;
		const dimmed = this.#elements(target);
		const size = this.#footprint(dimmed);
		const scrolling = scroller(this.#view.dom);
		let drop: number | undefined;
		let pointer = { x: startX, y: startY };
		let frame = 0;

		const place = () => {
			const placed = this.#placed();
			const index = placed.findIndex((block) => pointer.y < (block.top + block.bottom) / 2);
			// Blocks off screen have no place and are left out, so the end is counted from the
			// last one on screen rather than from how many are.
			drop = index < 0 ? placed.at(-1)!.index + 1 : placed[index]!.index;
			const above = placed[index < 0 ? placed.length - 1 : index - 1];
			const below = index < 0 ? undefined : placed[index];
			const area = this.#view.contentDOM.getBoundingClientRect();
			const top =
				above && below ? (above.bottom + below.top) / 2 : below ? below.top - 8 : above!.bottom + 8;
			this.grip.line = { top, left: area.left, width: area.width };
			// Where it would stand and how much it would take, drawn over what is there: nothing
			// moves until it is let go.
			this.grip.outline = { top: top + OUTLINE_GAP, left: area.left, ...size };
		};

		// Near the scroller's edge the page moves under the hand, so a block can be carried past
		// what is on screen.
		const scroll = () => {
			frame = 0;
			if (!scrolling || !this.grip.dragging) return;
			const box = scrolling.getBoundingClientRect();
			const up = pointer.y - box.top;
			const down = box.bottom - pointer.y;
			const speed = up < EDGE ? -(EDGE - up) / 4 : down < EDGE ? (EDGE - down) / 4 : 0;
			if (speed !== 0) {
				scrolling.scrollTop += speed;
				place();
				frame = requestAnimationFrame(scroll);
			}
		};

		const moved = (next: PointerEvent) => {
			pointer = { x: next.clientX, y: next.clientY };
			if (!this.grip.dragging) {
				if (Math.hypot(next.clientX - startX, next.clientY - startY) < SLOP) return;
				this.grip.dragging = true;
				// The handle stays behind while the block is carried: left up, it would stand beside
				// whatever scrolls under it.
				this.grip.shown = false;
				for (const element of dimmed) element.style.opacity = '0.35';
			}
			place();
			if (!frame) frame = requestAnimationFrame(scroll);
		};

		const up = () => {
			window.removeEventListener('pointermove', moved);
			window.removeEventListener('pointerup', up);
			if (frame) cancelAnimationFrame(frame);
			if (this.grip.dragging) {
				for (const element of dimmed) element.style.opacity = '';
				this.grip.dragging = false;
				this.grip.line = null;
				this.grip.outline = null;
				this.grip.shown = false;
				if (drop !== undefined) this.#moveTo(target.index, drop);
			} else {
				this.#open(target);
			}
		};

		window.addEventListener('pointermove', moved);
		window.addEventListener('pointerup', up);
	}

	#list(): Island[] {
		return islands(this.#view.state.doc.toString(), this.#tree(this.#view.state));
	}

	#moveTo(from: number, to: number) {
		const view = this.#view;
		const done = move(view.state.doc.toString(), this.#list(), from, to);
		if (!done) return;
		const change = view.state.changes(done.changes);
		// The caret goes with the block, so the one just moved is the one being looked at.
		const at = change.mapPos(done.at, 1);
		view.dispatch({ changes: change, selection: { anchor: at }, scrollIntoView: true });
	}

	#open(target: Placed) {
		const view = this.#view;
		const list = this.#list();
		const { index } = target;
		const block = list[index];
		if (!block) return;
		const text = view.state.doc.toString();
		const items: MenuItem[] = [];
		if (block.sourced) {
			items.push({
				label: 'Edit source',
				icon: Code,
				run: () => {
					view.dispatch({ selection: { anchor: block.from }, scrollIntoView: true });
					view.focus();
				},
			});
		}
		items.push(
			{
				label: 'Duplicate',
				icon: Copy,
				run: () => {
					const change = duplicate(text, list, index);
					if (change) view.dispatch({ changes: change });
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
				refused: index === list.length - 1 ? 'Already the last block' : undefined,
				run: () => this.#moveTo(index, index + 2),
			},
			SEPARATOR,
			{
				label: 'Delete',
				icon: Trash,
				danger: true,
				run: () => {
					const change = remove(list, index);
					if (change) view.dispatch({ changes: change });
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
			props: { x: this.grip.left, y: this.grip.top + GRIP + 4, items, close },
		});
	}

	destroy() {
		document.removeEventListener('mousemove', this.#follow);
		window.removeEventListener('scroll', this.#hide, { capture: true });
		if (this.#menu) void unmount(this.#menu);
		void unmount(this.#shown);
	}
}

/** The handle, reading blocks from the tree the editor already holds. */
export function blockHandle(tree: (state: EditorState) => Root) {
	return ViewPlugin.define((view) => new Handle(view, tree));
}
