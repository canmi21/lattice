<script lang="ts">
	/**
	 * What the timeline's colors mean, a bar of each as a slot is drawn, in the reader's words, for
	 * the card's head. See spec/console/overview.md, "The week is a line a node".
	 */
	import * as stylex from '@stylexjs/stylex';
	import { text } from '@canmi/kit/tokens/vocabulary.stylex';
	import type { Outcome } from './timeline.ts';
	import { OUTCOME } from './words.ts';

	const LEGEND: readonly Outcome[] = ['succeeded', 'running', 'mixed', 'failed'];

	const styles = stylex.create({
		word: { color: 'var(--color-text-muted)', fontSize: text.px12 },
		succeeded: { backgroundColor: 'var(--color-text)' },
		running: { backgroundColor: 'var(--color-busy)' },
		mixed: { backgroundColor: 'var(--color-warn)' },
		failed: { backgroundColor: 'var(--color-danger)' },
	});
</script>

<!-- Measured by the room the title leaves it: the words go where they would not fit, the bars stay,
     each naming itself on its hover. -->
<div class="@container min-w-0 flex-1">
	<div class="flex h-8 items-center justify-end gap-x-4 {stylex.attrs(styles.word).class}">
		{#each LEGEND as outcome (outcome)}
			<span class="flex items-center gap-1.5" title={OUTCOME[outcome]}>
				<span class="h-3 w-[3px] rounded-[1px] {stylex.attrs(styles[outcome]).class}"></span>
				<span class="hidden whitespace-nowrap @min-[24rem]:inline">{OUTCOME[outcome]}</span>
			</span>
		{/each}
	</div>
</div>
