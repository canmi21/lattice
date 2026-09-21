<script module lang="ts">
	import * as stylex from '@stylexjs/stylex';
	import { surfaces } from '$lib/surfaces.ts';
	import { border, duration, line, text, weight } from '$lib/vocabulary.stylex.ts';

	/**
	 * The visual half of the notes. Every colour is the token variable `libs/tokens` already
	 * declares, so nothing here can change one. See spec/architecture/css/authoring.md.
	 *
	 * The scoped block below keeps the section's and fold's geometry, the `:global` marker rules,
	 * and the note-link's hovered colour -- see spec/todo.md, "Ancestor state reaches the visual
	 * layer only through a marker nobody owns". See spec/architecture/css/authoring.md, "A comment in
	 * the module script cannot write a tag in angle brackets", for why this block must not.
	 */
	const styles = stylex.create({
		/**
		 * The article's ending boundary, worn by the notes when they exist and by the newsletter
		 * otherwise -- see article.svelte. Dashed because what follows an article is offered
		 * rather than fenced off; the plain rule below the notes then only separates two offerings.
		 *
		 * Top longhands rather than the whole-box shorthands the article shell uses: `border-top`
		 * left the other three edges at the reset's own width and style, and a whole-box
		 * `border-style` would dash three edges that are not drawn.
		 */
		notes: {
			borderTopWidth: border.hairlineRem,
			borderTopStyle: 'dashed',
			borderTopColor: 'var(--color-border)',
		},
		/**
		 * Small and quiet, the way a note at the foot of a page is: stepped over and come back
		 * to, not read on the way past. Set at the article's own size and colour, the section
		 * competed with the prose above it for the same attention.
		 *
		 * Grey and small alone read as somebody else's apparatus. What makes it work is the
		 * phrase holding the article's own colour, giving each note one strong point to find it
		 * by while the rest stays soft.
		 */
		note: {
			fontSize: text.px11,
			lineHeight: line.relaxed,
			color: 'var(--color-text-soft)',
		},
		/**
		 * Quiet like the notes and brightening whole on approach, the same way a note's own
		 * explanation does: one gesture vocabulary for this section.
		 */
		toggle: {
			// A button's frame, taken off. The reset leaves every edge at zero width and `solid`,
			// so the style is stated too: the rule this replaced was `border: 0`, which returns it
			// to `none`.
			borderWidth: 0,
			borderStyle: 'none',
			backgroundColor: 'transparent',
			fontSize: text.px11,
			// The same line the notes read at, and it outranks the 1.25rem `focus-link` sets on
			// this element from the components layer exactly as the scoped rule did.
			lineHeight: line.relaxed,
			// A bare `:hover`, with no `(hover: hover)` around it, because a bare one is what the
			// rule this replaced was written as. Sameness first; see spec/architecture/css/migration.md.
			color: {
				default: 'var(--color-text-soft)',
				':hover': 'var(--color-text-strong)',
				':focus-visible': 'var(--color-text-strong)',
			},
			// Reduced motion is the same suppression the control used to write as `transition:
			// none`, which is more than one longhand: the shorthand also returns the duration and
			// the curve to their initial values.
			transitionProperty: { default: 'color', '@media (prefers-reduced-motion: reduce)': 'none' },
			transitionDuration: {
				default: duration.base,
				'@media (prefers-reduced-motion: reduce)': '0s',
			},
			transitionTimingFunction: {
				default: 'ease-out',
				'@media (prefers-reduced-motion: reduce)': 'ease',
			},
		},
		chevron: {
			transitionProperty: {
				default: 'transform',
				'@media (prefers-reduced-motion: reduce)': 'none',
			},
			transitionDuration: {
				default: duration.base,
				'@media (prefers-reduced-motion: reduce)': '0s',
			},
			transitionTimingFunction: {
				default: 'ease-out',
				'@media (prefers-reduced-motion: reduce)': 'ease',
			},
		},
		/**
		 * Turning to face the other way is not a move: the box is where it was, and the glyph is
		 * the disclosure's state rather than its position. Written as a `transform` rather than
		 * as the `rotate` property, which is what the rule it replaces said and is a different
		 * computed property. See spec/architecture/css/migration.md.
		 */
		chevronUp: {
			transform: 'rotate(180deg)',
		},
		/**
		 * The quoted words are the article's, said again -- weight alone marks them. Colour is
		 * spent on the number and the arrow instead: the two ends of the walk, which note this is
		 * and the way back from it.
		 */
		phrase: {
			fontWeight: weight.medium,
		},
		/**
		 * The way back, bright at rest like the number at the note's head: the two ends of the
		 * walk are the two points of colour, and everything between them is the reading.
		 */
		back: {
			// Sized against the note, not against the page, for the same reason the marker is.
			// unnamed: relative to whatever encloses it, so no rung of a rem ladder can hold it.
			fontSize: '0.9em',
			color: 'var(--color-text-strong)',
			// Zero, so an arrow at the end of a wrapped note cannot open up the line it lands on.
			// unnamed: a box made to contribute nothing, which is below the ladder's floor of 1.
			lineHeight: 0,
		},
	});
