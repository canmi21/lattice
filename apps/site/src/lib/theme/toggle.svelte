<script module lang="ts">
	import * as stylex from '@stylexjs/stylex';

	const styles = stylex.create({
		/**
		 * Bare, and not `surfaces.quietControl`.
		 *
		 * That surface is taken whole or not at all -- its own comment says the cursor arrives with
		 * the colour and the plate or none of them does -- and the plate is what this cannot have.
		 * The control sits alone in the action bar with nothing behind it, so a hover ground would
		 * be a rectangle appearing in empty margin. Its sibling above writes its own for the same
		 * reason. What is kept is what a control owes a reader: the hand, and ink that answers.
		 */
		control: {
			color: {
				default: 'var(--color-text-soft)',
				':hover': 'var(--color-text-strong)',
				':focus-visible': 'var(--color-text-strong)',
			},
			transitionProperty: 'color',
			transitionDuration: '150ms',
			transitionTimingFunction: 'ease',
		},
	});
</script>

<script lang="ts">
	import Moon from '@lucide/svelte/icons/moon';
	import Sun from '@lucide/svelte/icons/sun';
	import { applyTheme, currentTheme, themeCookie, type Theme } from '@canmi/theme';
	import type { LocaleCode } from '$lib/locale';
	import * as m from '$lib/paraglide/messages';

	let { locale }: { locale: LocaleCode } = $props();

	/**
	 * What is painted, not what was stored: the button reads the class `app.html`'s pre-paint
	 * script already put on `<html>`, once mounted, and renders neither icon until then. See
	 * spec/styling/controls.md, "The theme control is a button, not a menu".
	 */
	let theme = $state<Theme | undefined>();

	$effect(() => {
		theme = currentTheme();
	});

	/**
	 * Whether the icons have a change to play.
	 *
	 * Set only by a press. Arriving on a page is not a change of theme, and spinning the icon on
	 * every load would announce something that did not happen -- the same line the newsletter's
	 * confirmation draws between what the reader just did and what they are.
	 */
	let turn = $state(0);

	const next = $derived<Theme>(theme === 'dark' ? 'light' : 'dark');

	function toggle() {
		if (theme === undefined) return;
		theme = next;
		applyTheme(theme);
		// After the flip, never with it. `applyTheme` moves the class with every transition in the
		// document switched off -- that is what stops a card's hover fade from easing the page's
		// colours through greys -- and a turn written as a transition on these glyphs was switched
		// off along with them. An animation does not need a value to change, so it plays here on
		// its own terms, one frame later, against a page that has already finished.
		turn += 1;
		// Path and lifetime come from the library, so this and the first-visit script cannot
		// disagree about a preference the reader set once.
		document.cookie = themeCookie(theme);
	}
</script>

<!-- One cell holding both glyphs, so the row's height is the taller of the two in every state and
     nothing below the button moves as it changes. The label names what the press will do rather
     than what is showing: a control in a row of controls is read for its effect. -->
<button
	type="button"
	onclick={toggle}
	aria-label={m['theme.switch']({}, { locale })}
	aria-pressed={theme === 'dark'}
	class="inline-flex cursor-pointer items-center {stylex.attrs(styles.control).class}"
>
	<!-- `turn` keys the span, so every press replaces the node and the animation below starts from
	     its first frame rather than being a class that is already on. -->
	{#key turn}
		<span class="dial focus-link-inner inline-grid place-items-center" class:turning={turn > 0}>
			<Sun class="sun size-3.5" aria-hidden="true" />
			<Moon class="moon size-3.5" aria-hidden="true" />
		</span>
	{/key}
</button>

<style>
	/* Both glyphs in one grid cell -- the cell itself is `inline-grid place-items-center` in the
	   markup. `visibility` rather than `display` so the box still measures in either state and the
	   two can cross without the row reflowing. These reach an icon component's own element, which
	   no class here can carry. */
	.dial :global(svg) {
		grid-area: 1 / 1;
		visibility: hidden;
		opacity: 0;
		/* The turn is the whole animation: one leaves the way the other arrives, so the press
		   reads as one dial rotating rather than two icons swapping. */
		rotate: -90deg;
		scale: 0.6;
	}

	/* The root's class decides, and `hooks.server.ts` writes it from the cookie -- so the very
	   markup the server sends already shows the right glyph, with no script and no second frame.
	   A first visit has no cookie to read, and there the pre-paint script in `app.html` puts the
	   class on before anything is painted, which lands in the same place one step later. */
	:global(html:not(.dark)) .dial :global(svg.sun),
	:global(html.dark) .dial :global(svg.moon) {
		visibility: visible;
		opacity: 1;
		rotate: 0deg;
		scale: 1;
	}

	/* Only after a press. A page that loads already dark has not just changed.

	   Fast, and with no overshoot. The theme itself lands in a single frame -- nothing transitions
	   `--color-page` -- so a spring here left the glyph still settling over a page that had already
	   finished, and the pair read as hesitant rather than as one act. `ease-out` rather than
	   `--ease-spring` for the same reason: a bounce is a thing still deciding. */
	.turning :global(svg.sun),
	.turning :global(svg.moon) {
		animation: arrive 200ms ease-out both;
	}

	/* The glyph that is leaving is already gone by the time this runs -- the flip is instant -- so
	   what is animated is the one arriving, turning in from where the other one left. */
	@keyframes arrive {
		from {
			opacity: 0;
			rotate: -90deg;
			scale: 0.6;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.turning :global(svg.sun),
		.turning :global(svg.moon) {
			animation: none;
		}
	}
</style>
