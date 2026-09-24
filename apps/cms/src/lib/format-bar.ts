/**
 * A bar over a selection of prose that sets its marks: bold, italic, strike, code.
 *
 * A mark is set by a command, never typed, so how marks nest is the program's to get right and
 * not the author's. The same marks are on their keys already; the bar is where they can be seen.
 * See spec/architecture/local.md, "A sentence's marks are set, and shown as source where the caret
 * is".
 */
import { toggleMark } from '@milkdown/prose/commands';
import { Plugin, PluginKey, TextSelection } from '@milkdown/prose/state';
import type { EditorView } from '@milkdown/prose/view';
import { $prose } from '@milkdown/utils';
import { mount, unmount } from 'svelte';
import { formatState } from './block-props.svelte';
import { inlineSourceKey } from './inline-source';
import FormatBar, { FORMATS } from './format-bar.svelte';

/** How far above the selection the bar floats. */
const LIFT = 8;

class Bar {
	readonly format = formatState();
	readonly #view: EditorView;
	readonly #shown: ReturnType<typeof mount>;

	constructor(view: EditorView) {
		this.#view = view;
		this.#shown = mount(FormatBar, {
			target: document.body,
			props: { format: this.format, apply: (mark: string) => this.#apply(mark) },
		});
		// Losing focus hides the bar, and a view is not told of that through `update`.
		view.dom.addEventListener('blur', this.#hide);
		this.update(view);
	}

	#hide = () => {
		this.format.shown = false;
	};

	#apply(name: string) {
		const type = this.#view.state.schema.marks[name];
		if (!type) return;
		toggleMark(type)(this.#view.state, this.#view.dispatch);
		this.#view.focus();
	}

	update(view: EditorView) {
		const { selection, schema } = view.state;
		const prose =
			selection instanceof TextSelection &&
			!selection.empty &&
			selection.$from.parent.inlineContent &&
			!selection.$from.parent.type.spec.code;
		// Inside open source the asterisks are text; a mark set there would be lost on reading back.
		const opened = inlineSourceKey.getState(view.state);
		const inSource = !!opened && selection.to > opened.from && selection.from < opened.to;
		if (!prose || inSource || view.composing || !view.hasFocus()) {
			this.format.shown = false;
			return;
		}
		const start = view.coordsAtPos(selection.from);
		const end = view.coordsAtPos(selection.to);
		this.format.top = Math.min(start.top, end.top) - LIFT;
		this.format.left = start.top === end.top ? (start.left + end.right) / 2 : start.left;
		this.format.active = FORMATS.map(({ mark }) => mark).filter((mark) => {
			const type = schema.marks[mark];
			return type ? view.state.doc.rangeHasMark(selection.from, selection.to, type) : false;
		});
		this.format.shown = true;
	}

	destroy() {
		this.#view.dom.removeEventListener('blur', this.#hide);
		void unmount(this.#shown);
	}
}

export const formatBar = $prose(
	() =>
		new Plugin({
			key: new PluginKey('format-bar'),
			view: (view) => new Bar(view),
		}),
);
