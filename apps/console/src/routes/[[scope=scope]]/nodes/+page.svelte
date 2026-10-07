<script lang="ts">
	import { untrack } from 'svelte';
	import Card from '#lib/card.svelte';
	import { percent } from '#lib/chart/numbers.js';
	import StatTile from '#lib/chart/stat-tile.svelte';
	import { live } from '#lib/live.svelte.js';
	import { HEIGHT, WIDTH } from '#lib/map/land.generated.js';
	import WorldMap from '#lib/map/world-map.svelte';
	import { Clock } from '#lib/nodes/clock.svelte.js';
	import { CODES } from '#lib/nodes/facts.js';
	import Heard from '#lib/nodes/heard.svelte';
	import { nodeRow, type NodeRow } from '#lib/nodes/machine.js';
	import NodesTable from '#lib/nodes/nodes-table.svelte';
	import { LIVENESS } from '#lib/nodes/words.js';
	import Badge from '#lib/ui/badge.svelte';
	import { Landed } from '#lib/ui/landed.svelte.js';
	import PageHeader from '#lib/ui/page-header.svelte';
	import Skeleton from '#lib/ui/skeleton.svelte';
	import Unread from '#lib/unread.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const held = live();
	// The server's time once, so the first paint agrees; the clock ticks on its own after.
	const clock = new Clock(untrack(() => data.now));
	// The store draws every row; each host's own reading fills what the store does not hold.
	const machines = new Landed(() => data.machines);
	const trends = new Landed(() => data.trends);

	const rows: NodeRow[] = $derived(
		CODES.map((code) =>
			nodeRow(code, held.view.nodes[code], machines.value?.known[code], clock.now),
		),
	);
	const counts = $derived(
		(['live', 'late', 'gone'] as const).map((state) => ({
			state,
			count: rows.filter((row) => row.state === state).length,
		})),
	);
	const TILES = ['Heard', 'Apps running', 'CPU busy, heard nodes', 'Memory in use, heard nodes'];
	/** The table's header and a 44 px row per node; see src/lib/table/data-table.svelte. */
	const ROWS = (CODES.length + 1) * 44;
	const heard = $derived(rows.filter((row) => row.state !== 'gone'));
	const apps = $derived(
		rows.reduce(
			(sum, row) => ({
				running: sum.running + (row.apps?.running ?? 0),
				total: sum.total + (row.apps?.total ?? 0),
			}),
			{ running: 0, total: 0 },
		),
	);
	const busy = $derived.by(() => {
		const read = heard.flatMap((row) => (row.cpu === undefined ? [] : [row.cpu]));
		return read.length ? read.reduce((a, b) => a + b, 0) / read.length : undefined;
	});
	const memory = $derived.by(() => {
		const read = heard.flatMap((row) => (row.memory?.total ? [row.memory] : []));
		const total = read.reduce((sum, one) => sum + (one.total ?? 0), 0);
		return total ? read.reduce((sum, one) => sum + one.used, 0) / total : undefined;
	});
	const unread = $derived(Object.keys(machines.value?.failures ?? {}).length);
</script>

<PageHeader title="Nodes">
	{#snippet meta()}
		<Heard live={held} cluster={data.cluster}>
			{#each counts as { state, count } (state)}
				{#if count}<Badge tone={LIVENESS[state].tone}>{count} {LIVENESS[state].word}</Badge>{/if}
			{/each}
		</Heard>
	{/snippet}
</PageHeader>

{#await data.cluster then read}
	{#if !read.ok}<Unread what="The cluster" failure={read.failure} />{/if}
{/await}

<div class="grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,4fr)]">
	<Card title="Where they are">
		<Heard live={held} cluster={data.cluster}>
			<WorldMap states={held.view.nodes} now={clock.now} compact />
			{#snippet pending()}<Skeleton ratio="{WIDTH} / {HEIGHT}" />{/snippet}
		</Heard>
	</Card>
	<div class="grid grid-cols-2 gap-4">
		<Heard live={held} cluster={data.cluster}>
			<StatTile
				label="Heard"
				value="{heard.length} of {CODES.length}"
				share={heard.length / CODES.length}
			/>
			<StatTile
				label="Apps running"
				value="{apps.running} of {apps.total}"
				share={apps.total ? apps.running / apps.total : undefined}
			/>
			<StatTile
				label="CPU busy, heard nodes"
				value={busy === undefined ? '–' : percent(busy / 100)}
				share={busy === undefined ? undefined : busy / 100}
			/>
			<StatTile
				label="Memory in use, heard nodes"
				value={memory === undefined ? '–' : percent(memory)}
				share={memory}
			/>
			{#snippet pending()}
				{#each TILES as label (label)}<StatTile {label} pending />{/each}
			{/snippet}
		</Heard>
	</div>
</div>

<Card title="Every node" flush>
	{#snippet aside()}
		{#if unread}<Badge tone="warn">{unread} of {CODES.length} not answering</Badge>{/if}
	{/snippet}
	<Heard live={held} cluster={data.cluster}>
		<NodesTable {rows} trends={trends.value ?? {}} now={clock.now} />
		{#snippet pending()}
			<div class="px-5 pb-5"><Skeleton height={ROWS} /></div>
		{/snippet}
	</Heard>
</Card>
