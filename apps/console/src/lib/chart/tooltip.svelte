<script lang="ts" module>
	export interface Row {
		key: string;
		label: string;
		value: string;
		color?: string;
		mark?: 'line' | 'rect';
	}
</script>

<script lang="ts">
	/**
	 * The one readout under the pointer or the keyboard, placed in percent across its parent and
	 * turned to the left past FLIP so it stays inside. It enhances and never gates: every value in
	 * it is in the chart's table too.
	 */
	import * as stylex from '@stylexjs/stylex';
	import { type } from '../style.ts';
	import { chart } from './style.ts';

	let {
		x,
		top = '-0.5rem',
		title,
		rows,
	}: { x: number; top?: string; title: string; rows: Row[] } = $props();

	const FLIP = 60;
</script>

<div
	class="pointer-events-none absolute z-10 flex min-w-40 flex-col gap-1.5 px-3 py-2.5 {stylex.attrs(
		chart.tooltip,
	).class}"
	style:left="{x}%"
	style:top
	style:transform={x > FLIP ? 'translateX(calc(-100% - 12px))' : 'translateX(12px)'}
>
	<span class="whitespace-nowrap {stylex.attrs(type.label).class}">{title}</span>
	{#each rows as row (row.key)}
		<span class="flex items-center gap-2 whitespace-nowrap">
			{#if row.color}
				<span
					class="shrink-0 {row.mark === 'rect' ? 'size-2' : 'h-0.5 w-3'} {stylex.attrs(
						row.mark === 'rect' ? chart.keyRect : chart.keyLine,
					).class}"
					style:background-color={row.color}
				></span>
			{/if}
			<span class="flex-1 {stylex.attrs(type.soft).class}">{row.label}</span>
			<span class={stylex.attrs(chart.value).class}>{row.value}</span>
		</span>
	{/each}
</div>
