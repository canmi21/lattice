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
	import {
		Editor,
		defaultValueCtx,
		editorViewCtx,
		editorViewOptionsCtx,
		rootCtx,
		serializerCtx,
	} from '@milkdown/core';
	import { headingAttr } from '@milkdown/preset-commonmark';
	import { history } from '@milkdown/plugin-history';
	import { listener, listenerCtx } from '@milkdown/plugin-listener';
	import ProseRoot from '@canmi/prose/prose-root.svelte';
	import { titleStyles } from '@canmi/prose/section-title';
	import { surfaces } from '@canmi/tokens/surfaces';
	import { family, radius, text } from '@canmi/tokens/vocabulary.stylex';
	import { onMount } from 'svelte';
	import { blockHandle } from './block-handle';
	import { blockViews } from './block-views';
	import { formatBar } from './format-bar';
	import { inlineSource, settled } from './inline-source';
	import { inlineViews } from './inline-views';
	import { extensions, presets } from './markdown';

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
		open: { backgroundColor: 'var(--color-paper-hover)', borderRadius: radius.sm },
		// Syntax that did not close, underlined where it stands until it is finished.
		broken: {
			textDecorationLine: 'underline',
			textDecorationStyle: 'wavy',
			textDecorationColor: 'var(--color-red)',
			textUnderlineOffset: '0.25em',
		},
	});
	// Marked words opened as markdown sit on a faint ground. See inline-source.ts.
	const OPEN = stylex.attrs(styles.open).class ?? '';
	const BROKEN = stylex.attrs(styles.broken).class ?? '';
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
				// What is written is the document with nothing open: open source is asterisks as text,
				// and saved as it stands they would come back escaped. See inline-source.ts.
				ctx.get(listenerCtx).markdownUpdated((current) => {
					const state = current.get(editorViewCtx).state;
					onChange(current.get(serializerCtx)(settled(current, state)));
				});
			})
			.use(presets)
			.use(extensions)
			// A block is compiled in the draft's language, or the source language when none is set.
			.use(blockViews(() => language || 'en-US', CODE))
			.use(blockHandle)
			.use(inlineViews)
			.use(formatBar)
			.use(inlineSource({ open: OPEN, broken: BROKEN }))
			.use(history)
			.use(listener)
			.create()
			.then((made) => (editor = made));
		return () => void editor?.destroy();
	});
</script>

<ProseRoot><div bind:this={host}></div></ProseRoot>
