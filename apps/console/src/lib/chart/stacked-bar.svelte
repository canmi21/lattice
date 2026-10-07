<script lang="ts">
	/**
	 * Parts of a whole by category, one bar each, its series stacked in their fixed order; or, with
	 * `expand`, every bar the same length and each part its share. GAP of surface stands between
	 * segments, never a stroke, and only the top segment carries the rounded data end.
	 */
	import * as stylex from '@stylexjs/stylex';
	import { scaleLinear } from 'd3-scale';
	import type { Bars } from './bar-chart.svelte';
	import Frame from './frame.svelte';
	import { TARGET, barLeft, barWidth, bands, span, stackRows } from './layout.ts';
	import { compact, percent } from './numbers.ts';
	import { chart } from './style.ts';
	import Tooltip from './tooltip.svelte';

	let {
		categories,
		series,
		orientation = 'vertical',
		expand = false,
		height = 220,
		format = compact,
		label = series.map((one) => one.label).join(', '),
		error,
		stale = false,
	}: {
		categories: string[];
		series: Bars[];
		orientation?: 'vertical' | 'horizontal';
		/** Every bar the whole, each part its share of it. */
		expand?: boolean;
		/** The whole height of a vertical chart; a horizontal one grows a row per category. */
		height?: number;
		format?: (value: number) => string;
		label?: string;
		error?: string;
		stale?: boolean;
	} = $props();

	const NAMES = 112;
	const THICK = 16;
	const RADIUS = 4;

	let hidden: string[] = $state([]);
	let active: number | undefined = $state();

	const shown = $derived(series.filter((one) => !hidden.includes(one.key)));
	const stacks = $derived(stackRows(categories, shown, expand));
	const colors = $derived(new Map(series.map((one) => [one.key, one.color])));
	const scale = $derived(
		expand
			? scaleLinear().domain([0, 1])
			: scaleLinear()
					.domain([0, Math.max(1, ...stacks.map((stack) => stack.total))])
					.nice(4),
	);
	const ticks = $derived(scale.ticks(4));
	const ceiling = $derived(scale.domain()[1] ?? 1);
	const along = (amount: number) => (amount / ceiling) * 100;
	const tickText = (tick: number) => (expand ? percent(tick) : format(tick));

	const vertical = $derived(orientation === 'vertical');
	const margin = $derived(
		vertical
			? { top: 10, right: 8, bottom: 26, left: 48 }
			: { top: 4, right: 16, bottom: 22, left: NAMES },
	);
	const row = $derived(Math.max(TARGET, THICK + 12));
	const total = $derived(vertical ? height : categories.length * row + margin.top + margin.bottom);
	const slots = $derived(bands(categories));

	const empty = $derived(
		categories.length === 0 ||
			stackRows(categories, series).every((stack) => stack.segments.length === 0),
	);
	const table = $derived({
		head: ['Category', ...shown.map((one) => one.label), 'Total'],
		numeric: [false, ...shown.map(() => true), true],
		rows: categories.map((category, index) => [
			category,
			...shown.map((one) => format(one.values[index] ?? Number.NaN)),
			format(stacks[index]?.total ?? Number.NaN),
		]),
	});
	const tip = (index: number) => {
		const stack = stacks[index];
		const rows = shown.map((one) => {
			const raw = one.values[index] ?? Number.NaN;
			const share = stack && stack.total > 0 ? raw / stack.total : Number.NaN;
			return {
				key: one.key,
				label: one.label,
				value: expand ? `${percent(share)} · ${format(raw)}` : format(raw),
				color: one.color,
				mark: 'rect' as const,
			};
		});
		return [...rows, { key: 'total', label: 'Total', value: format(stack?.total ?? Number.NaN) }];
	};
	const said = (index: number) =>
		`${categories[index]}: ${tip(index)
			.map((one) => `${one.label} ${one.value}`)
			.join(', ')}`;

	const axis = stylex.attrs(chart.axis).class;
	const styles = stylex.create({ name: { color: 'var(--color-text-muted)' } });
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
	<div class="relative size-full">
		<div
			class="absolute"
			style:inset="{margin.top}px {margin.right}px {margin.bottom}px {margin.left}px"
			style:--bar={barWidth(slots[0]?.width ?? 100, 1)}
		>
			{#each ticks as tick (tick)}
				{@const rule = stylex.attrs(tick === 0 ? chart.baseline : chart.grid).class}
				{#if vertical}
					<div class="absolute inset-x-0 h-px {rule}" style:bottom="{along(tick)}%"></div>
					<span
						class="absolute translate-y-1/2 pr-2.5 text-right whitespace-nowrap {axis}"
						style:right="100%"
						style:bottom="{along(tick)}%">{tickText(tick)}</span
					>
				{:else}
					<div class="absolute inset-y-0 w-px {rule}" style:left="{along(tick)}%"></div>
					<span
						class="absolute top-full mt-1.5 -translate-x-1/2 whitespace-nowrap {axis}"
						style:left="{along(tick)}%">{tickText(tick)}</span
					>
				{/if}
			{/each}

			{#each stacks as stack, index (index)}
				{@const slot = slots[index]}
				{@const count = stack.segments.length}
				{#each stack.segments as segment, at (segment.key)}
					{@const place = span(along(segment.start), along(segment.end), at, count)}
					{@const end = at === count - 1 ? RADIUS : 0}
					{#if vertical && slot}
						<div
							class="pointer-events-none absolute"
							style:left={barLeft(slot.center, 0, 1)}
							style:width="var(--bar)"
							style:bottom={place.offset}
							style:height={place.length}
							style:background-color={colors.get(segment.key)}
							style:border-radius="{end}px {end}px 0 0"
						></div>
					{:else if !vertical}
						<div
							class="pointer-events-none absolute"
							style:top="{index * row + (row - THICK) / 2}px"
							style:height="{THICK}px"
							style:left={place.offset}
							style:width={place.length}
							style:background-color={colors.get(segment.key)}
							style:border-radius="0 {end}px {end}px 0"
						></div>
					{/if}
				{/each}
				{#if vertical && slot}
					<span
						class="absolute top-full mt-2 -translate-x-1/2 truncate text-center {axis}"
						style:left="{slot.center}%"
						style:max-width="{100 / slots.length}%"
						title={stack.category}>{stack.category}</span
					>
					<button
						type="button"
						class="absolute inset-y-0 -translate-x-1/2 {stylex.attrs(chart.hit).class}"
						style:left="{slot.center}%"
						style:width="max({TARGET}px, {slot.width}%)"
						aria-label={said(index)}
						onpointerenter={() => (active = index)}
						onpointerleave={() => (active = undefined)}
						onfocus={() => (active = index)}
						onblur={() => (active = undefined)}
					></button>
				{:else if !vertical}
					<span
						class="absolute truncate pr-3 text-right {stylex.attrs(chart.axis, styles.name).class}"
						style:right="100%"
						style:width="{NAMES}px"
						style:top="{index * row + row / 2}px"
						style:transform="translateY(-50%)"
						title={stack.category}>{stack.category}</span
					>
					<button
						type="button"
						class="absolute inset-x-0 {stylex.attrs(chart.hit).class}"
						style:top="{index * row}px"
						style:height="{row}px"
						aria-label={said(index)}
						onpointerenter={() => (active = index)}
						onpointerleave={() => (active = undefined)}
						onfocus={() => (active = index)}
						onblur={() => (active = undefined)}
					></button>
				{/if}
			{/each}

			{#if active !== undefined}
				<Tooltip
					x={vertical ? (slots[active]?.center ?? 50) : 50}
					top={vertical ? undefined : `${(active + 1) * row}px`}
					title={categories[active] ?? ''}
					rows={tip(active)}
				/>
			{/if}
		</div>
	</div>
</Frame>
