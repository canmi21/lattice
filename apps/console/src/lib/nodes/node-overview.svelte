<script lang="ts">
	/**
	 * A node's machine: how full it is now, as meters against its totals, and how it got there, as
	 * charts over the chosen span that share one crosshair, its deploys marked down each of them.
	 * The cards stand at once and fill as the page's streamed reads land.
	 */
	import * as stylex from '@stylexjs/stylex';
	import Card from '../card.svelte';
	import AreaChart from '../chart/area-chart.svelte';
	import Heatmap from '../chart/heatmap.svelte';
	import Meter from '../chart/meter.svelte';
	import { percent } from '../chart/numbers.ts';
	import Sync from '../chart/sync.svelte';
	import { bytes } from '../format.ts';
	import type { Now } from '../host.ts';
	import type { Read } from '../server/read.ts';
	import type { Span } from '../server/reads.ts';
	import { type } from '../style.ts';
	import Skeleton from '../ui/skeleton.svelte';
	import Unread from '../unread.svelte';
	import type { NodeCharts } from './charts.ts';

	let {
		machine,
		waiting,
		read,
		span,
		reveal,
	}: {
		/** The latest reading, live where the relay carries it. */
		machine?: Now;
		/** No reading yet, and the host's own is on its way. */
		waiting: boolean;
		read: Promise<{ charts: Read<NodeCharts>; marks: { at: number; label: string }[] }>;
		span: Span;
		/** The range chosen, so the charts draw in again when it changes. */
		reveal: string;
	} = $props();

	const values = $derived(machine?.sample.values ?? {});
	const info = $derived(machine?.info);
	const grain = $derived(span.grain === 'minute' ? 'a point a minute' : 'a point an hour');
	const rate = (value: number) => `${bytes(value)}/s`;
	const share = (value: number) => percent(value / 100);
	const common = (marks: { at: number; label: string }[]) => ({
		since: span.since,
		until: span.until,
		events: marks,
		reveal,
	});
	/** The cards nearly every node draws, held in place while the series is on its way. */
	const PENDING = ['CPU', 'CPU per core', 'Memory', 'Load', 'Network', 'Disk'];
</script>

{#if info}
	<Card title="Now">
		<div class="grid gap-x-8 gap-y-5 sm:grid-cols-2 xl:grid-cols-4">
			<Meter
				label="CPU, in cores busy"
				value={((values['cpu.usage'] ?? 0) / 100) * info.cores}
				limit={info.cores}
				format={(value) => value.toFixed(1).replace(/\.0$/, '')}
			/>
			<Meter label="Memory" value={values['memory.used'] ?? 0} limit={info.memory} format={bytes} />
			{#if info.swap}
				<Meter label="Swap" value={values['swap.used'] ?? 0} limit={info.swap} format={bytes} />
			{:else}
				<p class="flex flex-col gap-1.5 {stylex.attrs(type.soft).class}">
					Swap<span>None configured</span>
				</p>
			{/if}
			{#if info.storage}
				<Meter
					label="Storage"
					value={values['storage.used'] ?? 0}
					limit={info.storage}
					format={bytes}
				/>
			{/if}
		</div>
	</Card>
{:else if waiting}
	<Card title="Now"><Skeleton height={40} /></Card>
{/if}

{#await read}
	<div class="grid gap-4 xl:grid-cols-2">
		{#each PENDING as title (title)}
			<Card {title}><Skeleton height={200} chart /></Card>
		{/each}
	</div>
{:then { charts, marks }}
	{#if !charts.ok}
		<Unread what="The machine's series" failure={charts.failure} />
	{:else}
		{@const drawn = charts.data}
		{@const shared = common(marks)}
		<Sync>
			<div class="grid gap-4 xl:grid-cols-2">
				<Card title="CPU">
					<AreaChart lines={drawn.cpu} ceiling={100} format={share} {...shared} />
				</Card>
				{#if drawn.cores.rows.length}
					<Card title="CPU per core">
						<Heatmap
							rows={drawn.cores.rows}
							times={drawn.cores.times}
							values={drawn.cores.values}
							low={0}
							high={100}
							format={share}
							label="CPU per core"
						/>
					</Card>
				{/if}
				<Card title="Memory">
					<AreaChart
						lines={drawn.memory}
						bytes
						format={bytes}
						thresholds={info ? [{ value: info.memory, label: 'Total' }] : []}
						{...shared}
					/>
				</Card>
				<Card title="Load">
					<AreaChart
						lines={drawn.load}
						format={(value) => value.toFixed(2)}
						thresholds={info ? [{ value: info.cores, label: 'Cores', tone: 'warn' }] : []}
						{...shared}
					/>
				</Card>
				<Card title="Network">
					<AreaChart lines={drawn.network} bytes format={rate} {...shared} />
				</Card>
				<Card title="Disk">
					<AreaChart lines={drawn.disk} bytes format={rate} {...shared} />
				</Card>
				{#if drawn.temperature.length}
					<Card title="Temperature">
						<AreaChart
							lines={drawn.temperature}
							format={(value) => `${value.toFixed(1)} °C`}
							{...shared}
						/>
					</Card>
				{/if}
			</div>
		</Sync>
	{/if}
{/await}
