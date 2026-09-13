<script module lang="ts">
	import * as stylex from '@stylexjs/stylex';
	import { border, text, weight } from '$lib/vocabulary.stylex.ts';

	/**
	 * The visual half of the notes. Every colour is the token variable `libs/tokens` already
	 * declares, so nothing here can change one. See spec/architecture/css.md.
	 *
	 * The scoped block at the foot of this file is not a leftover of the migration. It keeps the
	 * geometry of the section and of the fold, including `--peek-height`, which the script reads
	 * back and the mask below is drawn against; it keeps the two `:global` rules reaching the
	 * marker, which the visual layer cannot address at all; it keeps the fold's mask and its
	 * heights, which are keyed on a data attribute no class can stand in for; and it keeps the
	 * note's link colour, whose hovered value is reached
	 * only through the note above it. That is an ancestor, and an ancestor is what the visual
	 * layer cannot see without a marker nobody owns yet. See spec/todo.md.
	 *
	 * Nothing in this block may write a tag in angle brackets, in a comment or anywhere else:
	 * oxfmt then deletes the whole instance script below, silently and with a zero exit status.
	 */
	const styles = stylex.create({
		/**
		 * The article's ending boundary, worn by the notes when they exist and by the newsletter
		 * otherwise -- see article.svelte. Dashed because what follows an article is offered
		 * rather than fenced off; the plain rule below the notes is then only a separator between
		 * two offerings.
		 *
		 * Top longhands rather than the whole-box shorthands the article shell writes it with:
		 * `border-top` left the other three edges at the reset's own width and style, and a
		 * whole-box `border-style` would dash three edges that are not drawn.
		 */
		notes: {
			borderTopWidth: border.hairlineRem,
			borderTopStyle: 'dashed',
			borderTopColor: 'var(--color-border)',
		},
		/**
		 * No font-size: it inherits the root size the article title and the newsletter heading
		 * render at, neither of which sets one either -- match by sharing the chain, not by
		 * copying a number.
		 */
		heading: {
			color: 'var(--color-text-strong)',
			fontWeight: weight.medium,
		},
		/**
		 * Small and quiet, the way a note at the foot of a page is: it is there to be stepped
		 * over and come back to, not read on the way past. Both were tried the other way -- set
		 * at the article's size and colour, the section competed with the prose above it for the
		 * same attention.
		 *
		 * The first attempt at quiet was grey and small with nothing to catch on, which read as
		 * somebody else's apparatus. What makes it work now is the phrase: it holds the article's
		 * own colour, so each note has one strong point to find it by and can be soft everywhere
		 * else.
		 */
		note: {
			fontSize: text.px11,
			lineHeight: 1.6,
			color: 'var(--color-text-soft)',
			// `balance` rather than `pretty`, which is the opposite of what the shape of the text
			// suggests -- a note is a sentence, and the prose elsewhere on this site uses
			// `pretty`. Measured on the Spanish view, `pretty` did nothing at all: every line of
			// every note came out identical to plain filling, because it only intervenes when the
			// last line is down to about one word, and these end on a quarter of a line instead.
			// Balance closed all four of the short endings. The rule follows the measurement
			// rather than the category.
			//
			// Declared on the note rather than on the line inside it, because this is the block
			// that establishes the lines; the span within it establishes none of its own.
			textWrap: 'balance',
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
			// The same 1.6 the notes read at, and it outranks the 1.25rem `focus-link` sets on
			// this element from the components layer exactly as the scoped rule did.
			lineHeight: 1.6,
			// A bare `:hover`, with no `(hover: hover)` around it, because a bare one is what the
			// rule this replaced was written as. Sameness first; see spec/architecture/css.md.
			color: {
				default: 'var(--color-text-soft)',
				':hover': 'var(--color-text-strong)',
				':focus-visible': 'var(--color-text-strong)',
			},
			// Visual under the rule in spec/architecture/css.md: it moves nothing, it says what
			// the element is to a pointer.
			cursor: 'pointer',
			// Reduced motion is the same suppression the control used to write as `transition:
			// none`, which is more than one longhand: the shorthand also returns the duration and
			// the curve to their initial values.
			transitionProperty: { default: 'color', '@media (prefers-reduced-motion: reduce)': 'none' },
			transitionDuration: { default: '200ms', '@media (prefers-reduced-motion: reduce)': '0s' },
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
			transitionDuration: { default: '200ms', '@media (prefers-reduced-motion: reduce)': '0s' },
			transitionTimingFunction: {
				default: 'ease-out',
				'@media (prefers-reduced-motion: reduce)': 'ease',
			},
		},
		/**
		 * Turning to face the other way is not a move: the box is where it was, and the glyph is
		 * the disclosure's state rather than its position. Written as a `transform` rather than
		 * as the `rotate` property, which is what the rule it replaces said and is a different
		 * computed property. See spec/architecture/css.md.
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
		 * The underline stays off -- eight dotted lines of apparatus would out-shout the article
		 * above them. The colour it rests at is in the block below, with the ancestor the
		 * hovered value is reached through.
		 */
		link: {
			textDecoration: 'none',
		},
		/**
		 * The way back, bright at rest like the number at the note's head: the two ends of the
		 * walk are the two points of colour, and everything between them is the reading.
		 */
		back: {
			// Sized against the note, not against the page, for the same reason the marker is.
			fontSize: '0.9em',
			color: 'var(--color-text-strong)',
			// Zero, so an arrow at the end of a wrapped note cannot open up the line it lands on.
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
	import type { ArticleNote } from '$lib/content/types';
	import type { LocaleCode } from '$lib/locale';

	/** `locale` is the view being rendered. Passed rather than read: see spec/locale.md. */
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
	 * Closing shortens the document. A reader near the end is then above a bottom that no longer
	 * exists, so the browser pulls them up to the new one -- correctly, and at the worst possible
	 * moment: the pull starts partway through the animation, the instant the document becomes
	 * shorter than the current scroll position, and it arrives as up to 50px in a single frame
	 * after a stretch of no movement at all. Measured on the article with thirty-three notes.
	 * That discontinuity is what reads as a lurch; the movement itself is unavoidable, because
	 * the reader is looking at the notes that are being folded away.
	 *
	 * So the movement is taken over and spent on the same curve as the height. Progress is read
	 * from the distance the panel has actually covered rather than from a clock, which keeps the
	 * scroll on the spring instead of on a second easing that would only agree with it by luck.
	 *
	 * Opening needs none of this: a longer document never forces the page to move.
	 *
	 * The reader wins any argument. Scrolling during the animation leaves the position away from
	 * where this last put it, and that is taken as the reader steering -- the carry stands down
	 * for the rest of the move rather than fighting for the wheel.
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
	 * Called before the scroll is asked for, and that is the whole of the timing.
	 * `scrollIntoView` resolves its destination at the moment it is called, so a fold opening
	 * afterwards pushes the note below the position the scroll is already travelling to and the
	 * reader lands short. Opening first is also what keeps it unseen: the section is still below
	 * the fold, so the height changes where nobody is looking and the reader arrives at a
	 * section that was simply already open. Animating it would be the visible version of the
	 * same thing, and slower than the scroll it is racing.
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
		// The move is not an address: see spec/styling.md.
		event.preventDefault();
		jumpTo(destination);
		// Light the words the reader is returning to. A marker in a heading has no wrapped
		// words -- the heading names itself -- so the marker alone takes the light there.
		const sup = destination.closest('sup.note-marker');
		const words = sup?.previousElementSibling;
		const target = words?.classList.contains('note-words') ? words : sup;
		if (target instanceof HTMLElement) flashOnArrival(target, 'each');
	}
</script>

<!-- Apparatus about the article, not part of it: this renders after the article closes, under
     the dashed rule that is the article's ending boundary, so the rail and the table of contents
     never measure it. The notes stay smaller than the prose they came from; the heading above
     them speaks at the page's shared section-name size. See spec/styling.md. -->
<section
	aria-label={m['article.notes']({}, { locale })}
	class="notes {stylex.attrs(styles.notes).class}"
>
	<!-- The heading speaks at the same size and colour as the article title and the newsletter
	     heading: three sections of one page, one voice for their names. Only the notes under it
	     stay small. -->
	<h2 class="notes-heading {stylex.attrs(styles.heading).class}">
		{m['article.notes']({}, { locale })}
	</h2>
	<ol class="notes-list">
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
				class="notes-list"
				start={SHOWN + 1}
				aria-hidden={foldHidden}
				inert={foldHidden}
			>
				{#each folded as note (note.number)}{@render entry(note)}{/each}
			</ol>
		</div>

		<button
			type="button"
			class="notes-toggle focus-link {stylex.attrs(styles.toggle).class}"
			aria-expanded={expanded}
			aria-controls={panelId}
			onclick={() => setExpanded(!expanded)}
		>
			{expanded
				? m['article.notes.fold']({}, { locale })
				: m['article.notes.unfold']({ count: folded.length }, { locale })}
			<span
				class="notes-chevron {stylex.attrs(styles.chevron, expanded && styles.chevronUp).class}"
				aria-hidden="true"
			>
				<ChevronDown class="size-[1.1em]" />
			</span>
		</button>
	{/if}
</section>

{#snippet entry(note: ArticleNote)}
	<li id="note-{note.number}" class="jump-target note {stylex.attrs(styles.note).class}">
		<!-- The words first, so a note names what it is about instead of asking the reader
		     to hold the sentence they left in their head. Then the same superscript the
		     marker in the prose is, which makes the two one thing seen twice -- hidden
		     from a screen reader, which is already being told the ordinal by the list.

		     The explanation is the way back, not just the arrow at its end: an icon-sized
		     target at the end of a wrapped line asks for aim this size of text does not
		     deserve. The phrase and its number stay outside the link -- they are the
		     note's address, not its content, and the address is what the walk returns to.
		     The link's accessible name stays the explanation itself -- an aria-label would
		     replace it -- and the purpose rides after it as words only a screen reader
		     gets. -->
		<span class="note-line"
			><span class="note-phrase {stylex.attrs(styles.phrase).class}">{note.phrase}</span><sup
				class="note-marker"
				aria-hidden="true">{note.number}</sup
			><a
				href="#marker-{note.number}"
				class="note-link focus-link {stylex.attrs(styles.link).class}"
				onclick={jumpBack}
				>{note.text}<span class="note-back {stylex.attrs(styles.back).class}" aria-hidden="true">
					<CornerDownLeft class="size-[1.1em]" />
				</span><span class="sr-only">
					({m['article.notes.back']({ number: note.number }, { locale })})</span
				></a
			></span
		>
	</li>
{/snippet}

<style>
	/* The spacing the article's ending boundary sits at -- the rule itself is at the head of this
	   file. It matches the newsletter's own (mt-16 plus its padding), so the boundary sits where
	   it always has whether or not an article carried notes. */
	.notes {
		margin-top: 4rem;
		padding-top: 1.5rem;
	}

	.notes-heading {
		margin: 0 0 0.75rem;
	}

	/* An ordered list still, for what a screen reader is told, with nothing of a list drawn: the
	   numbers a reader sees are the superscripts, which is how they were met in the prose. */
	.notes-list {
		display: flex;
		margin: 0;
		flex-direction: column;
		/* Tight, because at this size the notes are a block to be scanned rather than paragraphs
		   to be read apart. Spaced as they were for the larger text, two notes read as two
		   unrelated things. */
		gap: 0.25rem;
		padding: 0;
		list-style: none;
	}

	.note {
		margin: 0;
	}

	/* The fold. Closed, it stands one line tall so the next note starts and dissolves rather
	   than being cut off -- see the markup. The height is animated between measured numbers by
	   the shared disclosure the code blocks use, so the two open with one motion; `auto` at
	   rest, so an open fold still follows its own content when the window changes. */
	.notes-fold {
		--peek-height: 1.75rem;
		/* Positioned so that clipping actually holds. `overflow: hidden` does not clip an
		   absolutely positioned descendant whose containing block is further up, and every note
		   carries one: the way back's purpose, written for a screen reader as an `.sr-only` span,
		   which that utility takes out of flow with `position: absolute`. Folded, twenty-eight of
		   them escaped the clip and stood at their unclipped positions, adding a screen of empty
		   document below the page and a scrollbar to match. The height of the fold had nothing to
		   do with it, which is what made it look inexplicable. */
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

	/* The control sits under the fade, where the list ran out -- the reader's eye is already
	   there. What it looks like there is at the head of this file; this is the box it takes. */
	.notes-toggle {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		margin-top: 0.5rem;
		padding: 0;
	}

	.notes-chevron {
		display: inline-flex;
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

	/* The link is the explanation: it inherits the note's quiet colour and brightens whole
	   under the pointer, so hovering anywhere on those words says they are the control. The
	   phrase and number ahead of it sit outside and keep their resting look.

	   The resting colour stays here rather than in the visual layer, and the transition between
	   the two goes with it: the brightened value is reached through the note above, which is an
	   ancestor, and an ancestor is what the visual layer cannot see without a marker nobody owns
	   yet. Half a pair in each layer is what the code block's reveal refused for the same reason.
	   See spec/todo.md. */
	.note-link {
		color: inherit;
		transition: color 200ms ease-out;
	}

	/* Hover is read from the note, not from the link. A link is an inline box: it wraps into one
	   box per line, and the leading between two of those belongs to neither, so a pointer
	   crossing a wrapped note fell through the gap and the note went out mid-read. What the
	   reader is pointing at is the note, which is a block and has no gaps in it.

	   Not fixed by making the line an inline-block, which would also close the gap: the landing
	   light reads `getClientRects()` to slice itself across the wrap, and one block box would
	   collapse that back into a single rectangle. See note-flash.ts.

	   Focus stays on the link, because focus is where the keyboard actually is. */
	.note:hover .note-link,
	.note-link:focus-visible {
		color: var(--color-text-strong);
	}

	/* Trailing the last word, not parked at the right edge. The way back belongs to the sentence
	   that was just read, and a column of arrows down the right reads as a table's furniture. */
	.note-back {
		display: inline-flex;
		margin-inline-start: 0.35rem;
		vertical-align: -0.1em;
	}

	@media (prefers-reduced-motion: reduce) {
		.note-link {
			transition: none;
		}
	}
</style>
