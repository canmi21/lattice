<script lang="ts">
	/**
	 * What the console shows when the browser broke after the page was served: no number, since
	 * nothing answered, only what happened and the way out, centered. See
	 * spec/console/design.md, "An error is the site's page, in the console's frame".
	 */
	import * as stylex from '@stylexjs/stylex';
	import { line, text } from '@canmi/kit/tokens/vocabulary.stylex';
	import Offer from './offer.svelte';

	const styles = stylex.create({
		said: { fontSize: text.px14, lineHeight: line.relaxed, color: 'var(--color-text)' },
		offer: { fontSize: text.px13, lineHeight: line.relaxed, color: 'var(--color-text-muted)' },
	});
</script>

<div class="flex min-h-[calc(100dvh-10rem)] items-center justify-center">
	<div class="flex flex-col items-center gap-4 text-center">
		<h1 class={stylex.attrs(styles.said).class}>
			This page crashed in the browser. Describing what you were doing helps
		</h1>
		<p class={stylex.attrs(styles.offer).class}><Offer /></p>
	</div>
</div>
