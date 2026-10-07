<script lang="ts">
	import * as stylex from '@stylexjs/stylex';
	import Card from '#lib/card.svelte';
	import { duration, percent } from '#lib/chart/numbers.js';
	import StackedBar from '#lib/chart/stacked-bar.svelte';
	import StatTile from '#lib/chart/stat-tile.svelte';
	import { daily, within } from '#lib/deployments/daily.js';
	import Events from '#lib/deployments/events.svelte';
	import { Fresh } from '#lib/deployments/fresh.svelte.js';
	import Queue from '#lib/deployments/queue.svelte';
	import { stirring } from '#lib/deployments/stir.js';
	import { live } from '#lib/live.svelte.js';
	import Empty from '#lib/scope/empty.svelte';
	import type { Node } from '#lib/server/nodes.js';
	import { surfaces, type } from '#lib/style.js';
	import { Landed } from '#lib/ui/landed.svelte.js';
	import Silent from '#lib/ui/silent.svelte';
	import PageHeader from '#lib/ui/page-header.svelte';
	import Skeleton from '#lib/ui/skeleton.svelte';
	import Tabs from '#lib/ui/tabs.svelte';
	import { timeZone } from '#lib/ui/time-zone.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const zone = timeZone();
	const held = live();
	// Kept while the next poll's read is on its way, so the page does not blank every few seconds.
	const read = new Landed(() => data.runs);
	const runs = $derived(read.value?.runs ?? []);
	const newest = $derived(runs.length ? Math.max(...runs.map((run) => run.run)) : undefined);
	const fresh = new Fresh(
		() => data.now,
		() => runs.some((run) => run.running > 0) || stirring(held.view.nodes, newest),
	);

	let tab: 'runs' | 'apart' = $state('runs');

	const unknown = $derived(new Set(Object.keys(read.value?.failures ?? {}) as Node[]));
	const missing = $derived(Object.entries(read.value?.failures ?? {}));
	const bars = $derived(daily(runs, fresh.now, data.days, zone));
	const day = $derived(within(runs, fresh.now, 24));
	const going = $derived(runs.filter((run) => run.running > 0).length);
	/** Landed with nothing of the view's, which no silent node could have held back. */
	const empty = $derived(
		read.value !== undefined &&
			runs.length === 0 &&
			read.value.apart.length === 0 &&
			missing.length === 0,
	);
	const seconds = (ms: number | null) => (ms === null ? '-' : duration(ms / 1000));
	/** Runs per day, by the stacked bar's default height; see src/lib/chart/stacked-bar.svelte. */
	const BARS = 220;
	const TILES = $derived([
		'Runs, last 24 h',
		`Success rate, ${data.days} days`,
		'Median duration',
		'p95 duration',
		'Deploying now',
	]);
	/** The table's header and eight 44 px rows, before the read says how many it holds. */
	const TABLE = 9 * 44;
</script>

<PageHeader title="Deployments" />

<Silent nodes={missing.map(([node, failure]) => ({ node, message: failure.message }))} />

{#if empty}
	<Empty view={data.view} />
{:else}
	<div class="grid grid-cols-2 gap-4 xl:grid-cols-5">
		{#if read.value}
			{@const { aggregates } = read.value}
			<StatTile label="Runs, last 24 h" value={day} />
			<StatTile
				label="Success rate, {data.days} days"
				value={aggregates.success_rate === null ? '-' : percent(aggregates.success_rate)}
			/>
			<StatTile label="Median duration" value={seconds(aggregates.median)} />
			<StatTile label="p95 duration" value={seconds(aggregates.p95)} />
			<StatTile label="Deploying now" value={going} />
		{:else}
			{#each TILES as label (label)}<StatTile {label} pending />{/each}
		{/if}
	</div>

	<Card title="Runs per day">
		{#if read.value}
			<StackedBar
				categories={bars.categories}
				series={bars.series}
				label="Runs per day over the last {data.days} days, by state"
			/>
		{:else}
			<Skeleton height={BARS} chart />
		{/if}
	</Card>

	<section class="flex min-w-0 flex-col">
		<Tabs
			bind:current={tab}
			label="What the nodes deployed"
			tabs={[
				{ key: 'runs', label: read.value ? `CI runs (${runs.length})` : 'CI runs' },
				{
					key: 'apart',
					label: read.value
						? `Uploads and panel (${read.value.apart.length})`
						: 'Uploads and panel',
				},
			]}
		/>
		<div class="overflow-hidden {stylex.attrs(surfaces.card).class}">
			{#if !read.value}
				<div class="p-5"><Skeleton height={TABLE} /></div>
			{:else if tab === 'runs'}
				<Queue {runs} nodes={data.nodes} {unknown} now={fresh.now} />
			{:else}
				<Events
					events={read.value.apart}
					label="Uploads and panel actions across every node, newest first"
					empty="No node holds an upload or a panel action."
				/>
			{/if}
		</div>
	</section>
{/if}
