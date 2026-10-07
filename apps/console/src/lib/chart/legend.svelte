<script lang="ts">
	/**
	 * Which series a chart draws, each a button that hides or shows its series. The last one shown
	 * stays shown: a chart of nothing is not a state worth a click. Its key mirrors the mark.
	 */
	import * as stylex from '@stylexjs/stylex';
	import { type } from '../style.ts';
	import type { Key } from './series.ts';
	import { chart } from './style.ts';

	let {
		items,
		mark = 'line',
		hidden = $bindable([]),
	}: { items: Key[]; mark?: 'line' | 'rect'; hidden?: string[] } = $props();

	function toggle(key: string) {
		if (hidden.includes(key)) hidden = hidden.filter((other) => other !== key);
		else if (items.length - hidden.length > 1) hidden = [...hidden, key];
	}

	const styles = stylex.create({
		item: { backgroundColor: 'transparent', borderWidth: 0, padding: 0 },
		off: { color: 'var(--color-text-faint)', textDecorationLine: 'line-through' },
	});
</script>

<ul class="flex flex-wrap items-center gap-x-4">
	{#each items as item (item.key)}
		{@const off = hidden.includes(item.key)}
		<li>
			<button
				type="button"
				aria-pressed={!off}
				class="inline-flex h-6 items-center gap-1.5 {stylex.attrs(
					styles.item,
					type.soft,
					off && styles.off,
				).class}"
				onclick={() => toggle(item.key)}
			>
				<span
					class="shrink-0 {mark === 'line' ? 'h-0.5 w-3' : 'size-2.5'} {stylex.attrs(
						mark === 'line' ? chart.keyLine : chart.keyRect,
					).class}"
					style:background-color={off ? 'transparent' : item.color}
					style:box-shadow={off ? `inset 0 0 0 1px ${item.color}` : undefined}
				></span>
				{item.label}
			</button>
		</li>
	{/each}
</ul>
