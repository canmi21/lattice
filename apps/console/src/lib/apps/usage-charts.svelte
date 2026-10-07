<script lang="ts">
	/**
	 * An app's container metrics, one series per node in node order: synced area charts over the
	 * chosen span, and memory now stacked by node. A node that did not answer is named, not drawn.
	 * Without `reads` the cards stand with placeholders, the read still on its way.
	 */
	import * as stylex from '@stylexjs/stylex';
	import type { Point } from '../host.ts';
	import AreaChart from '../chart/area-chart.svelte';
	import StackedBar from '../chart/stacked-bar.svelte';
	import Sync from '../chart/sync.svelte';
	import { bytes } from '../format.ts';
	import type { Node } from '../server/nodes.ts';
	import type { Read } from '../server/read.ts';
	import Card from '../card.svelte';
	import { type } from '../style.ts';
	import Skeleton from '../ui/skeleton.svelte';
	import { type Order, latest, lines } from './apps.ts';

	let {
		app,
		order,
		reads,
		since,
		until,
		reveal,
	}: {
		app: string;
		order: Order;
		reads?: Partial<Record<Node, Read<Point[]>>>;
		since: number;
		until: number;
		reveal: string;
	} = $props();

	const rate = (value: number) => `${bytes(value)}/s`;
	const percent = (value: number) => `${value.toFixed(1)}%`;

	const CHARTS = [
		{ title: 'Processor', name: 'cpu', format: percent, bytes: false },
		{ title: 'Memory', name: 'memory', format: bytes, bytes: true },
		{ title: 'Network received', name: 'network.received', format: rate, bytes: true },
		{ title: 'Network sent', name: 'network.sent', format: rate, bytes: true },
		{ title: 'Disk read', name: 'disk.read', format: rate, bytes: true },
		{ title: 'Disk written', name: 'disk.written', format: rate, bytes: true },
	];

	const memory = $derived(reads ? lines(order, reads, `${app}.memory`).lines : []);
	const now = $derived(latest(memory));
	const stacked = $derived(
		memory
			.filter((line) => now[line.key as Node] !== undefined)
			.map(({ key, label, color }) => ({ key, label, color, values: [now[key as Node] ?? 0] })),
	);
	const everyone = $derived(reads && Object.values(reads).every((read) => !read?.ok));
	/** One horizontal bar and its axis; see ../chart/stacked-bar.svelte. */
	const BAR = 28 + 26;
</script>

<Sync>
	<div class="grid gap-4 lg:grid-cols-2">
		{#each CHARTS as chart (chart.name)}
			<Card title={chart.title}>
				{#if reads}
					{@const made = lines(order, reads, `${app}.${chart.name}`)}
					<AreaChart
						lines={made.lines}
						{since}
						{until}
						format={chart.format}
						bytes={chart.bytes}
						band={false}
						label="{chart.title} of {app}, by node"
						error={everyone ? 'No node answered' : undefined}
						{reveal}
					/>
					{#if !everyone && made.unknown.length}
						<p class="mt-2 {stylex.attrs(type.soft).class}">
							No answer from {made.unknown.join(', ')}
						</p>
					{/if}
				{:else}
					<Skeleton height={200} chart />
				{/if}
			</Card>
		{/each}
	</div>
</Sync>

<Card title="Memory now, by node">
	{#if reads}
		<StackedBar
			categories={['Memory']}
			series={stacked}
			orientation="horizontal"
			format={bytes}
			label="Memory of {app} now, by node"
			error={everyone ? 'No node answered' : undefined}
		/>
	{:else}
		<Skeleton height={BAR} chart />
	{/if}
</Card>
