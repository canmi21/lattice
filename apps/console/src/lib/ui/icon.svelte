<script lang="ts">
	/**
	 * An icon in three layers: its box, whose center is the one thing layout aligns to; its drawing's
	 * offset from that center; and its drawing's scale about it. The last two come from the icon's
	 * row in ./optics.ts, or `optics` here, and move only the drawing, through its `viewBox`, so the
	 * box -- and any focus ring around it -- stays put. A scaled drawing keeps its stroke weight. See
	 * spec/architecture/console.md, "An icon is drawn in three layers".
	 */
	import { OPTICS, type IconComponent, type Optics, viewBoxOf } from './optics.ts';

	let {
		icon: Drawing,
		size,
		stroke = 2,
		optics,
		class: className,
	}: {
		icon: IconComponent;
		/** The box's side in pixels. */
		size: number;
		/** The stroke as the drawing is meant to look, before any scale. */
		stroke?: number;
		/** Overrides the icon's row in the table. */
		optics?: Optics;
		class?: string;
	} = $props();

	const correction = $derived(optics ?? OPTICS.get(Drawing) ?? {});
	const scale = $derived(correction.scale ?? 1);
</script>

<Drawing
	{size}
	stroke={stroke / scale}
	viewBox={viewBoxOf(correction)}
	aria-hidden="true"
	class={className}
/>
