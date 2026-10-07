<script lang="ts">
	import * as stylex from '@stylexjs/stylex';
	import StatTile from '#lib/chart/stat-tile.svelte';
	import { moment } from '#lib/chart/series.js';
	import AppName from '#lib/apps/app-name.svelte';
	import { type AppRow, rowsOf } from '#lib/apps/apps.js';
	import NodeChip from '#lib/apps/node-chip.svelte';
	import { shortImage } from '#lib/format.js';
	import { nodeLabel } from '#lib/map/places.js';
	import Empty from '#lib/scope/empty.svelte';
	import { scoped } from '#lib/scope/context.js';
	import { appLabel, displayOf, shows } from '#lib/scope/scope.js';
	import { type } from '#lib/style.js';
	import DataTable from '#lib/table/data-table.svelte';
	import type { Column } from '#lib/table/table.js';
	import Badge from '#lib/ui/badge.svelte';
	import PageHeader from '#lib/ui/page-header.svelte';
	import Skeleton from '#lib/ui/skeleton.svelte';
	import { timeZone } from '#lib/ui/time-zone.js';
	import Unread from '#lib/unread.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const zone = timeZone();
	const { app: toApp } = scoped();
	const count = (rows: AppRow[], pick: (row: AppRow) => number) =>
		rows.reduce((sum, row) => sum + pick(row), 0);
	const TILES = ['Apps', 'Running instances', 'Held or stopped', 'Drifting'];
	/** The search row, the header and eight 44 px rows; see src/lib/table/data-table.svelte. */
	const TABLE = 10 * 44;

	const columns: Column<AppRow>[] = [
		{
			key: 'name',
			label: 'App',
			value: (row) => displayOf(row.name),
			text: (row) => appLabel(row.name),
			cell: name,
		},
		{
			key: 'nodes',
			label: 'Nodes',
			kind: 'number',
			value: (row) => row.placements.length,
			text: (row) => row.placements.map((one) => `${nodeLabel(one.node)} ${one.state}`).join(', '),
			cell: nodes,
		},
		{
			key: 'running',
			label: 'Running',
			kind: 'number',
			value: (row) => row.running,
			text: (row) => `${row.running}/${row.placements.length}`,
		},
		{
			key: 'image',
			label: 'Image',
			value: (row) => (row.drift ? `drift ${row.images.length}` : (row.images[0] ?? '')),
			text: (row) =>
				row.drift ? `Drift, ${row.images.length} images` : shortImage(row.images[0] ?? ''),
			cell: image,
		},
		{
			key: 'deployed',
			label: 'Last deployed',
			value: (row) => row.deployed,
			text: (row) => (row.deployed ? moment(Date.parse(row.deployed) / 1000, zone) : ''),
		},
	];
</script>

{#snippet name(row: AppRow)}<AppName app={row.name} />{/snippet}

{#snippet nodes(row: AppRow)}
	<span class="flex flex-wrap gap-1">
		{#each row.placements as one (one.node)}
			<NodeChip node={one.node} state={one.state} />
		{/each}
	</span>
{/snippet}

{#snippet image(row: AppRow)}
	{#if row.drift}
		<Badge tone="warn" title={row.images.map(shortImage).join(', ')}>
			Drift, {row.images.length} images
		</Badge>
	{:else}
		<span class={stylex.attrs(type.mono).class}>{shortImage(row.images[0] ?? '')}</span>
	{/if}
{/snippet}

<PageHeader title="Apps" />

{#await data.cluster}
	<div class="grid grid-cols-2 gap-4 lg:grid-cols-4">
		{#each TILES as label (label)}<StatTile {label} pending />{/each}
	</div>
	<Skeleton height={TABLE} />
{:then read}
	{#if !read.ok}
		<Unread what="The cluster" failure={read.failure} />
	{:else}
		{@const rows = rowsOf(data.order, read.data).filter((row) => shows(data.view, row.name))}
		{#if rows.length === 0}
			<Empty view={data.view} />
		{:else}
			<div class="grid grid-cols-2 gap-4 lg:grid-cols-4">
				<StatTile label="Apps" value={rows.length} />
				<StatTile label="Running instances" value={count(rows, (row) => row.running)} />
				<StatTile
					label="Held or stopped"
					value={count(rows, (row) => row.placements.length - row.running)}
				/>
				<StatTile label="Drifting" value={rows.filter((row) => row.drift).length} />
			</div>

			<DataTable
				{rows}
				{columns}
				key={(row) => row.name}
				href={(row) => toApp(row.name)}
				label="Apps across the fleet"
				sort={{ key: 'name', direction: 'ascending' }}
				empty="No node runs an app"
			/>
		{/if}
	{/if}
{/await}
