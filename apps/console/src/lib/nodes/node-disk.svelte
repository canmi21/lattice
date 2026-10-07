<script lang="ts">
	/** Where a node's disk goes: each mount against its size, each app's share, and its snapshots. */
	import * as stylex from '@stylexjs/stylex';
	import Card from '../card.svelte';
	import BarChart from '../chart/bar-chart.svelte';
	import Meter from '../chart/meter.svelte';
	import { moment } from '../chart/series.ts';
	import { bytes } from '../format.ts';
	import type { Disk, DiskSnapshot } from '../host.ts';
	import { type } from '../style.ts';
	import DataTable from '../table/data-table.svelte';
	import type { Column } from '../table/table.ts';
	import { timeZone } from '../ui/time-zone.ts';

	let { disk }: { disk: Disk } = $props();

	const zone = timeZone();
	const used = $derived(disk.apps.toSorted((a, b) => b.bytes - a.bytes));
	const partial = $derived(used.filter((app) => app.partial).length);

	const columns: Column<DiskSnapshot>[] = [
		{ key: 'name', label: 'Snapshot', value: (one) => one.name },
		{ key: 'app', label: 'App', value: (one) => one.app },
		{
			key: 'created',
			label: 'Taken',
			kind: 'number',
			value: (one) => Date.parse(one.created),
			text: (one) => moment(Date.parse(one.created) / 1000, zone),
		},
	];
</script>

<div class="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
	<Card title="Mounts">
		<div class="flex flex-col gap-5">
			{#each disk.mounts as mount (mount.path)}
				<Meter label={mount.path} value={mount.used} limit={mount.total} format={bytes} />
			{:else}
				<p class={stylex.attrs(type.soft).class}>No mounts were read.</p>
			{/each}
		</div>
	</Card>
	<Card title="By app">
		<BarChart
			categories={used.map((app) => (app.partial ? `${app.app}, at least` : app.app))}
			series={[
				{
					key: 'bytes',
					label: 'Bytes',
					color: 'var(--color-series-5)',
					values: used.map((app) => app.bytes),
				},
			]}
			orientation="horizontal"
			format={bytes}
			label="Disk used by each app"
		/>
	</Card>
</div>

<Card title="Snapshots" flush>
	<DataTable
		rows={disk.snapshots}
		{columns}
		key={(one) => one.name}
		label="Snapshots on this node"
		sort={{ key: 'created', direction: 'descending' }}
		empty="No snapshots are kept"
	/>
</Card>
