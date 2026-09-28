<script lang="ts">
	/**
	 * The fade at each edge of a scroller of code, standing in for its scrollbars. Each is as wide as
	 * the padding it starts over, so at rest it veils nothing and begins as code passes under it; all
	 * four, since a scroller may scroll either way. `from-transparent` cannot grey the ramp: gradient
	 * stops interpolate premultiplied. Placed last in a `relative` box around the scroller; `framed`
	 * steps them inside a hairline with the frame's corners, for a scroller that is its own frame,
	 * and without it they sit flush, for a panel framed from outside.
	 */
	let { framed = false }: { framed?: boolean } = $props();
</script>

{#if framed}
	<span
		aria-hidden="true"
		class="pointer-events-none absolute inset-y-px left-px w-4 rounded-l-xl bg-linear-to-l from-transparent to-paper"
	></span>
	<span
		aria-hidden="true"
		class="pointer-events-none absolute inset-y-px right-px w-4 rounded-r-xl bg-linear-to-r from-transparent to-paper"
	></span>
	<span
		aria-hidden="true"
		class="pointer-events-none absolute inset-x-px top-px h-4 rounded-t-xl bg-linear-to-t from-transparent to-paper"
	></span>
	<span
		aria-hidden="true"
		class="pointer-events-none absolute inset-x-px bottom-px h-4 rounded-b-xl bg-linear-to-b from-transparent to-paper"
	></span>
{:else}
	<span
		aria-hidden="true"
		class="pointer-events-none absolute inset-y-0 left-0 w-4 bg-linear-to-l from-transparent to-paper"
	></span>
	<span
		aria-hidden="true"
		class="pointer-events-none absolute inset-y-0 right-0 w-4 bg-linear-to-r from-transparent to-paper"
	></span>
	<span
		aria-hidden="true"
		class="pointer-events-none absolute inset-x-0 top-0 h-4 bg-linear-to-t from-transparent to-paper"
	></span>
	<span
		aria-hidden="true"
		class="pointer-events-none absolute inset-x-0 bottom-0 h-4 bg-linear-to-b from-transparent to-paper"
	></span>
{/if}
