<!--
	CornersOut, redrawn around a landscape rectangle.

	Phosphor's `CornersOut` marks the corners of a square, right for a generic expand and wrong
	here: this button sits among three other landscape boxes in the control row --
	`ClosedCaptioning`, `PictureInPicture`, `FrameCorners` -- and a square among them reads as a
	different kind of thing, where what this one means is a video going full screen.

	The rectangle is the one those three agree on most: at bold, Phosphor draws no two of its boxes
	alike, and two of the three use x 20..236 and two use y 44..212, which is `PictureInPicture`
	exactly -- 216 x 168, centred on the canvas. The brackets are Phosphor's own, unaltered: 24
	thick, 52 long, 12 radius, elbow at the corner with both arms running inward. Only where they
	sit has changed.
-->
<script lang="ts">
	import type { GlyphProps } from './shared';

	let { color = 'currentColor', size = '1em', mirrored = false, ...rest }: GlyphProps = $props();

	const D =
		'M20,56V96a12,12,0,0,0,24,0V68H72a12,12,0,0,0,0,-24h-40A12,12,0,0,0,20,56Z' +
		'M236,56V96a12,12,0,0,1,-24,0V68H184a12,12,0,0,1,0,-24h40A12,12,0,0,1,236,56Z' +
		'M20,200V160a12,12,0,0,1,24,0V188H72a12,12,0,0,1,0,24h-40A12,12,0,0,1,20,200Z' +
		'M236,200V160a12,12,0,0,0,-24,0V188H184a12,12,0,0,0,0,24h40A12,12,0,0,0,236,200Z';
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
