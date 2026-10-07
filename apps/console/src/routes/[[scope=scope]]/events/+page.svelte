<script lang="ts">
	import * as stylex from '@stylexjs/stylex';
	import Card from '#lib/card.svelte';
	import StackedBar from '#lib/chart/stacked-bar.svelte';
	import Heatmap from '#lib/chart/heatmap.svelte';
	import { moment } from '#lib/chart/series.js';
	import { OUTCOMES } from '#lib/events/counts.js';
	import EventsTable from '#lib/events/events-table.svelte';
	import Filters from '#lib/events/filters.svelte';
	import { choices, search } from '#lib/events/query.js';
	import { scoped } from '#lib/scope/context.js';
	import Empty from '#lib/scope/empty.svelte';
	import { type } from '#lib/style.js';
	import { Landed } from '#lib/ui/landed.svelte.js';
	import Silent from '#lib/ui/silent.svelte';
	import PageHeader from '#lib/ui/page-header.svelte';
	import Skeleton from '#lib/ui/skeleton.svelte';
	import { timeZone } from '#lib/ui/time-zone.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const zone = timeZone();
	const { to } = scoped();
	// The page stands as it streams; it gives way once a read lands holding none of the view's.
	const landed = new Landed(() => data.read);
	const nothing = $derived(
		landed.value !== undefined &&
			landed.value.charts.loaded === 0 &&
			Object.keys(landed.value.failures).length === 0,
	);
	const COLORS = {
		succeeded: 'var(--color-good)',
		failed: 'var(--color-danger)',
		skipped: 'var(--color-text-muted)',
		running: 'var(--color-busy)',
	};
	const dayLabel = new Intl.DateTimeFormat('en-US', {
		timeZone: zone,
		month: 'short',
		day: 'numeric',
	});

	type Read = Awaited<PageProps['data']['read']>;
	const bars = (charts: Read['charts']) =>
		OUTCOMES.map((outcome, row) => ({
			key: outcome,
			label: outcome[0]?.toUpperCase() + outcome.slice(1),
			color: COLORS[outcome],
			values: charts.days.values[row] ?? [],
		}));
	const paged = $derived(Object.keys(data.query.before).length > 0);
	const when = (event: Read['events'][number] | undefined) =>
		moment(Date.parse(event?.started_at ?? '') / 1000, zone);
	const rangeOf = (events: Read['events']) =>
		events.length ? `${when(events.at(-1))} back to ${when(events[0])}` : '';
	/** What the charts count, and the nodes whose full page may leave their older hours short. */
	const counted = ({ covered, loaded, full }: Read['charts']) =>
		`The charts count ${covered} of the ${loaded} newest events loaded, matching the filters` +
		(full.length
			? `; ${full.join(', ')} serve at most 500 events each, so their older hours may be ` +
				'undercounted.'
			: '.');
	/** What the filters offer before the events land: what the query already chose. */
	const chosen = $derived({
		app: choices([], 'app', data.query.app),
		action: choices([], 'action', data.query.action),
		outcome: choices([], 'outcome', data.query.outcome),
		stage: choices([], 'stage', data.query.stage),
	});
	/** A row of 24 px per node, an axis and a scale; see src/lib/chart/heatmap.svelte. */
	const HEAT = $derived(data.nodes.length * 24 + 50);
	/** The log's header and a page of 44 px rows, before the read says how many it holds. */
	const LOG = 11 * 44;
</script>

<PageHeader title="Events" />

{#await data.read then read}
	<Silent
		nodes={Object.entries(read.failures).map(([node, failure]) => ({
			node,
			message: failure.message,
		}))}
	/>
{/await}

{#if nothing}
	<Empty view={data.view} />
{:else}
	<div class="mb-4">
		{#await data.read}
			<Filters query={data.query} nodes={data.nodes} options={chosen} />
		{:then read}
			<Filters query={data.query} nodes={data.nodes} options={read.options} />
		{/await}
	</div>

	<div class="mb-4 grid gap-4 xl:grid-cols-2">
		<Card title="Events per hour">
			{#await data.read}
				<Skeleton height={HEAT} chart />
			{:then { charts }}
				<Heatmap
					rows={data.nodes.map((node) => ({ key: node, label: node }))}
					times={charts.hours.times}
					values={charts.hours.values}
					steps={5}
					low={0}
					label="Events per hour per node over the last 24 hours"
				/>
			{/await}
		</Card>
		<Card title="Outcomes per day">
			{#await data.read}
				<Skeleton height={220} chart />
			{:then { charts }}
				<StackedBar
					categories={charts.days.times.map((at) => dayLabel.format(new Date(at * 1000)))}
					series={bars(charts)}
					label="Event outcomes per day over the last 7 days"
				/>
			{/await}
		</Card>
	</div>
	<p class="mb-4 {stylex.attrs(type.soft).class}">
		{#await data.read}
			The charts count the newest events loaded, matching the filters.
		{:then { charts }}
			{counted(charts)}
		{/await}
	</p>

	<Card title="Log" flush>
		{#await data.read}
			<div class="px-5 pb-5"><Skeleton height={LOG} /></div>
		{:then read}
			{@const range = rangeOf(read.events)}
			<EventsTable events={read.events} />
			<footer
				class="flex flex-wrap items-center justify-between gap-3 px-5 py-2.5 {stylex.attrs(
					type.soft,
				).class}"
			>
				<span>{read.events.length} events{range ? `, ${range}` : ''}</span>
				<span class="flex items-center gap-4">
					{#if paged}<a href={to(`/events${search(data.query, {})}`)}>Newest</a>{/if}
					{#if read.more}<a href={to(`/events${search(data.query, read.next)}`)} rel="next">Older</a
						>{/if}
				</span>
			</footer>
		{/await}
	</Card>
{/if}
