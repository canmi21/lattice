<script lang="ts" module>
	import type { Key } from './series.ts';

	/** A series of values, one per category, in the categories' order. */
	export interface Bars extends Key {
		values: number[];
	}
</script>

<script lang="ts">
	/**
	 * Values by category as bars, side by side when there are several series. Bars are HTML placed
	 * in percent across the plot and in pixels down it, so their rounded ends never stretch and
	 * nothing is measured: never thicker than THICK, GAP apart, rounded at the data end and square
	 * on the baseline. Each category is one hit target listing every series in it.
	 */
	import * as stylex from '@stylexjs/stylex';
	import { scaleLinear } from 'd3-scale';
	import Frame from './frame.svelte';
	import { GAP, TARGET, barLeft, barWidth, bands } from './layout.ts';
	import { compact } from './numbers.ts';
	import { chart } from './style.ts';
	import Tooltip from './tooltip.svelte';

	let {
		categories,
		series,
		orientation = 'vertical',
		height = 220,
		maximum,
		format = compact,
		label = series.map((one) => one.label).join(', '),
		error,
		stale = false,
	}: {
		categories: string[];
		series: Bars[];
		orientation?: 'vertical' | 'horizontal';
		/** The whole height of a vertical chart; a horizontal one grows a row per category. */
		height?: number;
		/** The top of the scale when it is fixed. */
		maximum?: number;
		format?: (value: number) => string;
		label?: string;
		error?: string;
		stale?: boolean;
	} = $props();

	/** Room for the category names beside horizontal bars; a longer name is cut, and titled. */
	const NAMES = 112;
	const RADIUS = 4;

	let hidden: string[] = $state([]);
	let active: number | undefined = $state();

	const shown = $derived(series.filter((one) => !hidden.includes(one.key)));
	const value = (one: Bars, index: number) => {
		const raw = one.values[index];
		return raw !== undefined && Number.isFinite(raw) && raw > 0 ? raw : 0;
	};
	const top = $derived.by(() => {
		const highest = Math.max(0, ...shown.flatMap((one) => categories.map((_, i) => value(one, i))));
		return scaleLinear()
			.domain([0, maximum ?? (highest > 0 ? highest : 1)])
			.nice(4);
	});
	const ticks = $derived(top.ticks(4));
	const ceiling = $derived(top.domain()[1] ?? 1);
	const along = (amount: number) => (amount / ceiling) * 100;

	const vertical = $derived(orientation === 'vertical');
	const margin = $derived(
		vertical
			? { top: 10, right: 8, bottom: 26, left: 48 }
			: { top: 4, right: 48, bottom: 22, left: NAMES },
	);
	const thick = $derived(shown.length === 1 ? 16 : 10);
	const row = $derived(Math.max(TARGET, shown.length * thick + (shown.length - 1) * GAP + 12));
	const total = $derived(vertical ? height : categories.length * row + margin.top + margin.bottom);
	const inner = $derived(vertical ? Math.max(1, height - margin.top - margin.bottom) : 0);
	const slots = $derived(bands(categories));

	const empty = $derived(
		categories.length === 0 ||
			series.every((one) => categories.every((_, index) => value(one, index) === 0)),
	);
	const table = $derived({
		head: ['Category', ...shown.map((one) => one.label)],
		numeric: [false, ...shown.map(() => true)],
		rows: categories.map((category, index) => [
			category,
			...shown.map((one) => format(one.values[index] ?? Number.NaN)),
		]),
	});
	const tip = (index: number) =>
		shown.map((one) => ({
			key: one.key,
			label: one.label,
			value: format(one.values[index] ?? Number.NaN),
			color: one.color,
			mark: 'rect' as const,
		}));

	const axis = stylex.attrs(chart.axis).class;
	const styles = stylex.create({
		name: { color: 'var(--color-text-muted)' },
	});
</script>

<Frame
	{label}
	height={total}
	legend={series}
	mark="rect"
	bind:hidden
	{table}
	{empty}
	{error}
	{stale}
