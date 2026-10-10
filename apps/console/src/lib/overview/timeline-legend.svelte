<script lang="ts">
	/**
	 * What the timeline's colors mean for the dimension drawn, a bar of each as a slot is drawn, in
	 * the reader's words, for the card's head. See spec/console/overview.md, "A line is any of three
	 * things, or the worst of them".
	 */
	import * as stylex from '@stylexjs/stylex';
	import { text } from '@canmi/kit/tokens/vocabulary.stylex';
	import { type Dimension, LEGENDS } from './history.ts';
	import { painted } from './verdict.ts';

	let { dimension }: { dimension: Dimension } = $props();

	const styles = stylex.create({
		word: { color: 'var(--color-text-muted)', fontSize: text.px12 },
	});
</script>

<!-- Measured by the room the title leaves it: the words go where they would not fit, the bars stay,
     each naming itself on its hover. -->
<div class="@container min-w-0 flex-1">
	<div class="flex h-8 items-center justify-end gap-x-4 {stylex.attrs(styles.word).class}">
		{#each LEGENDS[dimension] as one (one.verdict)}
			<span class="flex items-center gap-1.5" title={one.label}>
				<span class="h-3 w-[3px] rounded-[1px] {stylex.attrs(painted[one.verdict]).class}"></span>
				<span class="hidden whitespace-nowrap @min-[24rem]:inline">{one.label}</span>
			</span>
		{/each}
	</div>
</div>
