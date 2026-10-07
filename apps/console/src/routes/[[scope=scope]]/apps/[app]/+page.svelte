<script lang="ts">
	import * as stylex from '@stylexjs/stylex';
	import { page } from '$app/state';
	import { drifts, latest, lines, merge, placements, total } from '#lib/apps/apps.js';
	import HistoryTable from '#lib/apps/history-table.svelte';
	import StateBadge from '#lib/apps/state-badge.svelte';
	import UsageCharts from '#lib/apps/usage-charts.svelte';
	import Card from '#lib/card.svelte';
	import StatTile from '#lib/chart/stat-tile.svelte';
	import { moment } from '#lib/chart/series.js';
	import { bytes, shortImage } from '#lib/format.js';
	import { scoped } from '#lib/scope/context.js';
	import { surfaces, type } from '#lib/style.js';
	import Badge from '#lib/ui/badge.svelte';
	import { Landed } from '#lib/ui/landed.svelte.js';
	import PageHeader from '#lib/ui/page-header.svelte';
	import Skeleton from '#lib/ui/skeleton.svelte';
	import { timeZone } from '#lib/ui/time-zone.js';
	import Unread from '#lib/unread.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const zone = timeZone();
	const { node: toNode } = scoped();

	// The cluster kept while another span is read; both dropped for another app.
	const cluster = new Landed(
		() => data.cluster,
		() => data.app,
	);
	const reads = new Landed(
		() => data.reads,
		() => `${data.app} ${data.range}`,
	);
	const read = $derived(cluster.value);
	const held = $derived(read?.ok ? placements(data.order, read.data, data.app) : []);
	const running = $derived(held.filter((one) => one.state === 'running').length);
	const images = $derived([...new Set(held.map((one) => one.app.image))]);
	const drift = $derived(drifts(images));
	const series = $derived(reads.value?.series ?? {});
	const history = $derived(reads.value && merge(data.order, reads.value.events));
	/** Nodes asked that did not answer one of the reads: unknown, not absent. */
	const silent = $derived(
		Object.entries(series)
			.filter(([, one]) => !one?.ok)
			.map(([node]) => node),
	);

	const sum = (name: string) => total(lines(data.order, series, `${data.app}.${name}`).lines);
	const nowOf = (name: string) =>
		Object.values(latest(lines(data.order, series, `${data.app}.${name}`).lines)).reduce(
			(a, b) => a + b,
			0,
		);
	const trend = (name: string) =>
		sum(name)
			.slice(-12)
			.map((point) => point.value);
	const known = $derived(Object.values(series).some((one) => one?.ok));
	const TILES = ['Processor now', 'Memory now', 'Network now', 'Disk now'];
	/** A placement's card: its name, its image and when it was deployed. */
	const PLACED = 92;
	/** The history's header and eight 44 px rows, before the read says how many it holds. */
	const TABLE = 9 * 44;
</script>

<PageHeader
	title={data.app}
	range={data.range}
	query={page.url.search}
	description={images.map(shortImage).join(', ')}
>
	{#snippet meta()}
		{#if read?.ok && held.length}
			<Badge tone={running === held.length ? 'good' : 'warn'}>
				{running} of {held.length} nodes running
			</Badge>
			{#if drift}<Badge tone="warn">Image drift, {images.length} images</Badge>{/if}
		{/if}
	{/snippet}
</PageHeader>

{#if read && !read.ok}
	<Unread what="The cluster" failure={read.failure} />
{/if}

{#if read?.ok && held.length === 0}
	<p class="p-4 {stylex.attrs(surfaces.empty, type.soft).class}">No node runs {data.app}.</p>
{:else}
	{#if !reads.value}
		<div class="grid grid-cols-2 gap-4 lg:grid-cols-4">
			{#each TILES as label (label)}<StatTile {label} pending="trend" />{/each}
		</div>
	{:else if known}
		<div class="grid grid-cols-2 gap-4 lg:grid-cols-4">
			<StatTile
				label="Processor now"
				value={nowOf('cpu').toFixed(1)}
				unit="%"
				trend={trend('cpu')}
			/>
			<StatTile label="Memory now" value={bytes(nowOf('memory'))} trend={trend('memory')} />
			<StatTile
				label="Network now"
				value={`${bytes(nowOf('network.received'))}/s`}
				unit="in"
				trend={trend('network.received')}
			/>
			<StatTile
				label="Disk now"
				value={`${bytes(nowOf('disk.read'))}/s`}
				unit="read"
				trend={trend('disk.read')}
			/>
		</div>
	{/if}

	{#if !read}
		<Skeleton height={PLACED} />
	{:else if held.length}
		<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
			{#each held as one (one.node)}
				<div class="flex flex-col gap-2 px-5 py-4 {stylex.attrs(surfaces.card).class}">
					<div class="flex items-center justify-between gap-2">
						<a href={toNode(one.node)} class={stylex.attrs(type.name).class}>{one.node}</a>
						<StateBadge state={one.state} />
					</div>
					<span class={stylex.attrs(type.mono).class} title={one.app.image}
						>{shortImage(one.app.image)}</span
					>
					<span class={stylex.attrs(type.soft).class}>
						Deployed {moment(Date.parse(one.app.deployed_at) / 1000, zone)}
					</span>
					{#if silent.includes(one.node)}<Badge tone="quiet">Metrics unknown</Badge>{/if}
				</div>
			{/each}
		</div>
	{:else if silent.length}
		<p class={stylex.attrs(type.soft).class}>State unknown on {silent.join(', ')}.</p>
	{/if}

	<UsageCharts
		app={data.app}
		order={data.order}
		reads={reads.value?.series}
		since={data.span.since}
		until={data.span.until}
		reveal={data.range}
	/>

	<Card title="Deploy history" flush>
		{#if history}
			<HistoryTable events={history.events} />
		{:else}
			<div class="px-5 pb-5"><Skeleton height={TABLE} /></div>
		{/if}
	</Card>
	{#if history?.unknown.length}
		<p class={stylex.attrs(type.soft).class}>History unknown on {history.unknown.join(', ')}.</p>
	{/if}
{/if}
