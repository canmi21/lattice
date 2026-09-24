<!--
	Search, lowered to stand beside the sidebar frames: its lens and handle keep inside the same
	band the 14-high frame fills, y 5 to 19 with the stroke about it, where Lucide's own `search` runs 3 to 21 and
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
	<circle cx="11" cy="11" r="6" />
	<path d="m19.5 19.5-4.25-4.25" />
</svg>
