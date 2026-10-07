<script lang="ts">
	/**
	 * A value per category per moment as a grid of cells, each a step of one hue from the surface
	 * up to the full series color. The grid is CSS's, so cells fill whatever width is there with
	 * nothing measured; the steps are counted, never a continuous blend, and named in a scale legend.
	 * A column follows the moment shared by charts under one `sync.svelte`.
	 */
	import * as stylex from '@stylexjs/stylex';
	import Frame from './frame.svelte';
	import { hoverOf } from './hover.svelte.ts';
	import { GAP, TARGET, rampColor, rampStep } from './layout.ts';
	import { compact } from './numbers.ts';
	import { moment, tickLabel } from './series.ts';
	import { chart } from './style.ts';
	import { timeZone } from '../ui/time-zone.ts';
	import Tooltip from './tooltip.svelte';

	let {
		rows,
		times,
		values,
		hue = 'var(--color-series-5)',
		steps = 5,
		low,
		high,
		format = compact,
		label = rows.map((row) => row.label).join(', '),
		error,
		stale = false,
	}: {
		rows: { key: string; label: string }[];
		/** Each column's moment, in seconds, oldest first. */
		times: number[];
		/** One array per row, a value per column; NaN where nothing was read. */
		values: number[][];
		/** The one hue every step is drawn from. */
		hue?: string;
		steps?: number;
		/** The ends of the ramp; the values' own when not given. */
		low?: number;
		high?: number;
		format?: (value: number) => string;
		label?: string;
		error?: string;
		stale?: boolean;
	} = $props();

	const NAMES = 112;
	const PITCH = TARGET;
	const AXIS = 22;
	const SCALE = 28;

	const hover = hoverOf();
	const zone = timeZone();
	let active: { row: number; column: number } | undefined = $state();
	let focused = $state({ row: 0, column: 0 });
	const cells: HTMLElement[] = $state([]);

	const finite = $derived(values.flat().filter(Number.isFinite));
	const bottom = $derived(low ?? Math.min(0, ...finite));
	const top = $derived(high ?? Math.max(bottom, ...finite));
	const first = $derived(times[0] ?? 0);
	const last = $derived(times.at(-1) ?? 0);
	const step = $derived(times.length > 1 ? (last - first) / (times.length - 1) : 0);
	const tick = $derived(tickLabel(last - first, zone));
	/** About six labels under the grid, at their columns' centers. */
	const labeled = $derived(
		times
			.map((at, column) => ({ at, column }))
			.filter((_, column) => column % Math.max(1, Math.ceil(times.length / 6)) === 0),
	);
	/** The column the shared moment falls in, when it came from another chart. */
	const followed = $derived.by(() => {
		const shared = hover.at;
		if (shared === undefined || active) return undefined;
		const column = times.findLastIndex((at) => at <= shared);
		const at = times[column];
		return at !== undefined && shared <= at + Math.max(step, 1) ? column : undefined;
	});
	const legend = $derived(
		Array.from({ length: steps }, (_, index) => ({
			color: rampColor(hue, index, steps),
			from: bottom + ((top - bottom) * index) / steps,
		})),
	);

	const read = (row: number, column: number) => values[row]?.[column] ?? Number.NaN;
	const fill = (value: number) => {
		const at = rampStep(value, bottom, top, steps);
		return at === undefined ? 'var(--color-sunken)' : rampColor(hue, at, steps);
	};
	const said = (value: number) => (Number.isFinite(value) ? format(value) : 'No reading');

	function enter(row: number, column: number) {
		active = { row, column };
		hover.at = times[column];
	}

	function focus(row: number, column: number) {
		focused = { row, column };
		enter(row, column);
	}

	function leave() {
		active = undefined;
		hover.at = undefined;
	}

	function key(event: KeyboardEvent) {
		const { row, column } = focused;
		const moves: Record<string, [number, number]> = {
			ArrowUp: [row - 1, column],
			ArrowDown: [row + 1, column],
			ArrowLeft: [row, column - 1],
			ArrowRight: [row, column + 1],
			Home: [row, 0],
			End: [row, times.length - 1],
		};
		const next = moves[event.key];
		if (!next) return;
		event.preventDefault();
		const [to, across] = next;
		focused = {
			row: Math.min(rows.length - 1, Math.max(0, to)),
			column: Math.min(times.length - 1, Math.max(0, across)),
		};
		cells[focused.row * times.length + focused.column]?.focus();
	}

	const table = $derived({
		head: ['Time', ...rows.map((row) => row.label)],
		numeric: [false, ...rows.map(() => true)],
		rows: times.map((at, column) => [
			moment(at, zone),
			...rows.map((_, row) => said(read(row, column))),
		]),
	});
	const axis = stylex.attrs(chart.axis).class;
	const styles = stylex.create({
		name: { color: 'var(--color-text-muted)' },
		cell: { outlineOffset: '-1px' },
		on: { outline: '1px solid var(--color-text-strong)' },
		follow: { boxShadow: 'inset 0 0 0 1px var(--color-text-muted)' },
	});
