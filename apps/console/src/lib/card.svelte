<script lang="ts">
	/** A titled surface on the ground; `flush` runs its content to the edges, as a table does. */
	import * as stylex from '@stylexjs/stylex';
	import type { Snippet } from 'svelte';
	import { surfaces, type } from './style.ts';

	let {
		title,
		flush = false,
		aside,
		children,
	}: {
		title?: string;
		flush?: boolean;
		/** On the title's right: a count, a legend, a switch. */
		aside?: Snippet;
		children: Snippet;
	} = $props();
</script>

<section class="flex min-w-0 flex-col {stylex.attrs(surfaces.card).class}">
	{#if title}
		<header
			class="flex min-h-12 items-center justify-between gap-3 px-5 pt-4 {flush ? 'pb-3' : ''}"
		>
			<h2 class={stylex.attrs(type.heading).class}>{title}</h2>
			{@render aside?.()}
		</header>
	{/if}
	<div class={flush ? 'overflow-x-auto' : 'px-5 pt-3 pb-5'}>
		{@render children()}
	</div>
</section>
