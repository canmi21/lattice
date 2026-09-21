<script module lang="ts">
	import * as stylex from '@stylexjs/stylex';
	import { line, text } from '$lib/vocabulary.stylex.ts';

	/**
	 * Two small lines, centred, separated by ink rather than size. See
	 * spec/architecture/css/authoring.md.
	 *
	 * The page has no status number to be the one large thing, so nothing here is large either.
	 * What the steps carry instead is who each line is for: prose for the reader, then the way out
	 * at the step the other error pages give theirs.
	 */
	const styles = stylex.create({
		/** What happened, and the one thing a reader can add that a stack trace cannot. */
		said: {
			fontSize: text.px14,
			lineHeight: line.relaxed,
			color: 'var(--color-text)',
		},
		/** The way out. Its two controls take their own colour; this is the prose around them. */
		offer: {
			fontSize: text.px13,
			lineHeight: line.relaxed,
			color: 'var(--color-text-soft)',
		},
	});
</script>

<script lang="ts">
	import type { LocaleCode } from '$lib/locale';
	import * as m from '$lib/paraglide/messages';
	import Offer from './offer.svelte';

	/**
	 * What a reader is shown when the failure was the browser's, not the server's.
	 *
	 * **It has no status code, because nothing answered.** A code is what a server said about a
	 * request; this is a page that was served and then could not finish, and inventing a 500 for
	 * it would claim the one thing known not to have happened. So the row of number, rule and
	 * sentence is not here, and the two lines below sit where that row would have been.
	 */
	let { locale }: { locale: LocaleCode } = $props();
</script>

<svelte:head>
	<!-- Title Case and English, because that is how the pages with a status code spell theirs:
	     `Not Found`, `Internal Server Error`. This is the same kind of name for a failure the
	     protocol has none for, and the tab is the only place it appears. -->
	<title>Unexpected Client Behavior</title>
</svelte:head>

<main class="flex min-h-screen items-center justify-center px-6">
	<div class="flex flex-col items-center gap-4 text-center">
		<h1 class={stylex.attrs(styles.said).class}>{m['error.client']({}, { locale })}</h1>
		<p class={stylex.attrs(styles.offer).class}>
			<Offer {locale} />
		</p>
	</div>
</main>
