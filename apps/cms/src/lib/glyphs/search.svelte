<!--
	Search, lowered to stand beside the sidebar frames: its lens and handle keep inside the same
	band the 16-high frame fills, y 4 to 20, where Lucide's own `search` runs 3 to 21 and
	stood taller than its neighbour.
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
	<circle cx="10.5" cy="10.5" r="6.5" />
	<path d="m20 20-4.6-4.6" />
</svg>
