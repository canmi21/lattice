<script lang="ts" module>
	/** One stage of a row's run: when it began, when it ended if it has, and whether it failed. */
	export interface Stage {
		stage: string;
		start: number;
		end?: number;
		failed?: boolean;
	}

	export interface Track {
		key: string;
		label: string;
		stages: Stage[];
	}
</script>

<script lang="ts">
	/**
	 * Rows of stages across time, a deploy's on each node say: each stage a segment in its stage's
	 * color, GAP apart from the next, a failure marked with an icon and a word, a stage still going
	 * drawn to `until` and dimmed. Placed in percent across and pixels down, nothing measured. The
	 * moment shared under `sync.svelte` is drawn across every row.
	 */
	import * as stylex from '@stylexjs/stylex';
	import { radius } from '@canmi/kit/tokens/vocabulary.stylex';
	import XCircleIcon from '@tabler/icons-svelte-runes/icons/circle-x';
	import { scaleUtc } from 'd3-scale';
	import { tone } from '../style.ts';
	import { timeZone } from '../ui/time-zone.ts';
	import Frame from './frame.svelte';
	import { hoverOf } from './hover.svelte.ts';
	import { TARGET, span } from './layout.ts';
	import { duration } from './numbers.ts';
	import { moment, tickLabel, zonedTicks, type Key } from './series.ts';
	import { chart } from './style.ts';
	import Tooltip from './tooltip.svelte';

	let {
		tracks,
		stages,
		since,
		until,
		label = 'Stages by row over time',
		error,
		stale = false,
	}: {
		tracks: Track[];
		/** Every stage a segment can be, in their fixed order, each with its color. */
		stages: Key[];
		/** The span shown, in seconds; the stages' own when not given. */
		since?: number;
		/** The span's end, and where a stage still going is drawn to. */
		until?: number;
		label?: string;
		error?: string;
		stale?: boolean;
	} = $props();

	const NAMES = 112;
	const PITCH = Math.max(TARGET, 28);
	const THICK = 16;
	const AXIS = 22;

	const hover = hoverOf();
	const zone = timeZone();
	let hidden: string[] = $state([]);
	let active: { track: number; index: number } | undefined = $state();

	const every = $derived(tracks.flatMap((track) => track.stages));
	const start = $derived(since ?? Math.min(...every.map((one) => one.start)));
	const end = $derived(until ?? Math.max(start + 1, ...every.map((one) => one.end ?? one.start)));
	const x = $derived(
		scaleUtc()
			.domain([new Date(start * 1000), new Date(end * 1000)])
			.range([0, 100]),
	);
	const at = (seconds: number) => x(new Date(seconds * 1000));
	const ticks = $derived(zonedTicks(start, end, 5, zone));
	const tick = $derived(tickLabel(end - start, zone));
	const colors = $derived(new Map(stages.map((stage) => [stage.key, stage.color])));
	const names = $derived(new Map(stages.map((stage) => [stage.key, stage.label])));
	const drawn = (track: Track) =>
		track.stages.filter((one) => !hidden.includes(one.stage)).toSorted((a, b) => a.start - b.start);
	const crosshair = $derived(
		hover.at !== undefined && hover.at >= start && hover.at <= end ? at(hover.at) : undefined,
	);

	const length = (one: Stage) => (one.end ?? end) - one.start;
	const outcome = (one: Stage) =>
		one.failed ? 'Failed' : one.end === undefined ? 'Running' : 'Done';
	const tip = (one: Stage) => [
		{
			key: 'stage',
			label: names.get(one.stage) ?? one.stage,
			value: duration(length(one)) + (one.end === undefined ? ' so far' : ''),
			color: colors.get(one.stage),
			mark: 'rect' as const,
		},
		{ key: 'start', label: 'Began', value: moment(one.start, zone) },
		{ key: 'outcome', label: 'Outcome', value: outcome(one) },
	];

	const table = $derived({
		head: ['Row', 'Stage', 'Began', 'Duration', 'Outcome'],
		numeric: [false, false, false, true, false],
		rows: tracks.flatMap((track) =>
			track.stages.map((one) => [
				track.label,
				names.get(one.stage) ?? one.stage,
				moment(one.start, zone),
				duration(length(one)),
				outcome(one),
			]),
		),
	});
	const axis = stylex.attrs(chart.axis).class;
	const styles = stylex.create({
		name: { color: 'var(--color-text-muted)' },
		segment: { borderRadius: radius.sm },
		running: { opacity: 0.6 },
		rule: { backgroundColor: 'var(--color-text-muted)' },
	});
