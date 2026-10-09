<script lang="ts">
	/**
	 * What the console shows when a server answered and the answer was a number: the number, a
	 * rule, and a sentence for a person, on one line in the middle of the page, and the way out at
	 * its foot. The site's page in the console's tokens and in English alone; which page an error
	 * is, and the protocol's names, are @canmi/web/error's. See spec/console/design.md, "An error
	 * is the site's page, in the console's frame".
	 */
	import * as stylex from '@stylexjs/stylex';
	import { border, text, weight } from '@canmi/kit/tokens/vocabulary.stylex';
	import { statusText } from '@canmi/web/error';
	import Offer from './offer.svelte';

	let { status }: { status: number } = $props();

	/** The console's own sentence, never the error's message, which is for the log. */
	const message = $derived(
		status === 404 ? 'This page could not be found' : 'Something went wrong',
	);

	const styles = stylex.create({
		/** The number, and the rule between it and the sentence. */
		status: {
			borderRightWidth: border.hairlinePx,
			borderRightStyle: 'solid',
			borderColor: 'var(--color-line)',
			fontSize: '1.5rem', // unnamed: the page's one large thing, written once
			lineHeight: '3.0625rem', // unnamed: one box for the number and the sentence
			fontWeight: weight.medium,
			color: 'var(--color-text-strong)',
		},
		message: {
			fontSize: text.px14,
			lineHeight: '3.0625rem', // unnamed: the number's box, which puts the two on one line
			color: 'var(--color-text)',
		},
		offer: { fontSize: text.px13, color: 'var(--color-text-muted)' },
	});
</script>

<div class="relative flex min-h-[calc(100dvh-10rem)] items-center justify-center">
	<div class="flex items-center">
		<h1 class="pr-6 {stylex.attrs(styles.status).class}">
			<!-- The space as data: Svelte trims it as markup, and a reader heard one word. -->
			{status}<span class="sr-only">{` ${statusText(status)}`}</span>
		</h1>
		<p class="pl-6 {stylex.attrs(styles.message).class}">{message}</p>
	</div>
	<p class="absolute inset-x-0 bottom-4 text-center {stylex.attrs(styles.offer).class}">
		<Offer missing={status === 404} />
	</p>
</div>
