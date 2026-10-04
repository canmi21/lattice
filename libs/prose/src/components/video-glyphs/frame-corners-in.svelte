<!--
	FrameCorners with its two marks turned around, which is the window-fullscreen exit.

	Phosphor draws `FrameCorners` and no partner for it, and the glyph only says one thing: a frame
	with a bracket hugging its top-right and another hugging its bottom-left, both elbows out at
	the frame's corners and both pairs of arms running inward. That is a picture of filling the
	frame, so it is the button that enters. Leaving needs the opposite and there is nothing to
	import.

	The frame is Phosphor's, byte for byte. The two brackets are Phosphor's too, each rotated 180
	degrees about its own centre -- so each keeps its size and its place, and only the elbow moves
	from the outer end of the mark to the inner one. The elbows then sit either side of the middle
	instead of out at the corners, which is how `CornersIn` says small and `CornersOut` says large.
-->
<script lang="ts">
	import type { GlyphProps } from './shared';

	let { color = 'currentColor', size = '1em', mirrored = false, ...rest }: GlyphProps = $props();

	const D =
		// The frame, unchanged.
		'M236,56V200a20,20,0,0,1-20,20H40a20,20,0,0,1-20-20V56A20,20,0,0,1,40,36H216A20,20,0,0,1,236,56Z' +
		'm-24,4H44V196H212Z' +
		// Top-right mark, turned about (168, 98).
		'M196,108a12,12,0,0,1,-12,12h-32a12,12,0,0,1,-12,-12v-32a12,12,0,0,1,24,0V96H184A12,12,0,0,1,196,108Z' +
		// Bottom-left mark, turned about (82, 158).
		'M92,136h-32a12,12,0,0,0,0,24H80V180a12,12,0,0,0,24,0v-32A12,12,0,0,0,92,136Z';
</script>

<svg
	xmlns="http://www.w3.org/2000/svg"
	role="img"
	width={size}
	height={size}
	fill={color}
	transform={mirrored ? 'scale(-1, 1)' : undefined}
	viewBox="0 0 256 256"
	{...rest}
>
	<rect width="256" height="256" fill="none" />
	<path d={D} />
</svg>