</script>

<Frame
	{label}
	height={tracks.length * PITCH + AXIS}
	legend={stages}
	mark="rect"
	bind:hidden
	{table}
	empty={every.length === 0}
	{error}
	{stale}
>
	<div class="relative size-full" style:padding-left="{NAMES}px">
		<div class="relative h-full">
			{#each ticks as when (when.getTime())}
				<div
					class="absolute top-0 w-px {stylex.attrs(chart.grid).class}"
					style:left="{x(when)}%"
					style:bottom="{AXIS}px"
				></div>
				<span
					class="absolute bottom-0 -translate-x-1/2 whitespace-nowrap {axis}"
					style:left="{x(when)}%">{tick(when)}</span
				>
			{/each}

			{#each tracks as track, row (track.key)}
				{@const shown = drawn(track)}
				<span
					class="absolute truncate pr-3 text-right {stylex.attrs(chart.axis, styles.name).class}"
					style:right="100%"
					style:width="{NAMES}px"
					style:top="{row * PITCH + PITCH / 2}px"
					style:transform="translateY(-50%)"
					title={track.label}>{track.label}</span
				>
				{#each shown as one, index (`${one.stage}@${one.start}`)}
					{@const place = span(at(one.start), at(one.end ?? end), index, shown.length, 2)}
					<div
						class="pointer-events-none absolute {stylex.attrs(
							styles.segment,
							one.end === undefined && styles.running,
						).class}"
						style:top="{row * PITCH + (PITCH - THICK) / 2}px"
						style:height="{THICK}px"
						style:left={place.offset}
						style:width={place.length}
						style:background-color={colors.get(one.stage)}
					></div>
					{#if one.failed}
						<span
							class="pointer-events-none absolute inline-flex -translate-y-1/2 pl-1 {stylex.attrs(
								tone.bad,
							).class}"
							style:left="{at(one.end ?? end)}%"
							style:top="{row * PITCH + PITCH / 2}px"
							><XCircleIcon size={14} stroke={2.5} aria-label="Failed" /></span
						>
					{/if}
					<button
						type="button"
						class="absolute {stylex.attrs(chart.hit).class}"
						style:top="{row * PITCH}px"
						style:height="{PITCH}px"
						style:left={place.offset}
						style:width={place.length}
						aria-label="{track.label}, {tip(one)
							.map((line) => `${line.label} ${line.value}`)
							.join(', ')}"
						onpointerenter={() => (active = { track: row, index })}
						onpointerleave={() => (active = undefined)}
						onfocus={() => (active = { track: row, index })}
						onblur={() => (active = undefined)}
					></button>
				{/each}
			{/each}

			{#if crosshair !== undefined}
				<div
					class="pointer-events-none absolute top-0 w-px {stylex.attrs(styles.rule).class}"
					style:left="{crosshair}%"
					style:bottom="{AXIS}px"
				></div>
			{/if}
			{#if active}
				{@const track = tracks[active.track]}
				{@const one = track ? drawn(track)[active.index] : undefined}
				{#if track && one}
					<Tooltip
						x={at(one.start)}
						top="{(active.track + 1) * PITCH}px"
						title={track.label}
						rows={tip(one)}
					/>
				{/if}
			{/if}
		</div>
	</div>
</Frame>
