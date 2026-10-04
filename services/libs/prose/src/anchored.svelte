<script module lang="ts">
	import * as stylex from '@stylexjs/stylex';

	/** The block, as the anchor button's `when.ancestor` sees it. See anchor-button.svelte. */
	const holder = stylex.defaultMarker();
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import AnchorButton from './anchor-button.svelte';

	let { id, children }: { id?: string; children: Snippet } = $props();
</script>

<!-- A block a reader can be pointed at, by the anchor its kind and place give it. See
     spec/architecture/anchors.md. -->
{#if id}
	<div {id} class="jump-target relative {stylex.attrs(holder).class}">
		<AnchorButton target={id} label="Link to this {id.split('-')[0]}" place="top" />
		{@render children()}
	</div>
{:else}
	{@render children()}
{/if}
