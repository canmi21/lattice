<script lang="ts">
	/**
	 * Milkdown, mounted once and told nothing afterwards.
	 *
	 * The editor owns the document while it is open: `markdown` is read to seed it and never
	 * written back into it, because an editor that re-seeds on every keystroke moves the caret.
	 * What comes out goes up through `onChange`, and the page decides when that becomes a row.
	 *
	 * It is set in the article's own typography rather than a theme of Milkdown's: the prose sits
	 * under the root the article body sits under, and the nodes that carry a class there -- a
	 * heading, a code block -- are given the same one here through Milkdown's attribute hooks.
	 */
	import * as stylex from '@stylexjs/stylex';
	import { Editor, defaultValueCtx, editorViewOptionsCtx, rootCtx } from '@milkdown/core';
	import { codeBlockAttr, commonmark, headingAttr } from '@milkdown/preset-commonmark';
	import { gfm } from '@milkdown/preset-gfm';
	import { history } from '@milkdown/plugin-history';
	import { listener, listenerCtx } from '@milkdown/plugin-listener';
	import ProseRoot from '@canmi/prose/prose-root.svelte';
	import { titleStyles } from '@canmi/prose/section-title';
	import { surfaces } from '@canmi/tokens/surfaces';
	import { family, text } from '@canmi/tokens/vocabulary.stylex';
	import { onMount } from 'svelte';
	import { blockViews } from './block-views';
	import { extensions } from './markdown';

	let {
		markdown,
		language,
		onChange,
	}: { markdown: string; language: string; onChange: (value: string) => void } = $props();

	let host: HTMLDivElement;

	// What `section.svelte` puts on a heading, and the spacing it takes above one: a section sits
	// further from what precedes it than a subsection does. See spec/styling/rail.md.
	const HEADING = stylex.attrs(titleStyles.title).class ?? '';

	// The site draws a fence through its own component; here it is the frame that component draws
	// around one, holding raw text rather than highlighted tokens.
	const styles = stylex.create({
		code: { fontFamily: family.monoTheme, fontSize: text.px13 },
	});
	const CODE = `overflow-x-auto px-4 py-3 ${stylex.attrs(surfaces.blockFrame, styles.code).class}`;

	onMount(() => {
		let editor: Editor | undefined;
		const seed = markdown;
		void Editor.make()
			.config((ctx) => {
				ctx.set(rootCtx, host);
				ctx.set(defaultValueCtx, seed);
				// The document is the prose's own spacing and nothing else: the blocks sit one
				// spacing step apart, as the compiled body's do, and no outline is drawn around the
				// field, because the page it is on already says where writing happens.
				ctx.update(editorViewOptionsCtx, (previous) => ({
					...previous,
					attributes: { class: 'min-h-96 space-y-4 outline-none' },
				}));
				ctx.set(headingAttr.key, (node) => ({
					class: `${HEADING} ${node.attrs.level === 2 ? 'mt-12' : 'mt-8'}`,
				}));
				ctx.set(codeBlockAttr.key, () => ({ pre: { class: CODE }, code: {} }));
				ctx.get(listenerCtx).markdownUpdated((_, value) => onChange(value));
			})
			.use(commonmark)
			.use(gfm)
			.use(extensions)
			// A block is compiled in the draft's language, or the source language when none is set.
			.use(blockViews(() => language || 'en-US'))
			.use(history)
			.use(listener)
			.create()
			.then((made) => (editor = made));
		return () => void editor?.destroy();
	});
</script>

<ProseRoot><div bind:this={host}></div></ProseRoot>
