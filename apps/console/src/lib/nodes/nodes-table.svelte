<script lang="ts">
	/** Every node as a row: declared, heard and measured, each row leading to the node's page. */
	import * as stylex from '@stylexjs/stylex';
	import Gauge from '../chart/gauge.svelte';
	import { duration, percent } from '../chart/numbers.ts';
	import Sparkline from '../chart/sparkline.svelte';
	import { ago, bytes } from '../format.ts';
	import { nodeLabel, ROLES } from '../map/places.ts';
	import { scoped } from '../scope/context.ts';
	import { tone, type } from '../style.ts';
	import DataTable from '../table/data-table.svelte';
	import type { Column } from '../table/table.ts';
	import Badge from '../ui/badge.svelte';
	import { share, type NodeRow } from './machine.ts';
	import NodeName from './node-name.svelte';
	import { LIVENESS } from './words.ts';

	let {
		rows,
		trends,
		now,
	}: {
		rows: NodeRow[];
		/** CPU over the last hour by node, a value a minute. */
		trends: Partial<Record<string, number[]>>;
		now: number;
	} = $props();

	const { node: toNode } = scoped();

	type Amount = { used: number; total?: number } | undefined;
	const amount = (of: Amount) =>
		of === undefined
			? ''
			: of.total
				? `${bytes(of.used)} of ${bytes(of.total)} · ${percent(of.used / of.total)}`
				: bytes(of.used);
	const loaded = (row: NodeRow) =>
		row.load === undefined
			? ''
			: `Load ${row.load.toFixed(2)}${row.cores ? ` on ${row.cores} cores` : ''}`;
	const heard = (row: NodeRow) => (row.heardAt ? Date.parse(row.heardAt) : Number.NaN);
	const order = { live: 0, late: 1, gone: 2 };

	const columns: Column<NodeRow>[] = [
		{
			key: 'node',
			label: 'Node',
			value: (row) => `${row.name} ${row.code}`,
			cell: name,
		},
		{ key: 'place', label: 'Place', value: (row) => row.place },
		{ key: 'role', label: 'Role', value: (row) => ROLES[row.role] },
		{
			key: 'state',
			label: 'Liveness',
			value: (row) => order[row.state],
			text: (row) => LIVENESS[row.state].word,
			cell: state,
		},
		{
			key: 'cpu',
			label: 'CPU',
			kind: 'number',
			value: (row) => row.cpu ?? Number.NaN,
			text: (row) => (row.cpu === undefined ? '' : percent(row.cpu / 100)),
			cell: cpu,
		},
		{
			key: 'trend',
			label: 'Last hour',
			value: () => '',
			sortable: false,
			filterable: false,
			cell: trend,
		},
		{
			key: 'memory',
			label: 'Memory',
			kind: 'number',
			value: (row) => share(row.memory),
			text: (row) => amount(row.memory),
			cell: memory,
		},
		{
			key: 'storage',
			label: 'Storage',
			kind: 'number',
			value: (row) => share(row.storage),
			text: (row) => amount(row.storage),
			cell: storage,
		},
		{
			key: 'load',
			label: 'Load',
			kind: 'number',
			value: (row) => row.load ?? Number.NaN,
			text: loaded,
			cell: load,
		},
		{
			key: 'apps',
			label: 'Apps',
			kind: 'number',
			value: (row) => row.apps?.running ?? Number.NaN,
			text: (row) => (row.apps ? `${row.apps.running} of ${row.apps.total}` : ''),
		},
		{
			key: 'uptime',
			label: 'Up',
			kind: 'number',
			value: (row) => row.uptime ?? Number.NaN,
			text: (row) => (row.uptime === undefined ? '' : duration(row.uptime)),
		},
		{
			key: 'heard',
			label: 'Last heard',
			kind: 'number',
			value: heard,
			text: (row) => (row.heardAt ? ago(row.heardAt, now) : 'Never'),
		},
		{
			key: 'architecture',
			label: 'Arch',
			value: (row) => row.architecture ?? '',
			text: (row) => row.architecture ?? '–',
		},
		{ key: 'system', label: 'System', value: (row) => row.facts.system },
		{ key: 'domain', label: 'Domain', value: (row) => row.facts.domain },
	];
</script>

{#snippet name(row: NodeRow)}<NodeName code={row.code} short />{/snippet}

{#snippet used(of: Amount, what: string)}
	{#if of}
		<Gauge
			share={of.total ? of.used / of.total : undefined}
			label="{what}: {amount(of)}"
			figure={of.total ? percent(of.used / of.total) : bytes(of.used)}
		/>
	{/if}
{/snippet}

{#snippet memory(row: NodeRow)}{@render used(row.memory, 'Memory')}{/snippet}

{#snippet storage(row: NodeRow)}{@render used(row.storage, 'Storage')}{/snippet}

{#snippet cpu(row: NodeRow)}
	{#if row.cpu !== undefined}
		<Gauge
			share={row.cpu / 100}
			label="CPU {percent(row.cpu / 100)} busy"
			figure={percent(row.cpu / 100)}
		/>
	{/if}
{/snippet}

{#snippet load(row: NodeRow)}
	{#if row.load !== undefined}
		<Gauge
			shape="bar"
			size={32}
			share={row.cores ? row.load / row.cores : undefined}
			label={loaded(row)}
			figure={row.load.toFixed(2)}
		/>
	{/if}
{/snippet}

{#snippet state(row: NodeRow)}
	{@const said = LIVENESS[row.state]}
	<span class="inline-flex items-center gap-2 whitespace-nowrap">
		<Badge tone={said.tone}>{said.word}</Badge>
		{#if row.heardAt && row.state !== 'live'}
			<span class={stylex.attrs(type.soft).class}>{ago(row.heardAt, now)}</span>
		{/if}
	</span>
{/snippet}

{#snippet trend(row: NodeRow)}
	{@const values = trends[row.code] ?? []}
	{#if values.length > 1}
		<div class="w-24">
			<Sparkline {values} height={24} label="{nodeLabel(row.code)}, CPU over the hour" />
		</div>
	{:else}
		<span class={stylex.attrs(tone.quiet).class}>No series</span>
	{/if}
{/snippet}

<DataTable
	{rows}
	{columns}
	key={(row) => row.code}
	href={(row) => toNode(row.code)}
	label="Every node"
	size={10}
/>
