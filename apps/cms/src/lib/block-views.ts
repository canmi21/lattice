/**
 * The node views that draw a custom block where the document holds one.
 *
 * A block directive -- `::name{...}` or `:::name{...}` with what it wraps -- is one node the author
 * places, selects and deletes as a whole, and the view shows it as the site shows it. The view
 * holds no content of its own: what a container wraps stays in the document, and is written back
 * with it, but is edited through the block rather than as loose paragraphs. See
 * spec/architecture/local.md, "A custom block is drawn in the editor as what it is".
 */
import { serializerCtx } from '@milkdown/core';
import type { Node } from '@milkdown/prose/model';
import type { NodeViewConstructor } from '@milkdown/prose/view';
import { $view } from '@milkdown/utils';
import { mount, unmount } from 'svelte';
import { blockProps } from './block-props.svelte';
import BlockView from './block-view.svelte';
import { containerDirective, leafDirective } from './markdown';

/** A draft's language, read when a block is compiled: descriptions follow the prose's. */
type Language = () => string;

function blockView(language: Language): (serialize: (node: Node) => string) => NodeViewConstructor {
	return (serialize) => (initial) => {
		const dom = document.createElement('div');
		dom.contentEditable = 'false';
		const props = blockProps({
			markdown: serialize(initial),
			language: language(),
			name: String(initial.attrs.name),
			selected: false,
		});
		const shown = mount(BlockView, { target: dom, props });
		return {
			dom,
			update(node) {
				if (node.type !== initial.type) return false;
				const markdown = serialize(node);
				if (markdown !== props.markdown) props.markdown = markdown;
				props.name = String(node.attrs.name);
				return true;
			},
			selectNode() {
				props.selected = true;
			},
			deselectNode() {
				props.selected = false;
			},
			// The component draws and redraws itself; none of that is an edit to the document.
			ignoreMutation: () => true,
			destroy() {
				void unmount(shown);
			},
		};
	};
}

/** Both block forms, drawn through one view. */
export function blockViews(language: Language) {
	const view = blockView(language);
	return [leafDirective, containerDirective].map((schema) =>
		$view(schema.node, (ctx) =>
			view((node) => {
				const doc = node.type.schema.topNodeType.create(null, [node]);
				return ctx.get(serializerCtx)(doc).trim();
			}),
		),
	);
}