</script>

<script lang="ts">
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import CornerDownLeft from '@lucide/svelte/icons/corner-down-left';
	import * as m from '$lib/paraglide/messages';
	import { jumpTo, movesThisPage, targetOf } from '$lib/client/jump';
	import { animateHeight, type AnimationControl, type CollapsePhase } from '$lib/client/collapse';
	import { DEFAULT_PIXELS_PER_REM } from '$lib/client/units';
	import { onDestroy } from 'svelte';
	import { flashOnArrival } from './note-flash';
	import { offerNoteReveal } from './note-reveal';
	import type { ArticleNote } from '@canmi/artifacts/types';
	import type { LocaleCode } from '$lib/locale';

	/** `locale` is the view being rendered. Passed rather than read: see
	 *  spec/locale/addressing.md. */
	let { notes, locale }: { notes: ArticleNote[]; locale: LocaleCode } = $props();

	/**
	 * How many notes stand outside the fold.
	 *
	 * Enough to see that this is a list and how dense it is, few enough that a long article's
	 * apparatus cannot outweigh the article. A count rather than a height: the notes vary in
	 * length, and folding by height would cut one mid-sentence at a boundary nobody chose.
	 */
	const SHOWN = 5;

	const shown = $derived(notes.slice(0, SHOWN));
	const folded = $derived(notes.slice(SHOWN));
	const collapsible = $derived(folded.length > 0);

	let expanded = $state(false);
	let phase = $state<CollapsePhase>('collapsed');
	let foldEl = $state<HTMLElement>();
	let motion: AnimationControl | undefined;

	const instanceId = $props.id();
	const panelId = `${instanceId}-folded-notes`;
	const foldHidden = $derived(collapsible && !expanded);

	function settle(nextExpanded: boolean) {
		// Back to `auto`, never pinned to the number it landed on: a panel held at a measured
		// height stops following its own content when the window resizes or a font arrives.
		if (foldEl) foldEl.style.height = nextExpanded ? 'auto' : '';
		phase = nextExpanded ? 'expanded' : 'collapsed';
		motion = undefined;
	}

	/** The closed height, read from the stylesheet so the peek and its fade stay one number. */
	function peekPixels(element: HTMLElement): number {
		const rem =
			Number.parseFloat(getComputedStyle(document.documentElement).fontSize) ||
			DEFAULT_PIXELS_PER_REM;
		return Number.parseFloat(getComputedStyle(element).getPropertyValue('--peek-height')) * rem;
	}

	/**
	 * Open or close the fold, playing the move unless `animated` says not to.
	 *
	 * The unanimated path is not an optimisation -- it is what a jump into a folded note needs.
	 * See `reveal`.
	 */
	function setExpanded(nextExpanded: boolean, animated = true) {
		if (!collapsible || nextExpanded === expanded || !foldEl) return;
		motion?.stop();
		motion = undefined;
		expanded = nextExpanded;

		if (!animated) {
			settle(nextExpanded);
			return;
		}

		phase = nextExpanded ? 'expanding' : 'collapsing';
		const target = nextExpanded ? foldEl.scrollHeight : peekPixels(foldEl);
		const carry = scrollCarry(foldEl.getBoundingClientRect().height, target);
		motion = animateHeight(
			foldEl,
			target,
			(finished) => {
				if (finished !== undefined && motion !== finished) return;
				settle(nextExpanded);
			},
			carry,
		);
	}

	/**
	 * Move the page in step with the fold, when closing it would otherwise drag the page along.
	 *
	 * See spec/styling/notes.md, "Closing the fold carries the page with it", for why this is needed
	 * and the measurement behind it.
	 */
	function scrollCarry(from: number, to: number): ((height: number) => void) | undefined {
		const shrink = from - to;
		if (shrink <= 0) return undefined;
		const start = window.scrollY;
		const end = Math.max(0, Math.min(start, maxScroll() - shrink));
		if (Math.abs(end - start) < 1) return undefined;

		let placed = start;
		let steering = false;
		return (height) => {
			if (steering) return;
			if (Math.abs(window.scrollY - placed) > 1) {
				steering = true;
				return;
			}
			const covered = (from - height) / shrink;
			const next = Math.round(start + (end - start) * Math.min(1, Math.max(0, covered)));
			window.scrollTo(0, next);
			placed = next;
		};
	}

	/** How far the page can scroll, which closing the fold is about to reduce. */
	function maxScroll(): number {
		return Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
	}

	/**
	 * Open the fold for a note the reader is about to be carried to, without playing it.
	 *
	 * Called before the scroll is asked for: `scrollIntoView` resolves its destination at that
	 * moment, so opening afterwards pushes the note past where the scroll is already headed.
	 * Opening first also keeps it unseen -- the section is still below the fold, so the height
	 * changes where nobody is looking -- and unanimated, since animating it would be the visible
	 * version of the same thing and slower than the scroll it is racing.
	 */
	function reveal(target: Element): boolean {
		if (!collapsible || expanded || !foldEl?.contains(target)) return false;
		setExpanded(true, false);
		return true;
	}

	$effect(() => offerNoteReveal(reveal));

	onDestroy(() => motion?.stop());

	/**
	 * The way back, scrolled rather than jumped -- the same move the markers make, owned here
	 * because this section renders outside the article body whose delegation covers them. A
	 * component's own links do not need delegating; compiled prose has no component, which is
	 * what the delegation in body.svelte is for.
	 */
	function jumpBack(event: MouseEvent & { currentTarget: HTMLAnchorElement }) {
		if (!movesThisPage(event)) return;
		const destination = targetOf(event.currentTarget);
		if (!destination) return;
		// The move is not an address: see spec/styling/notes.md.
		event.preventDefault();
		jumpTo(destination);
		// Light the words the reader is returning to. A marker in a heading has no wrapped
		// words -- the heading names itself -- so the marker alone takes the light there, and it
		// is section.svelte's, which writes the class alone. Hence both spellings for the marker
		// and one for the words, which only the compiler writes.
		// See spec/architecture/css/authoring.md.
		const sup = destination.closest('sup.note-marker, sup[data-note-marker]');
		const words = sup?.previousElementSibling;
		const target = words?.matches('[data-note-words]') === true ? words : sup;
		if (target instanceof HTMLElement) flashOnArrival(target, 'each');
	}
