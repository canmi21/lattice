<script lang="ts">
	/** A card: a titled surface on the ground, with room for what can be done to what it shows. */
	import * as stylex from '@stylexjs/stylex';
	import type { Snippet } from 'svelte';
	import { surfaces, type } from './style/surfaces';

	let {
		title,
		description,
		actions,
		flush = false,
		children,
	}: {
		title?: string;
		description?: string;
		actions?: Snippet;
		/** Content running to the card's edges, as a table does. */
		flush?: boolean;
		children: Snippet;
	} = $props();
</script>

<section class="flex min-w-0 flex-col {stylex.attrs(surfaces.card).class}">
	{#if title || actions}
		<header
			class="flex flex-wrap items-start justify-between gap-3 px-5 pt-4 {flush ? 'pb-3' : ''}"
		>
			<div class="flex min-w-0 flex-col gap-1">
				{#if title}<h2 class={stylex.attrs(type.heading).class}>{title}</h2>{/if}
				{#if description}<p class={stylex.attrs(type.muted).class}>{description}</p>{/if}
			</div>
			{#if actions}<div class="flex flex-wrap items-center gap-2">{@render actions()}</div>{/if}
		</header>
	{/if}
	<div class={flush ? 'overflow-x-auto' : 'px-5 pt-3 pb-5'}>
		{@render children()}
	</div>
</section>
