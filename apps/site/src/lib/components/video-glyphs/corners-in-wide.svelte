<!--
	CornersIn, on the same landscape rectangle [[corners-out-wide]] uses, and its exact pair.

	Phosphor's `CornersIn` is not a turned `CornersOut`: its brackets are 60 long against the
	other's 52 and its footprint is 160 square against 184, so the two glyphs change size as well
	as direction. That is fine for two icons sitting apart in a set and wrong for one button whose
	label toggles, where a footprint that moves reads as the row twitching.

	So this is the same four brackets in the same four places, each turned 180 degrees where it
	stands. The footprint is identical to the out state to the pixel, and what carries the meaning
	is where the elbows are: out puts them at the rectangle's corners and points the arms inward,
	in puts them toward the middle and lets the arms run back out. The reader learns the
	destination from the elbows, which is the same thing Phosphor's own pair does, only without
	the resize.
-->
<script lang="ts">
	import type { GlyphProps } from './shared';

	let { color = 'currentColor', size = '1em', mirrored = false, ...rest }: GlyphProps = $props();

	const D =
		'M72,84V44a12,12,0,0,0,-24,0V72H20a12,12,0,0,0,0,24h40A12,12,0,0,0,72,84Z' +
		'M184,84V44a12,12,0,0,1,24,0V72H236a12,12,0,0,1,0,24h-40A12,12,0,0,1,184,84Z' +
		'M72,172V212a12,12,0,0,1,-24,0V184H20a12,12,0,0,1,0,-24h40A12,12,0,0,1,72,172Z' +
		'M184,172V212a12,12,0,0,0,24,0V184H236a12,12,0,0,0,0,-24h-40A12,12,0,0,0,184,172Z';
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
