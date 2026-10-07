<script lang="ts">
	/**
	 * Part of a whole at a glance, for six parts at most: a seventh and the rest fold into `Other`.
	 * A fixed square in pixels, so the ring is drawn whole on the server and never stretched; GAP
	 * of surface between slices, never a stroke. Every part is listed beside it with its value and
	 * share, and each row there is the keyboard's way to the same readout a slice gives the pointer.
	 */
	import * as stylex from '@stylexjs/stylex';
	import { arc, pie, type PieArcDatum } from 'd3-shape';
	import { type } from '../style.ts';
	import Frame from './frame.svelte';
	import { GAP, fold } from './layout.ts';
	import { compact, percent } from './numbers.ts';
	import type { Key } from './series.ts';
	import { chart } from './style.ts';
	import Tooltip from './tooltip.svelte';

	type Part = Key & { value: number };

	let {
		parts,
		size = 160,
		format = compact,
		label = 'Share of the whole',
		total: named = 'Total',
		error,
		stale = false,
	}: {
		parts: Part[];
		/** The ring's width and height in pixels. */
		size?: number;
		format?: (value: number) => string;
		label?: string;
		/** What the figure in the middle is called. */
		total?: string;
		error?: string;
		stale?: boolean;
	} = $props();

	const ROW = 28;

	let active: string | undefined = $state();

	const drawn = $derived(fold(parts));
	const sum = $derived(drawn.reduce((total, part) => total + part.value, 0));
	const outer = $derived(size / 2);
	const slices = $derived.by(() => {
		const shape = arc<PieArcDatum<Part>>()
			.innerRadius(outer * 0.64)
			.outerRadius(outer)
			.padAngle(GAP / outer);
		return pie<Part>()
			.value((part) => part.value)
			.sort(null)(drawn)
			.map((slice) => {
				const [cx = 0, cy = 0] = shape.centroid(slice);
				return {
					part: slice.data,
					path: shape(slice) ?? '',
					x: ((cx + outer) / size) * 100,
					y: cy + outer,
				};
			});
	});
	const share = (part: Part) => (sum > 0 ? part.value / sum : 0);
	const focused = $derived(slices.find((slice) => slice.part.key === active));

	const table = $derived({
		head: ['Part', 'Value', 'Share'],
		numeric: [false, true, true],
		rows: drawn.map((part) => [part.label, format(part.value), percent(share(part))]),
	});
	const styles = stylex.create({
		row: { backgroundColor: 'transparent', borderWidth: 0, padding: 0 },
		figure: { color: 'var(--color-text-strong)' },
		dim: { opacity: 0.4 },
	});
</script>

<Frame
	{label}
	height={Math.max(size, drawn.length * ROW)}
	{table}
	empty={sum === 0}
	{error}
	{stale}
>
	<div class="flex h-full items-center gap-6">
		<div class="relative shrink-0" style:width="{size}px" style:height="{size}px">
			<svg
				viewBox="{-outer} {-outer} {size} {size}"
				width={size}
				height={size}
				class="block overflow-visible"
				aria-hidden="true"
			>
				{#each slices as slice (slice.part.key)}
					<!-- The pointer's way in; the keyboard's is the list beside the ring. -->
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<path
						d={slice.path}
						style:fill={slice.part.color}
						class={stylex.attrs(active !== undefined && active !== slice.part.key && styles.dim)
							.class}
						onpointerenter={() => (active = slice.part.key)}
						onpointerleave={() => (active = undefined)}
					/>
				{/each}
			</svg>
			<div
				class="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-0.5"
			>
				<span class={stylex.attrs(type.heading).class}>{format(sum)}</span>
				<span class={stylex.attrs(type.label).class}>{named}</span>
			</div>
			{#if focused}
				<Tooltip
					x={focused.x}
					top="{focused.y}px"
					title={focused.part.label}
					rows={[
						{
							key: 'value',
							label: percent(share(focused.part)),
							value: format(focused.part.value),
							color: focused.part.color,
							mark: 'rect',
						},
					]}
				/>
			{/if}
		</div>
		<ul class="flex min-w-0 flex-1 flex-col">
			{#each drawn as part (part.key)}
				<li>
					<button
						type="button"
						class="flex w-full items-center gap-2 text-left {stylex.attrs(styles.row, type.soft)
							.class}"
						style:height="{ROW}px"
						onpointerenter={() => (active = part.key)}
						onpointerleave={() => (active = undefined)}
						onfocus={() => (active = part.key)}
						onblur={() => (active = undefined)}
					>
						<span
							class="size-2.5 shrink-0 {stylex.attrs(chart.keyRect).class}"
							style:background-color={part.color}
						></span>
						<span class="flex-1 truncate">{part.label}</span>
						<span class={stylex.attrs(styles.figure).class}>{format(part.value)}</span>
						<span class="w-12 text-right">{percent(share(part))}</span>
					</button>
				</li>
			{/each}
		</ul>
	</div>
</Frame>
