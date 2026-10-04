<script module lang="ts">
	import * as stylex from '@stylexjs/stylex';
	import { titleStyles } from './section-title.ts';

	/**
	 * The heading, as the anchor button's `when.ancestor` sees it. See anchor-button.svelte.
	 */
	const heading = stylex.defaultMarker();
</script>

<script lang="ts">
	import AnchorButton from './anchor-button.svelte';
	import type { Snippet } from 'svelte';

	let {
		slug,
		depth = 2,
		notes = [],
		children,
	}: { slug: string; depth?: number; notes?: number[]; children: Snippet } = $props();
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
	<AnchorButton target={slug} label="Copy link to section" />
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
