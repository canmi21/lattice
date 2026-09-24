<script lang="ts">
	/**
	 * The fade at each edge of a scroller of code, which stands in for its scrollbars.
	 *
	 * Each edge is as wide as the padding it starts over: at rest it covers the scroller's own
	 * gutter and veils nothing, and it begins its work exactly as the code starts passing under it.
	 * All four, so a scroller that scrolls either way fades either way; a code block only ever
	 * scrolls across, and its top and bottom never have code pass under them, so there they are
	 * present and never seen. `from-transparent` is transparent black and still cannot grey the
	 * ramp, because gradient stops interpolate premultiplied.
	 *
	 * Placed last inside a `relative` box around the scroller. `framed` steps them inside a
	 * hairline and gives them the frame's corners, for a scroller that is its own frame; without
	 * it they sit flush, for a panel whose frame is outside it.
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
