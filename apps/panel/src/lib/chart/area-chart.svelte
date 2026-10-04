<script lang="ts">
	/**
	 * An area chart in the manner of a dashboard: a gradient under each line, a faint band from each
	 * point's minimum to its maximum, a crosshair and a tooltip under the pointer, and the plot drawn
	 * in from the left when it arrives. d3 computes the scales and the paths; the SVG is Svelte's.
	 */
	import * as stylex from '@stylexjs/stylex';
	import { bisector } from 'd3-array';
	import { scaleLinear, scaleTime } from 'd3-scale';
	import { area, curveMonotoneX, line as linePath } from 'd3-shape';
	import { pressMotion, prefersReducedMotion } from '@canmi/kit/motion';
	import { binaryTicks, moment, tickLabel, withGaps, type Datum, type Line } from './series';
	import { type } from '../style/surfaces';
	import { radius, text, weight } from '../style/vocabulary.stylex';

	let {
		lines,
		since,
		until,
		height = 200,
		ceiling,
		format = (value: number) => value.toFixed(1),
		band = true,
		compact = false,
		bytes = false,
		reveal = '',
	}: {
		lines: Line[];
		/** The span shown, in seconds; the points' own when not given. */
		since?: number;
		until?: number;
		height?: number;
		/** The top of the scale when it is fixed, as a percentage's is at 100. */
		ceiling?: number;
		format?: (value: number) => string;
		/** Whether to shade each point's minimum to maximum. */
		band?: boolean;
		/** No axes and no grid: a sparkline. */
		compact?: boolean;
		/** A quantity of bytes, so its ticks fall on binary units. */
		bytes?: boolean;
		/** Draws the plot in again when it changes: the span chosen, never each new second. */
		reveal?: string;
	} = $props();

	const id = $props.id();
	/**
	 * How strong each line's fill is. Fills are layered, and several colors layered wash out toward
	 * grey: one line keeps its gradient, two share it, and three or more are drawn as lines alone.
	 */
	const fill = $derived(lines.length === 1 ? 0.32 : lines.length === 2 ? 0.16 : 0);
	let width = $state(0);
	let pointer: number | undefined = $state();
	let plot: SVGGElement | undefined = $state();

	const margin = $derived(
		compact
			? { top: 2, right: 0, bottom: 2, left: 0 }
			: { top: 10, right: 8, bottom: 26, left: 52 },
	);
	const all = $derived(lines.flatMap((line) => line.points));
	const start = $derived(since ?? Math.min(...all.map((point) => point.at)));
	const end = $derived(until ?? Math.max(...all.map((point) => point.at)));

	const x = $derived(
		scaleTime()
			.domain([new Date(start * 1000), new Date(end * 1000)])
			.range([margin.left, Math.max(margin.left + 1, width - margin.right)]),
	);
	const y = $derived.by(() => {
		const highest = Math.max(
			0,
			...all.map((point) => (band ? (point.maximum ?? point.value) : point.value)),
		);
		const top = ceiling ?? (highest > 0 ? highest * 1.1 : 1);
		const scale = scaleLinear().range([height - margin.bottom, margin.top]);
		if (ceiling !== undefined) return scale.domain([0, ceiling]);
		if (bytes) return scale.domain([0, binaryTicks(top).at(-1) ?? top]);
		return scale.domain([0, top]).nice(4);
	});

	const shapes = $derived(
		lines.map((line) => {
			const points = withGaps(line.points);
			const defined = (point: Datum) => !Number.isNaN(point.value);
			const at = (point: Datum) => x(new Date(point.at * 1000));
			return {
				line,
				fill: area<Datum>()
					.defined(defined)
					.curve(curveMonotoneX)
					.x(at)
					.y0(y(0))
					.y1((point) => y(point.value))(points),
				stroke: linePath<Datum>()
					.defined(defined)
					.curve(curveMonotoneX)
					.x(at)
					.y((point) => y(point.value))(points),
				band:
					band && points.some((point) => point.minimum !== undefined)
						? area<Datum>()
								.defined(defined)
								.curve(curveMonotoneX)
								.x(at)
								.y0((point) => y(point.minimum ?? point.value))
								.y1((point) => y(point.maximum ?? point.value))(points)
						: null,
			};
		}),
	);

	const yTicks = $derived(compact ? [] : bytes ? binaryTicks(y.domain()[1]!) : y.ticks(4));
	/** A label needs room either side of its tick, so none is set against an edge. */
	const xTicks = $derived(
		compact
			? []
			: x
					.ticks(Math.max(2, Math.floor((width - 80) / 110)))
					.filter((tick) => x(tick) > margin.left + 28 && x(tick) < width - margin.right - 28),
	);
	const label = $derived(tickLabel(end - start));

	const nearest = bisector((point: Datum) => point.at).center;
	/** What the pointer is over: the moment, and each line's point nearest it. */
	const hovered = $derived.by(() => {
		if (pointer === undefined || lines.length === 0) return undefined;
		const at = x.invert(pointer).getTime() / 1000;
		const found = lines
			.map((line) => ({ line, point: line.points[nearest(line.points, at)] }))
			.filter((entry): entry is { line: Line; point: Datum } => entry.point !== undefined);
		const first = found[0];
		if (!first) return undefined;
		return { at: first.point.at, left: x(new Date(first.point.at * 1000)), found };
	});

	function move(event: PointerEvent) {
		const box = (event.currentTarget as SVGElement).getBoundingClientRect();
		const within = event.clientX - box.left;
		pointer = within >= margin.left && within <= width - margin.right ? within : undefined;
	}

	/** Drawn in from the left each time the plot arrives: the first time, and on a new span. */
	$effect(() => {
		if (!plot || !width || prefersReducedMotion()) return;
		const timing = pressMotion(width);
		plot.animate([{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0 0 0)' }], {
			duration: timing.duration * 1000 * 1.6,
			easing: `cubic-bezier(${timing.ease.join(', ')})`,
		});
	});

	const styles = stylex.create({
		axis: {
			fill: 'var(--color-text-faint)',
			fontSize: text.px11,
			fontVariantNumeric: 'tabular-nums',
		},
		grid: { stroke: 'var(--color-line)', strokeWidth: 1, strokeDasharray: '2 4' },
		base: { stroke: 'var(--color-line-strong)', strokeWidth: 1 },
		crosshair: { stroke: 'var(--color-text-muted)', strokeWidth: 1, strokeDasharray: '3 3' },
		tooltip: {
			backgroundColor: 'var(--color-raised)',
			borderWidth: '1px',
			borderStyle: 'solid',
			borderColor: 'var(--color-line-strong)',
			borderRadius: radius.lg,
			boxShadow: '0 8px 24px rgb(0 0 0 / 0.35)',
		},
		swatch: { borderRadius: radius.sm },
		value: {
			color: 'var(--color-text-strong)',
			fontSize: text.px12,
			fontWeight: weight.semibold,
			fontVariantNumeric: 'tabular-nums',
		},
	});