</script>

<!-- Apparatus about the article, not part of it: this renders after the article closes, under
     the dashed rule that is the article's ending boundary, so the rail and the table of contents
     never measure it. The notes stay smaller than the prose they came from; the heading above
     them speaks at the page's shared section-name size. See spec/styling/notes.md. -->
<section
	aria-label={m['article.notes']({}, { locale })}
	class="mt-16 pt-6 {stylex.attrs(styles.notes).class}"
>
	<!-- The heading speaks at the same size and colour as the article title and the newsletter
	     heading: three sections of one page, one voice for their names. Only the notes under it
	     stay small. -->
	<!-- No font-size: it inherits the root size the article title and the newsletter heading render
	at, neither of which sets one either -- match by sharing the chain, not by copying a number. -->
	<h2 class="mx-0 mt-0 mb-3 {stylex.attrs(surfaces.heading).class}">
		{m['article.notes']({}, { locale })}
	</h2>
	<ol class="m-0 flex list-none flex-col gap-1 p-0">
		{#each shown as note (note.number)}{@render entry(note)}{/each}
	</ol>

	{#if collapsible}
		<!-- The rest, behind a fold that leaves the next note's first line showing and fades it
		     out. The fade is the honest half of the disclosure: a hard cut says the list ends
		     here, while text dissolving mid-line says it continues and something is holding it
		     back. The count on the control then says how much. -->
		<div bind:this={foldEl} class="notes-fold" data-phase={phase}>
			<!-- A second list rather than more items in the first: `ol` takes only list items, so
			     a fold that can be measured and animated has to be an element the list cannot
			     contain. `start` keeps the ordinals a screen reader announces true to the
			     numbers printed beside them. -->
			<ol
				id={panelId}
				class="m-0 flex list-none flex-col gap-1 p-0"
				start={SHOWN + 1}
				aria-hidden={foldHidden}
				inert={foldHidden}
			>
				{#each folded as note (note.number)}{@render entry(note)}{/each}
			</ol>
		</div>

		<button
			type="button"
			class="focus-link mt-2 inline-flex cursor-pointer items-center gap-1 p-0 {stylex.attrs(
				styles.toggle,
			).class}"
			aria-expanded={expanded}
			aria-controls={panelId}
			onclick={() => setExpanded(!expanded)}
		>
			{expanded
				? m['article.notes.fold']({}, { locale })
				: m['article.notes.unfold']({ count: folded.length }, { locale })}
			<span
				class="inline-flex {stylex.attrs(styles.chevron, expanded && styles.chevronUp).class}"
				aria-hidden="true"
			>
				<ChevronDown class="size-[1.1em]" />
			</span>
		</button>
	{/if}
</section>

{#snippet entry(note: ArticleNote)}
	<!-- `balance` over the categorically-right `pretty` -- measured, not reasoned; see
	     spec/styling/notes.md, "A wrapped note is balanced, and that was measured rather than
	     reasoned".

	     Declared on the note rather than the line inside it: this is the block that establishes
	     the lines, and the span within it establishes none of its own. -->
	<li
		id="note-{note.number}"
		class="jump-target note m-0 text-balance {stylex.attrs(styles.note).class}"
	>
		<!-- Words, marker, then link: see spec/styling/notes.md, "A note names its words first, then
		     its number, then what it says" and "The number is the same superscript that marked
		     it in the prose", for the ordering and why the marker is hidden from a screen reader.
		     The phrase and number stay outside the link -- they are the note's address, not its
		     content -- and the link's accessible name stays the explanation itself, with the
		     purpose after it as words only a screen reader gets. -->
		<!-- The link's underline stays off: eight dotted lines of apparatus would out-shout the
		     article above them. Suppressing a browser default names nothing, so it is the frame
		     rather than the visual layer -- spec/architecture/css/layers.md, "What each layer owns,
		     by name". The colour it rests at is in the block at the foot, with the ancestor the
		     hovered value is reached through. -->
		<span class="note-line"
			><span class="note-phrase {stylex.attrs(styles.phrase).class}">{note.phrase}</span><sup
				class="note-marker"
				aria-hidden="true">{note.number}</sup
			><a href="#marker-{note.number}" class="note-link focus-link no-underline" onclick={jumpBack}
				>{note.text}<span
					class="ms-[0.35rem] inline-flex align-[-0.1em] {stylex.attrs(styles.back).class}"
					aria-hidden="true"
				>
					<CornerDownLeft class="size-[1.1em]" />
				</span><span class="sr-only">
					({m['article.notes.back']({ number: note.number }, { locale })})</span
				></a
			></span
		>
	</li>
{/snippet}

<style>
	/* The fold. Closed, it stands one line tall so the next note starts and dissolves rather
	   than being cut off -- see the markup. The height is animated between measured numbers by
	   the shared disclosure the code blocks use, so the two open with one motion; `auto` at
	   rest, so an open fold still follows its own content when the window changes. */
	.notes-fold {
		--peek-height: 1.75rem;
		/* Positioned so the clip actually holds -- see spec/styling/notes.md, "A fold that clips has
		   to be positioned". */
		position: relative;
		overflow: hidden;
		height: var(--peek-height);
	}

	/* Not a gradient drawn over the text: a mask, so whatever the theme paints behind the page
	   is what shows through. A translucent overlay in the paper's colour would be a second
	   place the background is written down, and would be wrong the moment either changes. */
	.notes-fold:not([data-phase='expanded']) {
		mask-image: linear-gradient(to bottom, black 0.35rem, transparent);
	}

	.notes-fold[data-phase='expanded'] {
		height: auto;
	}

	.notes-fold[data-phase='collapsing'],
	.notes-fold[data-phase='expanding'] {
		will-change: height;
	}

	/* Descendant rather than child: the marker sits inside .note-line, which the landing light
	   below needs in order to fill the whole sentence. A child combinator here silently stopped
	   matching when that wrapper arrived, and the number went quiet with no rule left to say so. */
	.note :global(.note-marker) {
		color: var(--color-text-strong);
	}

	/* Here the marker sits between the phrase and the note, so it needs air on the side facing
	   the note. In the prose it follows the word it belongs to and must not be spaced off it. */
	.note :global(.note-marker) {
		margin-inline-end: 0.3rem;
	}

	/* The link is the explanation: it inherits the note's quiet colour and brightens whole under
	   the pointer, so hovering anywhere on those words says they are the control. The phrase and
	   number ahead of it sit outside and keep their resting look.

	   The resting colour and its transition stay here rather than in the visual layer: the
	   brightened value is reached through this ancestor -- see spec/todo.md, "Ancestor state
	   reaches the visual layer only through a marker nobody owns". */
	.note-link {
		color: inherit;
		transition: color 200ms ease-out;
	}

	/* Hover is read from the note, not the link: a link is an inline box, wrapping into one box
	   per line with a gap between them neither owns, so a pointer crossing a wrapped note fell
	   through it and the note went dark mid-read. The note is a block and has no such gap.

	   Not fixed by an inline-block line either: note-flash.ts reads `getClientRects()` to slice
	   the landing light across the wrap, and one block box would collapse that back to one
	   rectangle. Focus stays on the link, since focus is where the keyboard actually is. */
	.note:hover .note-link,
	.note-link:focus-visible {
		color: var(--color-text-strong);
	}

	@media (prefers-reduced-motion: reduce) {
		.note-link {
			transition: none;
		}
	}
</style>
