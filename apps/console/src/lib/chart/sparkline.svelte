<script lang="ts">
	/**
	 * A dozen recent values as a line with no axes, in a quiet hue with the latest in the accent:
	 * the trend beside a figure, not a chart of its own, so it has no hover and no table. The
	 * figure it sits beside is the value it ends on.
	 */
	import * as stylex from '@stylexjs/stylex';
	import { extent } from 'd3-array';
	import { scaleLinear } from 'd3-scale';
	import { curveMonotoneX, line } from 'd3-shape';
	import { chart } from './style.ts';

	let {
		values,
		height = 32,
		color = 'var(--color-text-faint)',
		accent = 'var(--color-accent)',
		label,
	}: {
		values: number[];
		height?: number;
		color?: string;
		accent?: string;
		/** What the trend is of, for a reader who does not see it. */
		label?: string;
	} = $props();

	const WIDTH = 100;
	/** Room above and below so the end dot is not cut by the edge. */
	const PAD = 4;

	const drawn = $derived(values.filter(Number.isFinite));
	const y = $derived.by(() => {
		const [low = 0, high = 0] = extent(drawn);
		return scaleLinear()
			.domain(low === high ? [low - 1, high + 1] : [low, high])
			.range([height - PAD, PAD]);
	});
	const x = $derived(
		scaleLinear()
			.domain([0, Math.max(1, drawn.length - 1)])
			.range([0, WIDTH]),
	);
	const path = $derived(
		line<number>()
			.curve(curveMonotoneX)
			.x((_, index) => x(index))
			.y((value) => y(value))(drawn),
	);
	const last = $derived(drawn.at(-1));
</script>

<div
	class="relative w-full"
	style:height="{height}px"
	role={label ? 'img' : undefined}
	aria-label={label}
	aria-hidden={label ? undefined : 'true'}
>
	{#if drawn.length > 1 && path}
		<svg
			viewBox="0 0 {WIDTH} {height}"
			preserveAspectRatio="none"
			class="absolute inset-0 block size-full overflow-visible"
			aria-hidden="true"
		>
			<path
				d={path}
				fill="none"
				style:stroke={color}
				stroke-width="2"
				stroke-linejoin="round"
				stroke-linecap="round"
				vector-effect="non-scaling-stroke"
			/>
		</svg>
	{/if}
	{#if last !== undefined}
		<span
			class="absolute size-2 -translate-1/2 {stylex.attrs(chart.dot).class}"
			style:left="{x(drawn.length - 1)}%"
			style:top="{y(last)}px"
			style:background-color={accent}
		></span>
	{/if}
</div>
