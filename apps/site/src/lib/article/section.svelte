<script module lang="ts">
	import * as stylex from '@stylexjs/stylex';

	/**
	 * The heading, as the anchor button's `when.ancestor` sees it.
	 *
	 * The button appears while the pointer is anywhere over the heading, which is a fact about an
	 * ancestor rather than anything the button can see about itself. Both halves of that -- the
	 * resting opacity and the hovered one -- have to sit in the same layer: StyleX outranks
	 * Tailwind's utilities, so a resting `opacity: 0` here would win over a `group-hover:` left
	 * behind in the markup and the control would never appear. See spec/architecture/css.md.
	 *
	 * The default marker rather than a named one. `stylex.defineMarker()` needs a build
	 * configuration this file cannot add on its own, and the default compiles to a single class
	 * every caller shares -- so nesting two of these would cross the wires. Recorded in
	 * spec/todo.md; nothing else on the site uses a marker yet.
	 *
	 * `when.ancestor` is called without it. Its marker argument is optional and defaults to this
	 * same one, and passing it explicitly does not type check: the parameter is branded for a
	 * `defineMarker()` symbol and the default marker is branded as itself.
	 */
	const heading = stylex.defaultMarker();

	const styles = stylex.create({
		title: {
			color: 'var(--color-text-strong)',
			fontWeight: 600,
		},
		anchor: {
			// Visual under the rule in spec/architecture/css.md: it moves nothing, it says what
			// the element is to a pointer.
			cursor: 'pointer',
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
			transitionDuration: '200ms',
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
			transitionProperty:
				'color, background-color, border-color, outline-color, text-decoration-color, fill, stroke',
			transitionDuration: '200ms',
			transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
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

<!-- A subsection is the same size, weight and colour as a section, and sits closer to what comes
     before it. The type scale is already spent -- 16px title, 15px heading, 14px prose, one step
     apart and separated by weight rather than size -- so there is no smaller step to give a third
     level without flattening the first two. Space is the signal instead, and the honest one:
     sitting nearer says "this belongs to what is above", which is exactly the relation. It also
     earns the rail's filtering -- a reader who can see that a heading is a subsection reads a
     table of contents that lists only sections as complete, not as missing something. -->
<svelte:element
	this={`h${depth}`}
	id={slug}
	class="relative {stylex.attrs(styles.title, heading).class}"
	class:mt-12={depth === 2}
	class:mt-8={depth !== 2}
>
	<button
		type="button"
		aria-label="Copy link to section"
		onclick={copyHash}
		class="absolute top-1/2 -left-7 hidden -translate-y-1/2 py-1 pr-2 pl-1 lg:block {stylex.attrs(
			styles.anchor,
		).class}"
	>
		<span class="focus-ring-inner block {stylex.attrs(styles.glyph).class}">
			<Hash class="h-4 w-4" aria-hidden="true" />
		</span>
	</button>
	{@render children()}
	<!-- After the words rather than above them: a heading's note belongs to the heading, and a
	     marker floating off the cap line reads as belonging to the page. See spec/styling.md. -->
	{#each notes as number (number)}<sup class="note-marker"
			><a id="marker-{number}" href="#note-{number}" class="note-marker-link focus-link jump-target"
				>{number}</a
			></sup
		>{/each}
</svelte:element>
