<script lang="ts">
	/**
	 * What is drawn from the live store, once it holds the nodes: at once where it already does, as
	 * on every page after the first and on the first too where its load read the cluster already,
	 * else when the streamed cluster lands or the socket speaks first. Until then `pending` stands
	 * in. See spec/architecture/console.md.
	 */
	import type { Snippet } from 'svelte';
	import type { Live } from '../live.svelte.ts';

	let {
		live,
		cluster,
		pending,
		children,
	}: {
		live: Live;
		/** The page's cluster, streamed or already read. */
		cluster: unknown;
		pending?: Snippet;
		children: Snippet;
	} = $props();

	const heard = $derived(Object.keys(live.view.nodes).length > 0);
</script>

{#if heard}
	{@render children()}
{:else}
	{#await cluster}
		{@render pending?.()}
	{:then}
		{@render children()}
	{/await}
{/if}
