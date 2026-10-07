<script lang="ts">
	/** Charts that point at the same moment together: a crosshair in one is drawn in every one. */
	import type { Snippet } from 'svelte';
	import { shareHover } from './hover.svelte.ts';

	let { children }: { children: Snippet } = $props();

	shareHover();
</script>

{@render children()}
