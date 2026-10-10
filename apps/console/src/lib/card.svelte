<script lang="ts">
	/** A titled surface on the ground; `flush` runs its content to the edges, as a table does. */
	import * as stylex from '@stylexjs/stylex';
	import type { Snippet } from 'svelte';
	import { surfaces, type } from './style.ts';

	let {
		title,
		heading,
		flush = false,
		aside,
		children,
	}: {
		title?: string;
		/** A title that is more than words, as ./ui/title-choice.svelte is; `title` names it then. */
		heading?: Snippet;
		flush?: boolean;
		/** On the title's right: a count, a legend, a switch. */
		aside?: Snippet;
		children: Snippet;
	} = $props();
</script>

<section class="flex min-w-0 flex-col {stylex.attrs(surfaces.card).class}">
	{#if title || heading}
		<!-- A title that is a choice carries its own inset, its wash's, so the head gives less above
		     it: the words stand as far from the card's top as from its side. -->
		<header
			class="flex min-h-12 items-center justify-between gap-3 px-5 {heading
				? 'pt-3'
				: 'pt-4'} {flush ? (heading ? 'pb-2.25' : 'pb-3') : ''}"
		>
			<h2 class={stylex.attrs(type.heading).class}>
				{#if heading}{@render heading()}{:else}{title}{/if}
			</h2>
			{@render aside?.()}
		</header>
	{/if}
	<div class={flush ? 'overflow-x-auto' : 'px-5 pt-3 pb-5'}>
		{@render children()}
	</div>
</section>
