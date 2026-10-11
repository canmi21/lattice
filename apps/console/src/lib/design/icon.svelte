<script lang="ts">
	/**
	 * An icon in layers: its box, whose center is the one thing layout aligns to; its drawing's
	 * offset from that center and its scale about it, from ./optics.ts or `optics`, moving only the
	 * drawing through its `viewBox`; and, given the `words` it stands by, the box set in their line,
	 * centered on the middle of the letter nearest it: half an `ex` over the baseline by a lowercase,
	 * half the capital height, `--font-sans-cap-height`, by a capital or a figure. See
	 * spec/console/design.md, "An icon is drawn in layers".
	 */
	import { OPTICS, type IconComponent, type Optics, heightBeside, viewBoxOf } from './optics.ts';

	let {
		icon: Drawing,
		size,
		stroke = 2,
		optics,
		words,
		side = 'before',
		badge,
		class: className,
	}: {
		icon: IconComponent;
		/** The box's side in pixels. */
		size: number;
		/** The stroke as the drawing is meant to look, before any scale. */
		stroke?: number;
		/** Overrides the icon's row in the table. */
		optics?: Optics;
		/**
		 * The words it stands by in their line, which set it there: its box's center on the middle
		 * of the letter nearest it, wherever its drawing sits inside the box.
		 */
		words?: string;
		/** Which side of `words` it stands on: before them, by their first letter, or after. */
		side?: 'before' | 'after';
		/**
		 * A dot at the box's lower right that says how the thing drawn is, as a class that colors
		 * it; ringed in the ground so it reads as set into the drawing's corner.
		 */
		badge?: string;
		class?: string;
	} = $props();

	const correction = $derived(optics ?? OPTICS.get(Drawing) ?? {});
	const height = $derived(words === undefined ? undefined : heightBeside(words, side));
	/** The box's foot raised so its center meets half that letter's height over the baseline. */
	const raised = $derived(height === undefined ? undefined : `calc(${height} / 2 - ${size / 2}px)`);
	const scale = $derived(correction.scale ?? 1);
</script>

{#snippet drawn(placed: boolean)}
	<Drawing
		{size}
		stroke={stroke / scale}
		viewBox={viewBoxOf(correction)}
		aria-hidden="true"
		class="{placed && raised ? 'inline-block' : ''} {placed ? (className ?? '') : 'block'}"
		style={placed && raised ? `vertical-align: ${raised}` : undefined}
	/>
{/snippet}

{#if badge}
	<!-- The box and its dot as one, which is what the words' line sets. -->
	<span
		class="relative shrink-0 {raised ? 'inline-block' : 'block'} {className ?? ''}"
		style:width="{size}px"
		style:height="{size}px"
		style:vertical-align={raised}
	>
		{@render drawn(false)}
		<span
			aria-hidden="true"
			class="absolute -right-px -bottom-px size-1.5 rounded-full {badge}"
			style:box-shadow="0 0 0 1.5px var(--badge-ground, var(--background-surface))"
		></span>
	</span>
{:else}
	{@render drawn(true)}
{/if}
