<script lang="ts">
	/** One figure about the machine as it is now, with how full it is and the last minute of it. */
	import * as stylex from '@stylexjs/stylex';
	import type { Component } from 'svelte';
	import AreaChart from './chart/area-chart.svelte';
	import type { Datum } from './chart/series';
	import { surfaces, type } from './style/surfaces';
	import { radius } from './style/vocabulary.stylex';

	let {
		label,
		icon: Icon,
		value,
		detail,
		share,
		color,
		recent = [],
		ceiling,
	}: {
		label: string;
		icon: Component<{ size?: number; strokeWidth?: number }>;
		value: string;
		detail?: string;
		/** How full, from 0 to 1, drawn as a bar. */
		share?: number;
		color: string;
		recent?: Datum[];
		ceiling?: number;
	} = $props();

	/** How loud a share is: calm, then worth a look, then worth acting on. */
	const level = $derived(
		share === undefined
			? color
			: share > 0.9
				? 'var(--color-danger)'
				: share > 0.75
					? 'var(--color-warn)'
					: color,
	);

	const styles = stylex.create({
		track: { backgroundColor: 'var(--color-sunken)', borderRadius: radius.full },
		fill: { borderRadius: radius.full, transitionProperty: 'width', transitionDuration: '400ms' },
		icon: { color: 'var(--color-text-faint)' },
	});
</script>

<div class="flex min-w-0 flex-col gap-3 px-5 pt-4 pb-3 {stylex.attrs(surfaces.card).class}">
	<div class="flex items-center justify-between">
		<span class={stylex.attrs(type.label).class}>{label}</span>
		<span class={stylex.attrs(styles.icon).class}><Icon size={15} strokeWidth={1.75} /></span>
	</div>
	<div class="flex items-baseline gap-2">
		<span class={stylex.attrs(type.figure).class}>{value}</span>
		{#if detail}<span class="truncate {stylex.attrs(type.muted).class}">{detail}</span>{/if}
	</div>
	{#if share !== undefined}
		<div class="h-1.5 w-full overflow-hidden {stylex.attrs(styles.track).class}">
			<div
				class="h-full {stylex.attrs(styles.fill).class}"
				style:width="{Math.min(100, Math.max(0, share * 100))}%"
				style:background-color={level}
			></div>
		</div>
	{/if}
	<AreaChart
		lines={[{ key: label, label, color: level, points: recent }]}
		height={44}
		compact
		band={false}
		{ceiling}
	/>
</div>
