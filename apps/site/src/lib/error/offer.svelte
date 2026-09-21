<script module lang="ts">
	import * as stylex from '@stylexjs/stylex';

	/**
	 * The two ways out of an error page, as one sentence. See spec/architecture/css/authoring.md.
	 *
	 * No tag in angle brackets may appear anywhere in this block, comments included -- see
	 * spec/architecture/css/authoring.md, "A comment in the module script cannot write a tag in angle
	 * brackets".
	 */
	const styles = stylex.create({
		/** The address and the form, at the strength of the text they sit in until pointed at. */
		control: {
			color: {
				default: 'var(--color-text)',
				':hover': 'var(--color-text-strong)',
			},
		},
		/**
		 * The form's button only. Nothing else declares its `transition`, while the address is a
		 * `spring-underline`, whose shorthand sets all four longhands from the components layer --
		 * so this one would outrank it and stop the underline springing. See
		 * spec/architecture/css/layers.md.
		 */
		fade: {
			transitionProperty: 'color',
			transitionDuration: '150ms',
			transitionTimingFunction: 'ease',
		},
	});
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import { ParaglideMessage } from '@inlang/paraglide-js-svelte';
	import type { LocaleCode } from '$lib/locale';
	import * as m from '$lib/paraglide/messages';
	import { site } from '$lib/site';

	/**
	 * What an error page offers a reader who wants to do something about it.
	 *
	 * Its own component because it appears in two places that are otherwise nothing alike -- at
	 * the foot of a page that has a status code, and at the centre of one that does not -- and
	 * because the report form it opens is wiring no page should hold a second copy of.
	 */
	let {
		locale,
		/** An absence rather than a failure: there is nothing to report, so only the address. */
		missing = false,
	}: { locale: LocaleCode; missing?: boolean } = $props();

	/**
	 * The dialog is fetched on the first press and never before it.
	 *
	 * The import is here and not at the top for two reasons. Its widget is 24KB gzipped of
	 * preact, which in the app entry is every page paying for a control only an error page has.
	 * And this renders on the server, where `@sentry/sveltekit` resolves to an entry with no
	 * `getFeedback` -- a top-level import of a name that is not there fails the module rather
	 * than the call, which 500ed the error page itself.
	 */
	async function openReport(): Promise<void> {
		const { openReport: show } = await import('./report');
		await show();
	}
</script>

<!-- Declared once and handed to whichever sentence is being rendered. Both name the address and
     only one names the form, so writing them inside each message would put the same anchor in
     two places for the sake of the tag that differs. -->
{#snippet address()}<a
		href="mailto:{site.author.email}"
		class="focus-link spring-underline article-link {stylex.attrs(styles.control).class}"
		>{site.author.email}</a
	>{/snippet}

<!-- A button and not a link, because what it opens is a dialog on this page rather than somewhere
     to go. Its label is the text inside the tag, so the words stay in the message file with the
     sentence they belong to rather than in a key of their own.

     The stroke and the ring both sit on the span, because a button's box is a line box: the
     stroke sat 2.5px below the address's in the same sentence, and the ring stood 20px against
     its 15.5px. `focus-link-inner` is the variant for that. See utilities.css. -->
{#snippet reportForm({ children }: { children?: Snippet })}<button
		type="button"
		onclick={openReport}
		class="spring-underline-host cursor-pointer {stylex.attrs(
			styles.control,
			styles.fade,
		).class}"><span class="focus-link-inner spring-underline article-link"
			>{@render children?.()}</span
		></button
	>{/snippet}

{#if missing}
	<ParaglideMessage
		message={m['error.contact.not-found']}
		inputs={{}}
		options={{ locale }}
		mail={address}
	/>
{:else}
	<ParaglideMessage
		message={m['error.contact.unexpected']}
		inputs={{}}
		options={{ locale }}
		mail={address}
		report={reportForm}
	/>
{/if}

<style>
	/* A button wears its stroke on an inner span, and the control still drives it.

	   A button's box is a line box rather than the text's content area, and the stroke is pinned to
	   the box's bottom -- measured on the error page, the button's sat 2.5px below the anchor's in
	   the same sentence. An inner span is a real inline box and hugs the text the way an anchor does.
	   `.spring-underline`'s own hover rule would then only answer to hover over the text, and never
	   to focus, which lands on the button. */
	.spring-underline-host:is(:hover, :focus-visible) .spring-underline {
		--underline-progress: 100%;
	}
</style>