</script>

<Frame
	{label}
	height={rows.length * PITCH + AXIS + SCALE}
	{table}
	empty={rows.length === 0 || times.length === 0}
	{error}
	{stale}
>
	<div class="relative size-full" style:padding-left="{NAMES}px">
		{#each rows as row, index (row.key)}
			<span
				class="absolute left-0 truncate pr-3 text-right {stylex.attrs(chart.axis, styles.name)
					.class}"
				style:width="{NAMES}px"
				style:top="{index * PITCH + PITCH / 2}px"
				style:transform="translateY(-50%)"
				title={row.label}>{row.label}</span
			>
		{/each}
		<div class="relative">
			<div
				class="grid"
				style:grid-template-columns="repeat({times.length}, minmax(0, 1fr))"
				style:grid-template-rows="repeat({rows.length}, {PITCH - GAP}px)"
				style:gap="{GAP}px"
				role="grid"
				aria-label={label}
				tabindex="-1"
				onkeydown={key}
				onpointerleave={leave}
			>
				{#each rows as row, index (row.key)}
					<div class="contents" role="row">
						{#each times as at, column (at)}
							{@const value = read(index, column)}
							{@const on = active?.row === index && active.column === column}
							<div
								bind:this={cells[index * times.length + column]}
								role="gridcell"
								tabindex={focused.row === index && focused.column === column ? 0 : -1}
								aria-label="{row.label}, {moment(at, zone)}: {said(value)}"
								class={stylex.attrs(
									styles.cell,
									on && styles.on,
									followed === column && styles.follow,
								).class}
								style:background-color={fill(value)}
								onpointerenter={() => enter(index, column)}
								onfocus={() => focus(index, column)}
								onblur={leave}
							></div>
						{/each}
					</div>
				{/each}
			</div>
			{#if active}
				<Tooltip
					x={((active.column + 0.5) / times.length) * 100}
					top="{(active.row + 1) * PITCH}px"
					title={rows[active.row]?.label ?? ''}
					rows={[
						{
							key: 'value',
							label: moment(times[active.column] ?? 0, zone),
							value: said(read(active.row, active.column)),
						},
					]}
				/>
			{/if}
			<div class="relative" style:height="{AXIS}px">
				{#each labeled as { at, column } (at)}
					<span
						class="absolute top-1.5 -translate-x-1/2 whitespace-nowrap {axis}"
						style:left="{((column + 0.5) / times.length) * 100}%">{tick(new Date(at * 1000))}</span
					>
				{/each}
			</div>
			<div class="flex items-center gap-3" style:height="{SCALE}px">
				{#each legend as swatch, index (index)}
					<span class="inline-flex items-center gap-1.5 {axis}">
						<span
							class="size-2.5 {stylex.attrs(chart.keyRect).class}"
							style:background-color={swatch.color}
						></span>{format(swatch.from)}+
					</span>
				{/each}
			</div>
		</div>
	</div>
</Frame>