>
	{#if vertical}
		<div class="relative size-full">
			{#each ticks as tick (tick)}
				<span
					class="absolute -translate-y-1/2 text-right whitespace-nowrap {axis}"
					style:right="calc(100% - {margin.left - 10}px)"
					style:top="{margin.top + inner - (inner * along(tick)) / 100}px">{format(tick)}</span
				>
			{/each}
			<div
				class="absolute"
				style:inset="{margin.top}px {margin.right}px {margin.bottom}px {margin.left}px"
				style:--bar={barWidth(slots[0]?.width ?? 100, Math.max(1, shown.length))}
			>
				{#each ticks as tick (tick)}
					<div
						class="absolute inset-x-0 h-px {stylex.attrs(tick === 0 ? chart.baseline : chart.grid)
							.class}"
						style:bottom="{along(tick)}%"
					></div>
				{/each}
				{#each slots as slot, index (index)}
					{#each shown as one, at (one.key)}
						<div
							class="pointer-events-none absolute bottom-0"
							style:left={barLeft(slot.center, at, shown.length)}
							style:width="var(--bar)"
							style:height="{along(value(one, index))}%"
							style:background-color={one.color}
							style:border-radius="{RADIUS}px {RADIUS}px 0 0"
						></div>
					{/each}
					<span
						class="absolute top-full mt-2 -translate-x-1/2 truncate text-center {axis}"
						style:left="{slot.center}%"
						style:max-width="{100 / slots.length}%"
						title={categories[index]}>{categories[index]}</span
					>
					<button
						type="button"
						class="absolute inset-y-0 -translate-x-1/2 {stylex.attrs(chart.hit).class}"
						style:left="{slot.center}%"
						style:width="max({TARGET}px, {slot.width}%)"
						aria-label="{categories[index]}: {tip(index)
							.map((one) => `${one.label} ${one.value}`)
							.join(', ')}"
						onpointerenter={() => (active = index)}
						onpointerleave={() => (active = undefined)}
						onfocus={() => (active = index)}
						onblur={() => (active = undefined)}
					></button>
				{/each}
				{#if active !== undefined}
					{@const slot = slots[active]}
					{#if slot}
						<Tooltip x={slot.center} title={categories[active] ?? ''} rows={tip(active)} />
					{/if}
				{/if}
			</div>
		</div>
	{:else}
		<div class="relative size-full">
			<div
				class="absolute"
				style:inset="{margin.top}px {margin.right}px {margin.bottom}px {margin.left}px"
			>
				{#each ticks as tick (tick)}
					<div
						class="absolute inset-y-0 w-px {stylex.attrs(tick === 0 ? chart.baseline : chart.grid)
							.class}"
						style:left="{along(tick)}%"
					></div>
					<span
						class="absolute top-full mt-1.5 -translate-x-1/2 whitespace-nowrap {axis}"
						style:left="{along(tick)}%">{format(tick)}</span
					>
				{/each}
				{#each categories as category, index (index)}
					<span
						class="absolute truncate pr-3 text-right {stylex.attrs(chart.axis, styles.name).class}"
						style:right="100%"
						style:width="{NAMES}px"
						style:top="{index * row + row / 2}px"
						style:transform="translateY(-50%)"
						title={category}>{category}</span
					>
					{#each shown as one, at (one.key)}
						{@const offset =
							index * row + (row - shown.length * thick - (shown.length - 1) * GAP) / 2}
						<div
							class="pointer-events-none absolute left-0"
							style:top="{offset + at * (thick + GAP)}px"
							style:height="{thick}px"
							style:width="{along(value(one, index))}%"
							style:background-color={one.color}
							style:border-radius="0 {RADIUS}px {RADIUS}px 0"
						></div>
						{#if shown.length === 1}
							<span
								class="pointer-events-none absolute -translate-y-1/2 pl-1.5 whitespace-nowrap {axis}"
								style:left="{along(value(one, index))}%"
								style:top="{offset + thick / 2}px">{format(one.values[index] ?? Number.NaN)}</span
							>
						{/if}
					{/each}
					<button
						type="button"
						class="absolute inset-x-0 {stylex.attrs(chart.hit).class}"
						style:top="{index * row}px"
						style:height="{row}px"
						aria-label="{category}: {tip(index)
							.map((one) => `${one.label} ${one.value}`)
							.join(', ')}"
						onpointerenter={() => (active = index)}
						onpointerleave={() => (active = undefined)}
						onfocus={() => (active = index)}
						onblur={() => (active = undefined)}
					></button>
				{/each}
				{#if active !== undefined}
					<Tooltip
						x={Math.min(60, Math.max(...shown.map((one) => along(value(one, active ?? 0)))))}
						top="{(active + 1) * row}px"
						title={categories[active] ?? ''}
						rows={tip(active)}
					/>
				{/if}
			</div>
		</div>
	{/if}
</Frame>
