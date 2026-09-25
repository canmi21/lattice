<script module lang="ts">
	import * as stylex from '@stylexjs/stylex';
	import { duration } from '@canmi/tokens/vocabulary.stylex';
	import { surfaces } from '@canmi/tokens/surfaces';
	import { titleStyles } from './section-title.ts';

	/**
	 * The heading, as the anchor button's `when.ancestor` sees it. See spec/todo/todo.md, "Ancestor
	 * state reaches the visual layer only through a marker nobody owns", for why both the resting
	 * and hovered opacity have to sit here and why this uses the default marker rather than a
	 * named one. `when.ancestor` is called without an explicit marker: the parameter is branded
	 * for a `defineMarker()` symbol and the default marker is branded as itself, so passing it
	 * would not type check.
	 */
	const heading = stylex.defaultMarker();

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
	import type { Snippet } from 'svelte';

	let {
		slug,
		depth = 2,
		notes = [],
		children,
	}: { slug: string; depth?: number; notes?: number[]; children: Snippet } = $props();

	function copyHash(e: MouseEvent) {
		e.preventDefault();
		e.stopPropagation();
		history.replaceState(null, '', `#${slug}`);
	}
</script>

<!-- A subsection matches a section's size, weight and colour and sits closer to what precedes
     it: see spec/styling/rail.md, "A subsection is nearer, and for that reason unlisted", for why
     space rather than size carries the distinction and why only sections are in the rail. -->
<svelte:element
	this={`h${depth}`}
	id={slug}
	class="relative {stylex.attrs(titleStyles.title, heading).class}"
	class:mt-12={depth === 2}
	class:mt-8={depth !== 2}
>
	<!-- A mark carrying no chrome of its own has nothing else to say it is a control. -->
	<button
		type="button"
		aria-label="Copy link to section"
		onclick={copyHash}
		class="absolute top-1/2 -left-7 hidden cursor-pointer -translate-y-1/2 py-1 pr-2 pl-1 lg:block {stylex.attrs(
			surfaces.focusRingHost,
			styles.anchor,
		).class}"
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
	{@render children()}
	<!-- After the words rather than above them: a heading's note belongs to the heading, and a
	     marker floating off the cap line reads as belonging to the page. The addresses are spelled
	     exactly as compile.ts spells a prose marker's, so one selector reaches both origins, while
	     `focus-link` and `jump-target` stay classes, being recipes. See spec/styling/notes.md and
	     spec/architecture/css/authoring.md. -->
	{#each notes as number (number)}<sup data-note-marker
			><a
				id="marker-{number}"
				href="#note-{number}"
				class="focus-link jump-target"
				data-note-marker-link>{number}</a
			></sup
		>{/each}
</svelte:element>
