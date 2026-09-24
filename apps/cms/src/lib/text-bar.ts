/**
 * The bar over a selection of prose: bold, italic, strike, code, as the keys set them.
 *
 * It stands centred over a selection on one line and at the start of one across lines, and shows
 * only while the editor has focus and the selection is prose -- not inside a block whose source is
 * open, where an asterisk is not emphasis. See spec/architecture/local.md, "Every block has a
 * handle, and a selection a bar".
 */
import type { EditorState } from '@codemirror/state';
import { type EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view';
import type { Nodes, Root } from 'mdast';
import { mount, unmount } from 'svelte';
import { formatState } from './block-props.svelte';
import FormatBar from './format-bar.svelte';
import { type Mark, marksAt, toggle } from './text-format';

/** How far above the selection the bar floats. */
const LIFT = 8;

/** Blocks whose lines are source rather than prose. */
const SOURCE = new Set(['code', 'html', 'yaml', 'containerDirective', 'leafDirective', 'table']);

/** Whether `[from, to]` lies in prose: in no block whose lines are source. */
function prose(tree: Root, from: number, to: number): boolean {
	return !(tree.children as Nodes[]).some(
		(node) =>
			SOURCE.has(node.type) &&
			node.position!.start.offset! <= to &&
			node.position!.end.offset! >= from,
	);
}

/** Toggling a mark over the selection: what the bar's buttons and the keys both run. */
export function format(tree: (state: EditorState) => Root, mark: Mark) {
	return (view: EditorView) => {
		const spec = toggle(view.state, tree(view.state), mark);
		if (!spec) return false;
		view.dispatch(spec);
		return true;
	};
}

class Bar {
	readonly format = formatState();
	readonly #view: EditorView;
	readonly #tree: (state: EditorState) => Root;
	readonly #shown: ReturnType<typeof mount>;

	constructor(view: EditorView, tree: (state: EditorState) => Root) {
		this.#view = view;
		this.#tree = tree;
		this.#shown = mount(FormatBar, {
			target: document.body,
			props: {
				format: this.format,
				apply: (mark: Mark) => {
					format(tree, mark)(this.#view);
					this.#view.focus();
				},
			},
		});
		this.#place();
	}

	update(update: ViewUpdate) {
		if (update.selectionSet || update.docChanged || update.focusChanged || update.geometryChanged) {
			this.#place();
		}
	}

	/**
	 * Where the bar goes, measured in CodeMirror's read phase: an update may not read the layout,
	 * and asking it to measure is how a plugin reads it after the update is drawn.
	 */
	#place() {
		const view = this.#view;
		view.requestMeasure({
			key: this,
			read: () => {
				const { from, to, empty } = view.state.selection.main;
				const tree = this.#tree(view.state);
				if (empty || !view.hasFocus || view.composing || !prose(tree, from, to)) return null;
				const start = view.coordsAtPos(from, 1);
				const end = view.coordsAtPos(to, -1);
				if (!start || !end) return null;
				return {
					top: Math.min(start.top, end.top) - LIFT,
					left: start.top === end.top ? (start.left + end.right) / 2 : start.left,
					active: marksAt(view.state, tree),
				};
			},
			write: (placed) => {
				if (!placed) {
					this.format.shown = false;
					return;
				}
				this.format.top = placed.top;
				this.format.left = placed.left;
				this.format.active = placed.active;
				this.format.shown = true;
			},
		});
	}

	destroy() {
		void unmount(this.#shown);
	}
}

/** The bar, reading the tree the editor already holds. */
export function formatBar(tree: (state: EditorState) => Root) {
	return ViewPlugin.define((view) => new Bar(view, tree));
}
