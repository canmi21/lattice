<script lang="ts">
	/**
	 * The root compiled prose is drawn under, and the rules that reach into it.
	 *
	 * Those rules are the escape hatch -- the elements they style carry no class -- and an escape
	 * hatch belongs to the component rendering the root of the subtree it styles. Two components
	 * render that root now: the article page, around the compiled body, and the CMS editor, around
	 * the text being written. So the root is its own component and both draw it, rather than the
	 * rules living with one and being copied into the other. See spec/architecture/css/layers.md,
	 * "An escape hatch lives with the element it starts from".
	 *
	 * The body's own size and line arrive here too, so what is inside reads at the article's
	 * measure wherever this is drawn. The class `article-body` is an address the rail measures by.
	 */
	import * as stylex from '@stylexjs/stylex';
	import type { Snippet } from 'svelte';
	import { bodyStyles } from './article-body.ts';

	let { class: className = '', children }: { class?: string; children: Snippet } = $props();
</script>

<!-- A class handed in is merged with this one rather than replacing it. See
     spec/architecture/css/authoring.md, "A class handed to a child is the same hazard one level up". -->
<div class="article-body {stylex.attrs(bodyStyles.body).class} {className}">
	{@render children()}
</div>

<style>
	.article-body :global(strong) {
		font-weight: 500;
		color: var(--color-text-strong);
	}

	.article-body :global(s) {
		color: var(--color-text-soft);
	}

	/* A note's marker. It rides above the line it interrupts and stays smaller than the words
	   around it: a reader following the sentence should be able to pass over it, and a reader
	   looking for it should find it without hunting. Global because prose markers arrive as
	   compiled HTML while a heading's are written by section.svelte -- one appearance, two
	   origins, and one address now that both write it. See spec/styling/notes.md. */
	.article-body :global([data-note-marker]) {
		/* Relative, so one ratio serves both places a marker appears: beside prose it lands where
		   the absolute 0.6875rem used to, and in the smaller notes below it shrinks with them. */
		font-size: 0.73em;
		font-variant-numeric: tabular-nums;
		line-height: 0;
	}

	.article-body :global([data-note-marker-link]) {
		padding-inline: 0.0625rem;
		color: var(--color-text-soft);
		text-decoration: none;
		transition: color 200ms ease-out;
	}

	.article-body :global([data-note-marker-link]:hover),
	.article-body :global([data-note-marker-link]:focus-visible) {
		color: var(--color-text-strong);
	}

	@media (prefers-reduced-motion: reduce) {
		.article-body :global([data-note-marker-link]) {
			transition: none;
		}
	}

	/* The marker's own tint for a walk back, keyed off the class note-flash.ts sets on the noted
	   words -- see spec/styling/notes.md, "The walk back from a note lights the words it lands on",
	   for the overlay itself. Under reduced motion the tint simply is: the information is kept,
	   the animation is not. */

	/* .note-return stays a class: a script adds it at runtime, so no published article carries one
	   and there is nothing to migrate. One arm per shape lit -- in prose the words are flashed and
	   the marker follows them, in a heading there are no wrapped words and the marker is flashed
	   itself. */
	.article-body :global(.note-return + [data-note-marker] [data-note-marker-link]),
	.article-body :global([data-note-marker].note-return [data-note-marker-link]) {
		animation: note-return-marker 1.8s ease-out both;
	}

	@keyframes -global-note-return-marker {
		0% {
			color: var(--color-text-soft);
		}
		7%,
		67% {
			color: var(--color-text-strong);
		}
		100% {
			color: var(--color-text-soft);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.article-body :global(.note-return + [data-note-marker] [data-note-marker-link]),
		.article-body :global([data-note-marker].note-return [data-note-marker-link]) {
			animation: none;
			color: var(--color-text-strong);
		}
	}

	/* A spoiler keeps its words in the line but out of view until asked: fogged by blur, lifted
	   while hovered or focused, restored when the reader moves away. `:focus`, not
	   `:focus-visible` -- a tap's focus is the only reveal a touch screen has, and revealing is
	   the element's whole job, unlike the ring, which stays keyboard-only via .focus-link.
	   See spec/styling/notes.md. */
	.article-body :global([data-spoiler]) {
		border-radius: 0.25rem;
		cursor: pointer;
		filter: blur(0.28em);
		transition: filter 200ms ease-out;
	}

	.article-body :global([data-spoiler]:hover),
	.article-body :global([data-spoiler]:focus) {
		filter: none;
	}

	@media (prefers-reduced-motion: reduce) {
		.article-body :global([data-spoiler]) {
			transition: none;
		}
	}

	/* A quoted source is a prose inset, not an authored callout. See spec/styling/prose.md. */
	.article-body :global(blockquote) {
		padding: 1rem 1.125rem 1rem 1.375rem;
		border-left: 0.125rem solid var(--color-border-strong);
		border-radius: 0 0.625rem 0.625rem 0;
		background: var(--color-paper-hover);
		color: var(--color-text-strong);
	}

	.article-body :global(blockquote > p + p) {
		margin-top: 0.75rem;
	}

	.article-body :global(hr) {
		width: 18.75%;
		height: 0.125rem;
		margin: 2.5rem auto;
		border: 0;
		background: linear-gradient(
			to right,
			var(--color-border-strong) 0 12%,
			transparent 12% 22%,
			var(--color-border-strong) 22% 34%,
			transparent 34% 44%,
			var(--color-border-strong) 44% 56%,
			transparent 56% 66%,
			var(--color-border-strong) 66% 78%,
			transparent 78% 88%,
			var(--color-border-strong) 88% 100%
		);
	}

	.article-body :global(code:not(pre code)) {
		box-shadow: inset 0 0 0 0.0625rem var(--color-border-strong);
		border-radius: 0.375rem;
		background: var(--color-paper);
		padding: 0.125rem 0.375rem;
		font-size: 0.875rem;
	}

	/* A table the markdown compiler wrote, reached from here because it carries no class -- which
	   is question one's answer in spec/architecture/css/layers.md.

	   `border-collapse: separate` is what lets the frame keep its corner: collapsing merges the
	   outer border into the cells' and the radius then clips a line that is no longer there. Cell
	   borders go on two edges only, so no interior line is drawn twice. */
	.article-body :global(table) {
		width: 100%;
		border-width: 1px;
		border-style: solid;
		border-color: var(--color-border);
		border-radius: 0.75rem;
		border-spacing: 0;
		border-collapse: separate;
		overflow: hidden;
	}

	/* Three grounds, counting the page the frame sits on. The head takes the step off the sheet and
	   the rows take the sheet, which reads as a band behind the rows in light and as a chip over
	   them in dark; a pair that mirrors cannot be deeper in both, and light is the half this was
	   judged on. spec/todo/site.md, "A table head wants a ground that stays the darker one in both
	   themes". */
	.article-body :global(tbody) {
		background-color: var(--color-paper);
	}

	.article-body :global(thead) {
		background-color: var(--color-paper-hover);
	}

	.article-body :global(th),
	.article-body :global(td) {
		border-inline-end: 1px solid var(--color-border);
		border-block-end: 1px solid var(--color-border);
		padding-block: 0.625rem;
		padding-inline: 0.875rem;
		text-align: start;
		vertical-align: baseline;
		overflow-wrap: break-word;
	}

	/* The frame already draws the last column's right edge and the last row's bottom, so the cells
	   there stop short of doubling it. */
	.article-body :global(tr > :last-child) {
		border-inline-end: 0;
	}

	.article-body :global(tbody tr:last-child > *) {
		border-block-end: 0;
	}

	/* A heading at the weight and ink this prose already gives a `strong`, rather than the bold a
	   `th` renders at by default. */
	.article-body :global(th) {
		font-weight: 500;
		color: var(--color-text-strong);
	}
</style>
