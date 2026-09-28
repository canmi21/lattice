<script lang="ts">
	/** The top of a page: what it is, a line on it, and what can be done from here. */
	import * as stylex from '@stylexjs/stylex';
	import type { Snippet } from 'svelte';
	import { type } from './style/surfaces';

	let { title, description, actions }: { title: string; description?: string; actions?: Snippet } =
		$props();
</script>

<header class="mb-6 flex flex-wrap items-end justify-between gap-4">
	<div class="flex min-w-0 flex-col gap-1">
		<h1 class={stylex.attrs(type.title).class}>{title}</h1>
		{#if description}<p class={stylex.attrs(type.muted).class}>{description}</p>{/if}
	</div>
	{#if actions}<div class="flex flex-wrap items-center gap-2">{@render actions()}</div>{/if}
</header>
