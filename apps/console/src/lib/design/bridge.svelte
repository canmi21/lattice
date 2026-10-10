<script lang="ts">
	/**
	 * The unseen part of a held surface: a strip out from the edge its point is on, across the gap
	 * to what opened it and as long as that is along the edge, so the pointer crossing from the one
	 * to the other never leaves them. It goes the way the point does: above a card that points up,
	 * left of one that points left. Placed inside the surface. See ./held.ts.
	 */
	let {
		edge,
		along,
		span,
		reach,
	}: {
		/** The surface's edge the strip stands out from, the one its point is on. */
		edge: 'top' | 'bottom' | 'left' | 'right';
		/** Where along that edge it begins, in pixels from the surface's top or left. */
		along: number;
		/** How long it is along the edge: the anchor's extent, and a little either side. */
		span: number;
		/** How far out from the edge it reaches: across the gap, into the anchor. */
		reach: number;
	} = $props();

	const across = $derived(edge === 'top' || edge === 'bottom');
</script>

<span
	aria-hidden="true"
	class="absolute"
	style:left={across ? `${along}px` : edge === 'right' ? '100%' : undefined}
	style:right={edge === 'left' ? '100%' : undefined}
	style:top={across ? (edge === 'bottom' ? '100%' : undefined) : `${along}px`}
	style:bottom={edge === 'top' ? '100%' : undefined}
	style:width="{across ? span : Math.max(0, reach)}px"
	style:height="{across ? Math.max(0, reach) : span}px"
></span>
