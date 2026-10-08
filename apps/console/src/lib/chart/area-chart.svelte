<script lang="ts">
	/**
	 * Lines over time, each over a faint wash, with limits, marked events, and a crosshair shared by
	 * every chart under one `sync.svelte`. Drawn whole on the server: the plot is a viewBox
	 * stretched across whatever width it is given, so nothing is measured and nothing moves on
	 * hydration, and what a stretch would distort -- labels, dots, the tooltip -- is HTML placed in
	 * percent. Ported from infra's apps/deploy/panel/src/lib/chart/area-chart.svelte.
	 */
	import * as stylex from '@stylexjs/stylex';
	import WarningIcon from '@tabler/icons-svelte-runes/icons/alert-triangle';
	import { untrack } from 'svelte';
	import { pressMotion, prefersReducedMotion } from '@canmi/kit/motion';
	import { scaleLinear, scaleUtc } from 'd3-scale';
	import { area, curveMonotoneX, line as linePath } from 'd3-shape';
	import { tone as tones } from '../style.ts';
	import Frame from './frame.svelte';
	import { hoverOf } from './hover.svelte.ts';
	import { nearestIndex } from './layout.ts';
	import { timeZone } from '../ui/time-zone.ts';
	import {
		binaryTicks,
		moment,
		tickLabel,
		withGaps,
		zonedTicks,
		type Datum,
		type Line,
	} from './series.ts';
	import { chart } from './style.ts';
	import Tooltip from './tooltip.svelte';

	let {
		lines,
		since,
		until,
		height = 200,
		ceiling,
		format = (value: number) => value.toFixed(1),
		band = true,
		bytes = false,
		thresholds = [],
		events = [],
		label = lines.map((line) => line.label).join(', '),
		error,
		stale = false,
		reveal = '',
	}: {
		lines: Line[];
		/** The span shown, in seconds; the points' own when not given. */
		since?: number;
		until?: number;
		/** The whole height in pixels, axes included. */
		height?: number;
		/** The top of the scale when it is fixed, as a percentage's is at 100. */
		ceiling?: number;
		format?: (value: number) => string;
		/** Whether to shade each point's minimum to maximum. */
		band?: boolean;
		/** A quantity of bytes, so its ticks fall on binary units. */
		bytes?: boolean;
		/** A limit drawn across the plot; a tone marks one worth acting on. */
		thresholds?: { value: number; label: string; tone?: 'warn' | 'bad' }[];
		/** A moment marked down the plot, a deploy say. */
		events?: { at: number; label: string }[];
		label?: string;
		error?: string;
		stale?: boolean;
		/** Draws the plot in again when it changes: the span chosen, never each new point. */
		reveal?: string;
	} = $props();

	/** The plot's width in its own units; the page stretches it to whatever width it has. */
	const WIDTH = 1000;
	/** The wash under a line: a tint, never a block, so layered washes stay readable. */
	const WASH = 0.1;

	const hover = hoverOf();
	const zone = timeZone();
	let hidden: string[] = $state([]);
	let plot: SVGGElement | undefined = $state();

	const shown = $derived(lines.filter((line) => !hidden.includes(line.key)));
	const margin = $derived({ top: events.length ? 24 : 10, right: 8, bottom: 26, left: 52 });
	/** The plot's height, in pixels and in its own units alike: only its width stretches. */
	const inner = $derived(Math.max(1, height - margin.top - margin.bottom));
	const every = $derived(lines.flatMap((line) => line.points));
	const start = $derived(since ?? (every.length ? Math.min(...every.map((point) => point.at)) : 0));
	const end = $derived(until ?? (every.length ? Math.max(...every.map((point) => point.at)) : 0));
	/** Every moment a shown line has a point at, the steps the crosshair snaps to. */
	const times = $derived(
		[...new Set(shown.flatMap((line) => line.points.map((point) => point.at)))].sort(
			(a, b) => a - b,
		),
	);

	const x = $derived(
		scaleUtc()
			.domain([new Date(start * 1000), new Date(end * 1000)])
			.range([0, WIDTH]),
	);
	const y = $derived.by(() => {
		const values = shown.flatMap((line) =>
			line.points.map((point) => (band ? (point.maximum ?? point.value) : point.value)),
		);
		const highest = Math.max(
			0,
			...values.filter(Number.isFinite),
			...thresholds.map((limit) => limit.value),
		);
		const top = highest > 0 ? highest * 1.1 : 1;
		const scale = scaleLinear().range([inner, 0]);
		if (ceiling !== undefined) return scale.domain([0, ceiling]);
		if (bytes) return scale.domain([0, binaryTicks(top).at(-1) ?? top]);
		return scale.domain([0, top]).nice(4);
	});

	const defined = (point: Datum) => !Number.isNaN(point.value);
	const across = (point: Datum) => x(new Date(point.at * 1000));
	const share = (units: number) => (units / WIDTH) * 100;

	const shapes = $derived(
		shown.map((line) => {
			const points = withGaps(line.points);
			const shape = area<Datum>().defined(defined).curve(curveMonotoneX).x(across);
			return {
				line,
				fill: shape.y0(y(0)).y1((point) => y(point.value))(points),
				stroke: linePath<Datum>()
					.defined(defined)
					.curve(curveMonotoneX)
					.x(across)
					.y((point) => y(point.value))(points),
				band:
					band && points.some((point) => point.minimum !== undefined)
						? area<Datum>()
								.defined(defined)
								.curve(curveMonotoneX)
								.x(across)
								.y0((point) => y(point.minimum ?? point.value))
								.y1((point) => y(point.maximum ?? point.value))(points)
						: null,
			};
		}),
	);

	const yTicks = $derived.by(() => {
		const [, top = 0] = y.domain();
		return bytes ? binaryTicks(top) : y.ticks(4);
	});
	/** No label set against an edge, where it would be cut in half. */
	const xTicks = $derived(
		zonedTicks(start, end, 6, zone).filter(
			(tick) => x(tick) > WIDTH * 0.04 && x(tick) < WIDTH * 0.96,
		),
	);
	const tick = $derived(tickLabel(end - start, zone));
	const marks = $derived(
		events
			.filter((event) => event.at >= start && event.at <= end)
			.map((event) => ({ ...event, left: share(x(new Date(event.at * 1000))) })),
	);

	/** Where the shared moment falls in this chart, snapped to its nearest step; none outside. */
	const index = $derived(
		hover.at === undefined || hover.at < start || hover.at > end
			? undefined
			: nearestIndex(times, hover.at),
	);
	const hovered = $derived.by(() => {
		const at = index === undefined ? undefined : times[index];
		if (at === undefined) return undefined;
		const found = shown.flatMap((line) => {
			const ats = line.points.map((one) => one.at);
			const point = line.points[nearestIndex(ats, at) ?? -1];
			return point && !Number.isNaN(point.value) ? [{ line, point }] : [];
		});
		const step = times.length > 1 ? (end - start) / (times.length - 1) : end - start;
		const near = marks.filter((mark) => Math.abs(mark.at - at) <= step / 2);
		return { at, left: x(new Date(at * 1000)), found, near };
	});

	function move(event: PointerEvent) {
		const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
		const within = box.width > 0 ? (event.clientX - box.left) / box.width : -1;
		const at = x.invert(within * WIDTH).getTime() / 1000;
		hover.at = within < 0 || within > 1 ? undefined : times[nearestIndex(times, at) ?? -1];
	}

	function key(event: KeyboardEvent) {
		const last = times.length - 1;
		const from = index ?? last;
		const to =
			event.key === 'ArrowLeft'
				? from - 1
				: event.key === 'ArrowRight'
					? from + 1
					: event.key === 'Home'
						? 0
						: event.key === 'End'
							? last
							: undefined;
		if (to === undefined) return;
		event.preventDefault();
		hover.at = times[Math.min(last, Math.max(0, to))];
	}

	const table = $derived({
		head: ['Time', ...shown.map((line) => line.label)],
		numeric: [false, ...shown.map(() => true)],
		rows: times.map((at) => [
			moment(at, zone),
			...shown.map((line) => {
				const point = line.points.find((one) => one.at === at);
				return point && !Number.isNaN(point.value) ? format(point.value) : '';
			}),
		]),
	});
	const readout = $derived.by(() => {
		if (!hovered) return undefined;
		const values = hovered.found.map((one) => `${one.line.label} ${format(one.point.value)}`);
		return `${moment(hovered.at, zone)}: ${values.join(', ')}`;
	});

	/** The span drawn last. The server's drawing is the first, so only a new span draws in. */
	let drawn = untrack(() => reveal);
	$effect(() => {
		const next = reveal;
		if (!plot || next === drawn) return;
		drawn = next;
		const width = plot.ownerSVGElement?.clientWidth ?? 0;
		if (!width || prefersReducedMotion()) return;
		const timing = pressMotion(width);
		plot.animate([{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0 0 0)' }], {
			duration: timing.duration * 1000 * 1.6,
			easing: `cubic-bezier(${timing.ease.join(', ')})`,
		});
	});

	const axis = stylex.attrs(chart.axis).class;
