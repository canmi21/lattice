<!--
	The sidebar standing: a landscape frame -- the window -- with the column drawn in at its left.

	Lucide's `panel-left` is square, and a square is not the shape of the window this button
	stands in; the frame here is 20 by 16, the proportion of the page it controls. Its pair,
	[[sidebar-hidden]], is the same frame with the column taken out, so the button's footprint
	does not move when its state does.
-->
<script lang="ts">
	import type { GlyphProps } from './shared';

	let {
		color = 'currentColor',
		size = 24,
		strokeWidth = 2,
		class: className = '',
		...rest
	}: GlyphProps = $props();
</script>

<svg
	xmlns="http://www.w3.org/2000/svg"
	width={size}
	height={size}
	viewBox="0 0 24 24"
	fill="none"
	stroke={color}
	stroke-width={strokeWidth}
	stroke-linecap="round"
	stroke-linejoin="round"
	class={className}
	{...rest}
>
	<rect x="2" y="4" width="20" height="16" rx="3" />
	<path d="M9 4v16" />
</svg>
