<script module lang="ts">
	import * as stylex from '@stylexjs/stylex';
	import { duration } from '@canmi/tokens/vocabulary.stylex';
	import { surfaces } from '@canmi/tokens/surfaces';

	/**
	 * The `#` beside anything a reader can be pointed at -- a heading or a block -- revealed when
	 * its holder is hovered. The holder carries `stylex.defaultMarker()`; see spec/todo/todo.md,
	 * "Ancestor state reaches the visual layer only through a marker nobody owns", for why both the
	 * resting and hovered opacity have to sit here and why the default marker rather than a named
	 * one. See spec/architecture/anchors.md.
	 */
	const styles = stylex.create({
		anchor: {
			opacity: {
				default: 0,
				// Gated on a pointer that can actually hover, which is what Tailwind's `hover`
				// variant does and what keeps the control from latching open after a tap.
				'@media (hover: hover)': {
					default: null,
					[stylex.when.ancestor(':hover')]: 1,
				},
				':focus-visible': 1,
			},
			transitionProperty: 'opacity',
			transitionDuration: duration.base,
			// The curve is Tailwind's `--ease-out`, written out rather than read. Its theme
			// variables are emitted only for the utilities the markup still names, so a variable
			// this file is the last reader of would resolve to nothing once the class is gone.
			transitionTimingFunction: 'cubic-bezier(0, 0, 0.2, 1)',
			// The keyboard outline belongs to the glyph inside, which `focus-ring-inner` draws.
			outlineStyle: { default: null, ':focus-visible': 'none' },
		},
		glyph: {
			color: {
				default: 'var(--color-text-soft)',
				'@media (hover: hover)': { default: null, ':hover': 'var(--color-text-strong)' },
			},
		},
	});
</script>

<script lang="ts">
	import { Hash } from '@lucide/svelte';

	let {
		target,
		label,
		place = 'middle',
	}: {
		/** The id the address will name. */
		target: string;
		label: string;
		/** Beside the middle of a line, or level with the top of a block. */
		place?: 'middle' | 'top';
	} = $props();

	function name(event: MouseEvent) {
		event.preventDefault();
		event.stopPropagation();
		history.replaceState(null, '', `#${target}`);
	}
</script>

<!-- A mark carrying no chrome of its own has nothing else to say it is a control. -->
<button
	type="button"
	aria-label={label}
	onclick={name}
	class="absolute -left-7 hidden cursor-pointer py-1 pr-2 pl-1 lg:block {place === 'middle'
		? 'top-1/2 -translate-y-1/2'
		: 'top-0'} {stylex.attrs(surfaces.focusRingHost, styles.anchor).class}"
>
	<span
		class="focus-ring-inner block {stylex.attrs(
			surfaces.focusRingInner,
			surfaces.colorShift,
			styles.glyph,
		).class}"
	>
		<Hash class="h-4 w-4" aria-hidden="true" />
	</span>
</button>
