<script lang="ts">
	import type { Snippet } from 'svelte';

	/**
	 * Two glyphs in one cell, one showing, turning when that changes.
	 *
	 * The theme control's effect lifted out of it: the glyph arriving turns in from where the one
	 * leaving went, so a change reads as one dial rotating rather than two icons swapping. This
	 * owns the cell and the turn. **Which face shows is the caller's**, because the two callers
	 * know it differently -- a class the server wrote, or which way the reader last scrolled --
	 * and answering it for both would take a flag naming which kind of caller this had.
	 */
	let {
		shown,
		first,
		second,
		class: className = '',
	}: {
		/** Which face is at rest. The other is turned out. */
		shown: 'first' | 'second';
		first: Snippet;
		second: Snippet;
		class?: string;
	} = $props();

	/**
	 * Whether a change has happened yet, rather than whether one is happening.
	 *
	 * The turn plays on a change and never on arrival: a page that loads already showing the
	 * second face has not just turned to it, and animating on mount would announce something that
	 * did not happen. An effect settles this after the first paint, which is exactly late enough.
	 */
	let arrived = $state(false);
	$effect(() => {
		arrived = true;
	});
</script>

<span class="dial inline-grid place-items-center {className}" class:arrived>
	<span class="face" data-shown={shown === 'first'}>{@render first()}</span>
	<span class="face" data-shown={shown === 'second'}>{@render second()}</span>
</span>

<style>
	/* Both faces in one cell. `visibility` rather than `display` so the box measures the same in
	   either state and nothing around it moves as the two cross. */
	.face {
		grid-area: 1 / 1;
		display: inline-grid;
		place-items: center;
		visibility: hidden;
		opacity: 0;
		rotate: -90deg;
		scale: 0.6;
	}

	.face[data-shown='true'] {
		visibility: visible;
		opacity: 1;
		rotate: 0deg;
		scale: 1;
	}

	/* An animation rather than a transition, because a caller may be changing this in the same
	   frame as something that suppresses transitions document-wide -- which is what the theme flip
	   does to stop a card's hover fade easing the page's colours through greys. An animation needs
	   no value to change and is not switched off with them. */
	.arrived .face[data-shown='true'] {
		animation: arrive 200ms ease-out both;
	}

	@keyframes arrive {
		from {
			opacity: 0;
			rotate: -90deg;
			scale: 0.6;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.arrived .face[data-shown='true'] {
			animation: none;
		}
	}
</style>
