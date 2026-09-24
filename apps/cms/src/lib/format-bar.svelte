<script lang="ts" module>
	import type { Component } from 'svelte';
	import Bold from '@lucide/svelte/icons/bold';
	import Code from '@lucide/svelte/icons/code';
	import Italic from '@lucide/svelte/icons/italic';
	import Strikethrough from '@lucide/svelte/icons/strikethrough';

	/** The marks the bar offers, by their schema name, in the order they stand. */
	export const FORMATS: { mark: string; label: string; icon: Component; keys: string }[] = [
		{ mark: 'strong', label: 'Bold', icon: Bold, keys: '⌘B' },
		{ mark: 'emphasis', label: 'Italic', icon: Italic, keys: '⌘I' },
		{ mark: 'strike_through', label: 'Strikethrough', icon: Strikethrough, keys: '⌘⌥X' },
		{ mark: 'inlineCode', label: 'Code', icon: Code, keys: '⌘E' },
	];
</script>

<script lang="ts">
	/**
	 * The bar over a selection that sets the marks a sentence can carry. Drawn only; where it
	 * stands and what a press does belong to format-bar.ts.
	 */
	import * as stylex from '@stylexjs/stylex';
	import { surfaces } from '@canmi/tokens/surfaces';
	import type { FormatState } from './block-props.svelte';
	import { floating } from './floating';

	let { format, apply }: { format: FormatState; apply: (mark: string) => void } = $props();

	const styles = stylex.create({
		on: { backgroundColor: 'var(--color-paper-hover)' },
	});
</script>

<div
	role="toolbar"
	aria-label="Format"
	hidden={!format.shown}
	style:top="{format.top}px"
	style:left="{format.left}px"
	class="fixed z-30 flex -translate-x-1/2 -translate-y-full items-center gap-0.5 p-1 {stylex.attrs(
		floating.pill,
	).class}"
>
	{#each FORMATS as { mark, label, icon: Icon, keys } (mark)}
		<!-- A press that took focus would take the selection with it. -->
		<button
			type="button"
			aria-label={label}
			aria-pressed={format.active.includes(mark)}
			title="{label} {keys}"
			onmousedown={(event) => event.preventDefault()}
			onclick={() => apply(mark)}
			class="cursor-pointer p-1.5 {stylex.attrs(
				surfaces.quietControl,
				floating.control,
				format.active.includes(mark) && styles.on,
			).class}"
		>
			<Icon class="size-4" aria-hidden="true" />
		</button>
	{/each}
</div>
