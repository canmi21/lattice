<script lang="ts">
	/**
	 * One figure as the headline: its name, the value large, how it moved against a named period,
	 * and a sparkline of how it got here. The number is the chart; there is no plot to hover.
	 */
	import * as stylex from '@stylexjs/stylex';
	import ArrowDown from '@lucide/svelte/icons/arrow-down';
	import ArrowUp from '@lucide/svelte/icons/arrow-up';
	import Minus from '@lucide/svelte/icons/minus';
	import { line, radius, weight } from '@canmi/kit/tokens/vocabulary.stylex';
	import { surfaces, tone, type } from '../style.ts';
	import { compact, signed } from './numbers.ts';
	import Sparkline from './sparkline.svelte';

	let {
		label,
		value = '',
		unit,
		delta,
		trend = [],
		pending = false,
	}: {
		label: string;
		/** A number is written compact, `12.9K`; a string as it is. */
		value?: number | string;
		unit?: string;
		/** The change against `period`, and which way is good, which decides its tone. */
		delta?: {
			value: number;
			period: string;
			good: 'up' | 'down';
			format?: (value: number) => string;
		};
		/** About a dozen recent values, the last of them `value`. */
		trend?: number[];
		/**
		 * The read is on its way: a faint figure in the value's place, and with `'trend'` the
		 * sparkline's room kept, so the tile does not grow when it lands.
		 */
		pending?: boolean | 'trend';
	} = $props();

	const shown = $derived(typeof value === 'number' ? compact(value) : value);
	const direction = $derived(
		delta === undefined || delta.value === 0 ? 'flat' : delta.value > 0 ? 'up' : 'down',
	);
	const verdict = $derived(
		direction === 'flat' ? 'quiet' : direction === delta?.good ? 'good' : 'bad',
	);

	const styles = stylex.create({
		figure: {
			fontSize: '1.875rem', // unnamed: the figure step, which the ladder stops below
			fontWeight: weight.semibold,
			letterSpacing: '-0.03em', // unnamed: a display size drawn tight
			lineHeight: line.none,
			fontVariantNumeric: 'tabular-nums',
			color: 'var(--color-text-strong)',
		},
		placeholder: {
			backgroundColor: 'color-mix(in srgb, var(--color-raised) 45%, transparent)',
			borderRadius: radius.md,
		},
	});
</script>

<div class="flex min-w-0 flex-col gap-2 px-5 pt-4 pb-4 {stylex.attrs(surfaces.card).class}">
	<span class={stylex.attrs(type.label).class}>{label}</span>
	{#if pending}
		<span
			class="h-[1.875rem] w-16 self-start {stylex.attrs(styles.placeholder).class}"
			aria-busy="true"
		></span>
		{#if pending === 'trend'}<span class="h-8"></span>{/if}
	{:else}
		<div class="flex items-baseline gap-1.5">
			<span class={stylex.attrs(styles.figure).class}>{shown}</span>
			{#if unit}<span class={stylex.attrs(type.soft).class}>{unit}</span>{/if}
		</div>
	{/if}
	{#if delta && !pending}
		<span class="inline-flex items-center gap-1 {stylex.attrs(type.soft).class}">
			<span class="inline-flex items-center gap-0.5 {stylex.attrs(tone[verdict]).class}">
				{#if direction === 'up'}<ArrowUp
						size={12}
						strokeWidth={2.25}
					/>{:else if direction === 'down'}<ArrowDown size={12} strokeWidth={2.25} />{:else}<Minus
						size={12}
						strokeWidth={2.25}
					/>{/if}
				{signed(delta.value, delta.format)}
			</span>
			vs {delta.period}
		</span>
	{/if}
	{#if trend.length > 1 && !pending}<Sparkline values={trend} label="{label}, recent trend" />{/if}
</div>
