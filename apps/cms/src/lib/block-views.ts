/**
 * Custom blocks drawn as the site draws them, and edited as the markdown they are.
 *
 * A block directive and a fence are both text in the document. While the caret is elsewhere the
 * block shows its rendering -- the component the site draws, compiled by `local` -- and the moment
 * the caret is inside it, it shows its source instead, and goes back when the caret leaves. That
 * is Obsidian's live preview, and it is chosen for the same reason: the page reads as the article,
 * and editing never needs a second surface. See spec/architecture/local.md, "A custom block is
 * drawn in the editor as what it is".
 */
import { serializerCtx } from '@milkdown/core';
import type { Node } from '@milkdown/prose/model';
import { Plugin, PluginKey, TextSelection } from '@milkdown/prose/state';
import { Decoration, DecorationSet, type NodeViewConstructor } from '@milkdown/prose/view';
import { $prose, $view } from '@milkdown/utils';
import { mount, unmount } from 'svelte';
import { blockProps } from './block-props.svelte';
import BlockView from './block-view.svelte';
import { directiveBlock, fence } from './markdown';

/** A draft's language, read when a block is compiled: descriptions follow the prose's. */
type Language = () => string;

/** The node types drawn this way. */
const DRAWN = new Set(['directive_block', 'code_block']);

/** What marks a block as the one being edited, read by its view. */
const EDITING = { editing: true };

/**
 * The block the caret is in, marked with a decoration its view reads. A decoration rather than
 * each view asking, because a view is told when its decorations change and is told nothing when
 * the caret merely moves.
 */
const editing = $prose(
	() =>
		new Plugin({
			key: new PluginKey('editing-block'),
			props: {
				decorations(state) {
					const { $from } = state.selection;
					for (let depth = $from.depth; depth > 0; depth--) {
						const node = $from.node(depth);
						if (!DRAWN.has(node.type.name)) continue;
						const at = $from.before(depth);
						return DecorationSet.create(state.doc, [
							Decoration.node(at, at + node.nodeSize, {}, EDITING),
						]);
					}
					return DecorationSet.empty;
				},
			},
		}),
);

function drawn(
	language: Language,
	serialize: (node: Node) => string,
	source: string,
): NodeViewConstructor {
	return (initial, view, getPos) => {
		const dom = document.createElement('div');
		const preview = document.createElement('div');
		preview.contentEditable = 'false';
		const pre = document.createElement('pre');
		pre.className = source;
		const code = document.createElement('code');
		pre.append(code);
		// A fence's opening line, shown over its source: the language and parameters are the
		// node's attributes rather than its text, so they are read here and not typed.
		const info = document.createElement('div');
		info.contentEditable = 'false';
		info.className = 'px-1 pb-1 font-mono text-xs text-(--color-text-muted)';
		dom.append(preview, info, pre);

		const props = blockProps({
			markdown: serialize(initial),
			language: language(),
			selected: false,
		});
		const shown = mount(BlockView, { target: preview, props });

		// Pressing the rendering puts the caret at the end of the source, which is what turns it
		// into the source.
		preview.addEventListener('mousedown', (event) => {
			if (event.button !== 0) return;
			const at = getPos();
			if (at === undefined) return;
			event.preventDefault();
			const node = view.state.doc.nodeAt(at);
			const end = at + 1 + (node?.content.size ?? 0);
			view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, end)));
			view.focus();
		});

		function show(node: Node, isEditing: boolean) {
			pre.hidden = !isEditing;
			preview.hidden = isEditing;
			const opening = [node.attrs.language, node.attrs.meta].filter(Boolean).join(' ');
			info.textContent = `\`\`\`${opening}`;
			info.hidden = !isEditing || node.type.name !== 'code_block';
			// Compiled only once the caret has left: a block is not recompiled on every keystroke.
			if (!isEditing) props.markdown = serialize(node);
		}
		show(initial, false);

		return {
			dom,
			contentDOM: code,
			update(node, decorations) {
				if (node.type !== initial.type) return false;
				show(
					node,
					decorations.some((decoration) => decoration.spec.editing === true),
				);
				return true;
			},
			selectNode() {
				props.selected = true;
			},
			deselectNode() {
				props.selected = false;
			},
			// The rendering redraws itself; only the source is the document.
			ignoreMutation: (mutation) => !code.contains(mutation.target),
			stopEvent: (event) => preview.contains(event.target as globalThis.Node | null),
			destroy() {
				void unmount(shown);
			},
		};
	};
}

/** The views, the plugin that says which block is being edited, and the source's frame class. */
export function blockViews(language: Language, source: string) {
	return [
		editing,
		...[directiveBlock, fence].map((schema) =>
			$view(schema.node, (ctx) =>
				drawn(
					language,
					(node) => {
						const doc = node.type.schema.topNodeType.create(null, [node]);
						return ctx.get(serializerCtx)(doc).trim();
					},
					source,
				),
			),
		),
	];
}
