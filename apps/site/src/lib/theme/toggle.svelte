<script module lang="ts">
	import * as stylex from '@stylexjs/stylex';
	import { surfaces } from '$lib/surfaces.ts';

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
	import { untrack } from 'svelte';
	import Moon from '@lucide/svelte/icons/moon';
	import Sun from '@lucide/svelte/icons/sun';
	import { applyTheme, themeCookie, type Theme } from '@canmi/theme';
	import Dial from '$lib/components/dial.svelte';
	import type { LocaleCode } from '$lib/locale';
	import * as m from '$lib/paraglide/messages';

	/**
	 * The theme arrives as a value, settled on the server beside the class it wrote.
	 *
	 * It used to be read back off `<html>` in an effect, which runs after the first paint -- so the
	 * button drew neither glyph until then. The cookie already answered this before the document
	 * was sent; taking the answer rather than deriving it is what makes the first frame right.
	 */
	let { locale, theme: painted }: { locale: LocaleCode; theme: Theme } = $props();

	// This prop is an initial state, not a command: the server answers once, and a press owns the
	// value after. `untrack` says that in the code rather than leaving a compiler warning to be
	// silenced -- the same reading a disclosure's `initiallyExpanded` gets in code-block.svelte.
	let theme = $state<Theme>(untrack(() => painted));

	function toggle() {
		theme = theme === 'dark' ? 'light' : 'dark';
		applyTheme(theme);
		// Path and lifetime come from the library, so this and the first-visit script cannot
		// disagree about a preference the reader set once.
		document.cookie = themeCookie(theme);
	}
</script>

<!-- The label names what the press will do rather than what is showing: a control is read for
     its effect. The dial holds both glyphs and turns between them. -->
<button
	type="button"
	onclick={toggle}
	aria-label={m['theme.switch']({}, { locale })}
	aria-pressed={theme === 'dark'}
	class="inline-flex cursor-pointer items-center {stylex.attrs(
		surfaces.focusRingHost,
		styles.control,
	).class}"
>
	<Dial
		class="focus-link-inner {stylex.attrs(surfaces.focusLinkInner).class}"
		shown={theme === 'dark' ? 'second' : 'first'}
	>
		{#snippet first()}<Sun class="size-3.5" aria-hidden="true" />{/snippet}
		{#snippet second()}<Moon class="size-3.5" aria-hidden="true" />{/snippet}
	</Dial>
</button>