</script>

<div class="relative w-full" bind:clientWidth={width} style:height="{height}px">
	{#if width > 0}
		<svg
			{width}
			{height}
			class="block touch-none overflow-visible select-none"
			role="img"
			aria-label={lines.map((line) => line.label).join(', ')}
			onpointermove={move}
			onpointerleave={() => (pointer = undefined)}
		>
			<defs>
				{#each lines as line (line.key)}
					<linearGradient id="{id}-{line.key}" x1="0" y1="0" x2="0" y2="1">
						<stop offset="0%" style:stop-color={line.color} style:stop-opacity={fill} />
						<stop offset="100%" style:stop-color={line.color} style:stop-opacity="0" />
					</linearGradient>
				{/each}
			</defs>

			{#each yTicks as tick (tick)}
				<line
					x1={margin.left}
					x2={width - margin.right}
					y1={y(tick)}
					y2={y(tick)}
					class={stylex.attrs(tick === 0 ? styles.base : styles.grid).class}
				/>
				<text
					x={margin.left - 10}
					y={y(tick)}
					dy="0.32em"
					text-anchor="end"
					class={stylex.attrs(styles.axis).class}>{format(tick)}</text
				>
			{/each}
			{#each xTicks as tick (tick.getTime())}
				<text
					x={x(tick)}
					y={height - 6}
					text-anchor="middle"
					class={stylex.attrs(styles.axis).class}>{label(tick)}</text
				>
			{/each}

			{#key reveal}
				<g bind:this={plot}>
					{#each shapes as shape (shape.line.key)}
						{#if shape.band && fill > 0}
							<path d={shape.band} style:fill={shape.line.color} style:fill-opacity={fill * 0.4} />
						{/if}
						{#if fill > 0}<path d={shape.fill} fill="url(#{id}-{shape.line.key})" />{/if}
						<path
							d={shape.stroke}
							fill="none"
							style:stroke={shape.line.color}
							stroke-width={compact ? 1.25 : 1.75}
							stroke-linejoin="round"
							stroke-linecap="round"
						/>
					{/each}
				</g>
			{/key}

			{#if hovered && !compact}
				<line
					x1={hovered.left}
					x2={hovered.left}
					y1={margin.top}
					y2={height - margin.bottom}
					class={stylex.attrs(styles.crosshair).class}
				/>
				{#each hovered.found as entry (entry.line.key)}
					{#if !Number.isNaN(entry.point.value)}
						<circle
							cx={hovered.left}
							cy={y(entry.point.value)}
							r="3.5"
							style:fill={entry.line.color}
							style:stroke="var(--color-surface)"
							stroke-width="2"
						/>
					{/if}
				{/each}
			{/if}
		</svg>

		{#if hovered && !compact}
			<div
				class="pointer-events-none absolute top-0 z-10 flex min-w-44 flex-col gap-1.5 px-3 py-2.5 {stylex.attrs(
					styles.tooltip,
				).class}"
				style:left="{hovered.left > width - 220 ? hovered.left - 12 : hovered.left + 12}px"
				style:transform={hovered.left > width - 220 ? 'translateX(-100%)' : 'none'}
			>
				<span class={stylex.attrs(type.label).class}>{moment(hovered.at)}</span>
				{#each hovered.found as entry (entry.line.key)}
					<span class="flex items-center gap-2">
						<span
							class="size-2 shrink-0 {stylex.attrs(styles.swatch).class}"
							style:background-color={entry.line.color}
						></span>
						<span class="flex-1 {stylex.attrs(type.muted).class}">{entry.line.label}</span>
						<span class={stylex.attrs(styles.value).class}>{format(entry.point.value)}</span>
					</span>
				{/each}
			</div>
		{/if}
	{/if}
</div>
