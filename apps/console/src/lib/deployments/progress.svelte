<script lang="ts">
	/**
	 * Where every node is with one run, one small cell each in the nodes' order: filled in its
	 * state's tone, a deploy still going filled as far as the stage it has reached, a skip hatched,
	 * a node that placed nothing left hollow and one that did not answer dashed. The words are in
	 * each cell's title and the whole strip's label, never the tone alone.
	 */
	import * as stylex from '@stylexjs/stylex';
	import { border, radius } from '@canmi/kit/tokens/vocabulary.stylex';
	import { STAGES, depth, said, type NodeMark } from './state.ts';

	let { marks }: { marks: NodeMark[] } = $props();

	const words = (one: NodeMark) => `${one.node} ${said(one.mark, one.stage)}`;

	const styles = stylex.create({
		cell: {
			borderRadius: radius.sm,
			borderWidth: border.hairlinePx,
			borderStyle: 'solid',
			borderColor: 'transparent',
			overflow: 'hidden',
		},
		succeeded: { backgroundColor: 'var(--color-good)' },
		failed: { backgroundColor: 'var(--color-danger)' },
		running: {
			backgroundColor: 'color-mix(in srgb, var(--color-busy) 22%, transparent)',
			borderColor: 'var(--color-busy)',
		},
		skipped: {
			backgroundImage:
				'repeating-linear-gradient(45deg, var(--color-text-faint) 0 1.5px, transparent 1.5px 4px)',
			borderColor: 'var(--color-text-faint)',
		},
		absent: { borderColor: 'var(--color-line-strong)' },
		unknown: { borderColor: 'var(--color-warn)', borderStyle: 'dashed' },
		fill: { backgroundColor: 'var(--color-busy)' },
	});
</script>

<span class="inline-flex items-center gap-0.5" role="img" aria-label={marks.map(words).join(', ')}>
	{#each marks as one (one.node)}
		<span
			class="relative inline-flex size-3 items-end {stylex.attrs(styles.cell, styles[one.mark])
				.class}"
			title={words(one)}
		>
			{#if one.mark === 'running'}
				<span
					class="w-full {stylex.attrs(styles.fill).class}"
					style:height="{(depth(one.stage) / STAGES.length) * 100}%"
				></span>
			{/if}
		</span>
	{/each}
</span>
