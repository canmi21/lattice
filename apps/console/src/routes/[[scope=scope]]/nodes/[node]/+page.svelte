<script lang="ts">
	import { untrack } from 'svelte';
	import Card from '#lib/card.svelte';
	import { live } from '#lib/live.svelte.js';
	import { Clock } from '#lib/nodes/clock.svelte.js';
	import { machineFor, nodeRow } from '#lib/nodes/machine.js';
	import NodeApps from '#lib/nodes/node-apps.svelte';
	import NodeDisk from '#lib/nodes/node-disk.svelte';
	import NodeEvents from '#lib/nodes/node-events.svelte';
	import NodeHeader from '#lib/nodes/node-header.svelte';
	import NodeOverview from '#lib/nodes/node-overview.svelte';
	import { hrefOf } from '#lib/nodes/view.js';
	import { Landed } from '#lib/ui/landed.svelte.js';
	import Segmented, { RANGES } from '#lib/ui/segmented.svelte';
	import Skeleton from '#lib/ui/skeleton.svelte';
	import Unread from '#lib/unread.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const held = live();
	// The server's time once, so the first paint agrees; the clock ticks on its own after.
	const clock = new Clock(untrack(() => data.now));

	// The host's own reading, kept across tabs and dropped for another node.
	const read = new Landed(
		() => data.machine,
		() => data.name,
	);
	const server = $derived(read.value?.ok ? read.value.data : undefined);
	const machine = $derived(machineFor(held.view.nodes[data.name], server));
	const row = $derived(nodeRow(data.name, held.view.nodes[data.name], server, clock.now));
	/** A table's header and eight 44 px rows, before the read says how many it holds. */
	const TABLE = 9 * 44;
	const ranges = $derived(
		RANGES.map((range) => ({ ...range, href: hrefOf({ ...data.view, range: range.key }) })),
	);
</script>

<NodeHeader {row} info={machine?.info} now={clock.now}>
	{#snippet actions()}
		{#if data.view.tab === 'overview'}
			<Segmented options={ranges} value={data.view.range} label="Time range" />
		{/if}
	{/snippet}
</NodeHeader>

{#if read.value && !read.value.ok}
	<Unread what="The machine" failure={read.value.failure} />
{/if}

<!-- The page open is the sidebar's; see spec/console/navigation.md. -->
<div>
	{#if data.view.tab === 'overview' && data.overview}
		<div class="flex flex-col gap-4">
			<NodeOverview
				{machine}
				waiting={machine === undefined && read.value === undefined}
				read={data.overview}
				span={data.span}
				reveal={data.view.range}
			/>
		</div>
	{:else if data.view.tab === 'apps' && data.apps}
		{#await data.apps}
			<Card title="Apps" flush><div class="px-5 pb-5"><Skeleton height={TABLE} /></div></Card>
		{:then apps}
			{#if apps.ok}
				<Card title="{apps.data.length} apps" flush>
					<NodeApps apps={apps.data} now={clock.now} />
				</Card>
			{:else}
				<Unread what="The apps" failure={apps.failure} />
			{/if}
		{/await}
	{:else if data.view.tab === 'events' && data.events}
		{#await data.events}
			<Card title="Events" flush><div class="px-5 pb-5"><Skeleton height={TABLE} /></div></Card>
		{:then events}
			{#if events.read.ok}
				<Card title="Events" flush>
					<NodeEvents
						events={events.read.data}
						newer={data.view.before === undefined
							? undefined
							: hrefOf({ ...data.view, before: undefined })}
						older={events.older === undefined
							? undefined
							: hrefOf({ ...data.view, before: events.older })}
					/>
				</Card>
			{:else}
				<Unread what="The events" failure={events.read.failure} />
			{/if}
		{/await}
	{:else if data.view.tab === 'disk' && data.disk}
		{#await data.disk}
			<div class="flex flex-col gap-4">
				<div class="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
					<Card title="Mounts"><Skeleton height={160} /></Card>
					<Card title="By app"><Skeleton height={160} chart /></Card>
				</div>
				<Card title="Snapshots" flush><div class="px-5 pb-5"><Skeleton height={TABLE} /></div></Card
				>
			</div>
		{:then disk}
			{#if disk.ok}
				<div class="flex flex-col gap-4"><NodeDisk disk={disk.data} /></div>
			{:else}
				<Unread what="The disk" failure={disk.failure} />
			{/if}
		{/await}
	{/if}
</div>
