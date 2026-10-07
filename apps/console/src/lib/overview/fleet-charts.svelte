<script lang="ts">
	/**
	 * The fleet over the chosen span: CPU, memory and network, a line per node in each node's own
	 * color, one crosshair across all four, and every run started in the span marked down each.
	 * The cards stand at once; their plots fill when the page's streamed read lands.
	 */
	import * as stylex from '@stylexjs/stylex';
	import Card from '../card.svelte';
	import AreaChart from '../chart/area-chart.svelte';
	import type { Line } from '../chart/series.ts';
	import Sync from '../chart/sync.svelte';
	import { bytes } from '../format.ts';
	import { type } from '../style.ts';
	import Skeleton from '../ui/skeleton.svelte';
	import type { Missing } from './fleet.ts';

	interface Fleet {
		cpu: Line[];
		memory: Line[];
		received: Line[];
		sent: Line[];
		missing: Missing[];
		marks: { at: number; label: string }[];
	}

	let {
		fleet,
		since,
		until,
		span,
	}: {
		fleet: Promise<Fleet>;
		since: number;
		until: number;
		/** The span's name, which draws the plots in again when it changes. */
		span: string;
	} = $props();

	/** Every node failed, which is a failure to read rather than a quiet span. */
	const unread = (read: Fleet) =>
		read.cpu.length === 0 && read.missing.length ? 'No node answered.' : undefined;
	const rate = (value: number) => `${bytes(value)}/s`;
	const percent = (value: number) => `${Math.round(value)}%`;
	const CHARTS = [
		{ key: 'cpu', title: 'CPU', what: 'Share of all cores busy', ceiling: 100, format: percent },
		{ key: 'memory', title: 'Memory', what: 'In use', bytes: true, format: bytes },
		{ key: 'received', title: 'Received', what: 'Network in', bytes: true, format: rate },
		{ key: 'sent', title: 'Sent', what: 'Network out', bytes: true, format: rate },
	] as const;
</script>

<section class="flex flex-col gap-3">
	<h2 class={stylex.attrs(type.heading).class}>Fleet</h2>
	<Sync>
		<div class="grid gap-4 xl:grid-cols-2">
			{#each CHARTS as chart (chart.key)}
				<Card title={chart.title}>
					{#await fleet}
						<Skeleton height={200} chart />
					{:then read}
						<AreaChart
							lines={read[chart.key]}
							{since}
							{until}
							ceiling={'ceiling' in chart ? chart.ceiling : undefined}
							bytes={'bytes' in chart}
							band={false}
							format={chart.format}
							events={read.marks}
							reveal={span}
							error={unread(read)}
							label="{chart.title}, {chart.what.toLowerCase()}, per node"
						/>
					{/await}
				</Card>
			{/each}
		</div>
	</Sync>
</section>
