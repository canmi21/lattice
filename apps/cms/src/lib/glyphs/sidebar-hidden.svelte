<!--
	The sidebar folded away: the same landscape frame as [[sidebar-shown]], with the column gone --
	the whole window is the page. Nothing else changes, so the pair swaps without the button moving.
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
	<rect x="2" y="5" width="20" height="14" rx="3" />
</svg>
