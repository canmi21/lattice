<script lang="ts">
	/**
	 * The ways out of an error page, as one sentence: Sentry's report form, fetched on the press,
	 * and the support address. See lib's spec/web/sentry.md.
	 */
	import * as stylex from '@stylexjs/stylex';
	import { duration } from '@canmi/kit/tokens/vocabulary.stylex';
	import { addressOf, mailtoOf } from '@canmi/me/mail';
	import { report } from '@canmi/web/sentry/report';

	/** An absence rather than a failure: nothing to report, so only the address. */
	let { missing = false }: { missing?: boolean } = $props();

	const contact = addressOf('support');
	const openReport = (): Promise<void> => report(mailtoOf('support'));

	const styles = stylex.create({
		control: {
			color: { default: 'var(--color-text)', ':hover': 'var(--color-text-strong)' },
			textDecorationLine: 'underline',
			textDecorationColor: 'var(--color-line-strong)',
			textUnderlineOffset: '0.2em',
			transitionProperty: 'color',
			transitionDuration: duration.base,
		},
	});
</script>

{#snippet address()}<a href="mailto:{contact}" class={stylex.attrs(styles.control).class}
		>{contact}</a
	>{/snippet}

{#if missing}
	If you think this is a mistake, write to {@render address()}
{:else}
	File a <button
		type="button"
		class="cursor-pointer {stylex.attrs(styles.control).class}"
		onclick={openReport}>report</button
	>
	or email {@render address()}
{/if}
