<script lang="ts">
	/**
	 * Milkdown, mounted once and told nothing afterwards.
	 *
	 * The editor owns the document while it is open: `markdown` is read to seed it and never
	 * written back into it, because an editor that re-seeds on every keystroke moves the caret.
	 * What comes out goes up through `onChange`, and the page decides when that becomes a row.
	 */
	import { Editor, defaultValueCtx, rootCtx } from '@milkdown/core';
	import { commonmark } from '@milkdown/preset-commonmark';
	import { gfm } from '@milkdown/preset-gfm';
	import { history } from '@milkdown/plugin-history';
	import { listener, listenerCtx } from '@milkdown/plugin-listener';
	import { nord } from '@milkdown/theme-nord';
	import { onMount } from 'svelte';

	let { markdown, onChange }: { markdown: string; onChange: (value: string) => void } = $props();

	let host: HTMLDivElement;

	onMount(() => {
		let editor: Editor | undefined;
		const seed = markdown;
		void Editor.make()
			.config((ctx) => {
				ctx.set(rootCtx, host);
				ctx.set(defaultValueCtx, seed);
				ctx.get(listenerCtx).markdownUpdated((_, value) => onChange(value));
			})
			.config(nord)
			.use(commonmark)
			.use(gfm)
			.use(history)
			.use(listener)
			.create()
			.then((made) => (editor = made));
		return () => void editor?.destroy();
	});
</script>

<div class="host" bind:this={host}></div>

<style>
	.host :global(.milkdown) {
		padding: 0;
		outline: none;
	}
	.host :global(.ProseMirror) {
		min-height: 24rem;
		outline: none;
		line-height: 1.7;
	}
</style>