</script>

<Frame
	{label}
	{height}
	legend={lines}
	bind:hidden
	{table}
	empty={every.length === 0}
	emptyText="No points in this span"
	{error}
	{stale}
>
	<div class="relative size-full">
		{#each yTicks as value (value)}
			<span
				class="absolute -translate-y-1/2 text-right whitespace-nowrap {axis}"
				style:right="calc(100% - {margin.left - 10}px)"
				style:top="{margin.top + y(value)}px">{format(value)}</span
			>
		{/each}
		{#each xTicks as when (when.getTime())}
			<span
				class="absolute bottom-1.5 -translate-x-1/2 whitespace-nowrap {axis}"
				style:left="calc({margin.left}px + (100% - {margin.left + margin.right}px) * {x(when) /
					WIDTH})">{tick(when)}</span
			>
		{/each}

		<div
			class="absolute touch-none select-none"
			style:inset="{margin.top}px {margin.right}px {margin.bottom}px {margin.left}px"
			role="slider"
			tabindex="0"
			aria-label={label}
			aria-valuemin={0}
			aria-valuemax={Math.max(0, times.length - 1)}
			aria-valuenow={index ?? times.length - 1}
			aria-valuetext={readout}
			onpointermove={move}
			onpointerleave={() => (hover.at = undefined)}
			onkeydown={key}
			onblur={() => (hover.at = undefined)}
		>
			<svg
				viewBox="0 0 {WIDTH} {inner}"
				preserveAspectRatio="none"
				class="absolute inset-0 block size-full overflow-visible"
				aria-hidden="true"
			>
				{#each yTicks as value (value)}
					<line
						x1="0"
						x2={WIDTH}
						y1={y(value)}
						y2={y(value)}
						vector-effect="non-scaling-stroke"
						class={stylex.attrs(value === 0 ? chart.baselineStroke : chart.gridStroke).class}
					/>
				{/each}
				{#each marks as mark (mark.at)}
					<line
						x1={x(new Date(mark.at * 1000))}
						x2={x(new Date(mark.at * 1000))}
						y1={-margin.top + 16}
						y2={inner}
						vector-effect="non-scaling-stroke"
						class={stylex.attrs(chart.marker).class}
					/>
				{/each}

				{#key reveal}
					<g bind:this={plot}>
						{#each shapes as shape (shape.line.key)}
							{#if shape.band}
								<path d={shape.band} style:fill={shape.line.color} fill-opacity={WASH} />
							{/if}
							<path d={shape.fill} style:fill={shape.line.color} fill-opacity={WASH} />
							<path
								d={shape.stroke}
								fill="none"
								style:stroke={shape.line.color}
								stroke-width="2"
								stroke-linejoin="round"
								stroke-linecap="round"
								vector-effect="non-scaling-stroke"
							/>
						{/each}
					</g>
				{/key}

				{#each thresholds as limit (limit.label)}
					<line
						x1="0"
						x2={WIDTH}
						y1={y(limit.value)}
						y2={y(limit.value)}
						vector-effect="non-scaling-stroke"
						style:stroke={limit.tone
							? `var(--color-${limit.tone === 'bad' ? 'danger' : 'warn'})`
							: undefined}
						class={stylex.attrs(chart.crosshair).class}
					/>
				{/each}

				{#if hovered}
					<line
						x1={hovered.left}
						x2={hovered.left}
						y1="0"
						y2={inner}
						vector-effect="non-scaling-stroke"
						class={stylex.attrs(chart.crosshair).class}
					/>
				{/if}
			</svg>

			{#each thresholds as limit (limit.label)}
				<span
					class="absolute right-1 flex -translate-y-full gap-1 whitespace-nowrap {axis}"
					style:top="{y(limit.value)}px"
				>
					{#if limit.tone}<span class="inline-flex {stylex.attrs(tones[limit.tone]).class}"
							><WarningIcon size={11} stroke={2.5} /></span
						>{/if}{limit.label}
					{format(limit.value)}
				</span>
			{/each}
			{#each marks as mark (mark.at)}
				<span
					class="pointer-events-none absolute max-w-32 truncate {axis}"
					style:top="-{margin.top - 2}px"
					style:left="{mark.left}%"
					style:transform={mark.left > 85
						? 'translateX(-100%)'
						: mark.left < 15
							? 'none'
							: 'translateX(-50%)'}
					title={mark.label}>{mark.label}</span
				>
			{/each}

			{#if hovered}
				{#each hovered.found as entry (entry.line.key)}
					<span
						class="pointer-events-none absolute size-2 -translate-1/2 {stylex.attrs(chart.dot)
							.class}"
						style:left="{share(hovered.left)}%"
						style:top="{y(entry.point.value)}px"
						style:background-color={entry.line.color}
					></span>
				{/each}
				<Tooltip
					x={share(hovered.left)}
					title={moment(hovered.at, zone)}
					rows={[
						...hovered.found.map((entry) => ({
							key: entry.line.key,
							label: entry.line.label,
							value: format(entry.point.value),
							color: entry.line.color,
						})),
						...hovered.near.map((mark) => ({
							key: `event-${mark.at}`,
							label: 'Event',
							value: mark.label,
						})),
					]}
				/>
			{/if}
		</div>
	</div>
</Frame>
