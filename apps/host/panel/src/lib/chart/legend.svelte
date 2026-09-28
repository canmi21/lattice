<script lang="ts">
	/** What each line in a chart is, and its latest value. */
	import * as stylex from '@stylexjs/stylex';
	import type { Line } from './series';
	import { type } from '../style/surfaces';
	import { radius, text, weight } from '../style/vocabulary.stylex';

	let { lines, format }: { lines: Line[]; format: (value: number) => string } = $props();

	const styles = stylex.create({
		swatch: { borderRadius: radius.sm },
		value: {
			color: 'var(--color-text-strong)',
			fontSize: text.px12,
			fontWeight: weight.semibold,
			fontVariantNumeric: 'tabular-nums',
		},
	});
</script>

<div class="flex flex-wrap items-center gap-x-4 gap-y-1">
	{#each lines as line (line.key)}
		{@const last = line.points.at(-1)}
		<span class="inline-flex items-center gap-1.5">
			<span class="size-2 {stylex.attrs(styles.swatch).class}" style:background-color={line.color}
			></span>
			<span class={stylex.attrs(type.muted).class}>{line.label}</span>
			<span class={stylex.attrs(styles.value).class}>{last ? format(last.value) : '–'}</span>
		</span>
	{/each}
</div>
