<script lang="ts">
	/**
	 * One page of a node's events, newest first, and the links to the pages either side: host
	 * pages them by event id, so the next page starts below the lowest id on this one.
	 */
	import * as stylex from '@stylexjs/stylex';
	import { duration } from '../chart/numbers.ts';
	import AppName from '../apps/app-name.svelte';
	import { moment } from '../chart/series.ts';
	import { handCommand } from '../deployments/state.ts';
	import { appLabel, displayOf } from '../scope/scope.ts';
	import { type } from '../style.ts';
	import DataTable from '../table/data-table.svelte';
	import type { Column } from '../table/table.ts';
	import Badge from '../ui/badge.svelte';
	import { timeZone } from '../ui/time-zone.ts';
	import type { Event } from '../wire.ts';
	import { capital, outcome } from './words.ts';

	let {
		events,
		newer,
		older,
	}: {
		events: Event[];
		/** The first page, where this is not it. */
		newer?: string;
		/** The page after this one, where there is one. */
		older?: string;
	} = $props();

	const zone = timeZone();
	const seconds = (stamp: string) => Date.parse(stamp) / 1000;
	const took = (event: Event) =>
		event.finished_at ? seconds(event.finished_at) - seconds(event.started_at) : Number.NaN;
	const source = (event: Event) => {
		const { kind, run, commit } = event.source;
		if (kind === 'run' && run !== undefined) {
			return `Run ${run}${commit ? ` at ${commit.slice(0, 7)}` : ''}`;
		}
		return capital(kind);
	};

	const columns: Column<Event>[] = [
		{
			key: 'started',
			label: 'Started',
			kind: 'number',
			value: (event) => Date.parse(event.started_at),
			text: (event) => moment(seconds(event.started_at), zone),
		},
		{
			key: 'app',
			label: 'App',
			value: (event) => displayOf(event.app),
			text: (event) => appLabel(event.app),
			cell: appCell,
		},
		{ key: 'action', label: 'Action', value: (event) => capital(event.action) },
		{ key: 'source', label: 'Source', value: source },
		{
			key: 'stage',
			label: 'Stage',
			value: (event) => (event.stage ? capital(event.stage) : ''),
			cell: stage,
		},
		{
			key: 'outcome',
			label: 'Outcome',
			value: (event) => outcome(event.outcome, event.detail).word,
			cell: ended,
		},
		{
			key: 'took',
			label: 'Took',
			kind: 'number',
			value: took,
			text: (event) => duration(took(event)),
		},
		{ key: 'detail', label: 'Detail', value: (event) => event.detail ?? '', cell: detail },
	];
</script>

{#snippet appCell(event: Event)}<AppName app={event.app} />{/snippet}

{#snippet detail(event: Event)}
	{#if handCommand(event.outcome, event.detail)}<span class={stylex.attrs(type.mono).class}
			>{event.detail}</span
		>{:else}{event.detail ?? ''}{/if}
{/snippet}

{#snippet stage(event: Event)}
	{#if event.stage}<Badge tone="quiet">{capital(event.stage)}</Badge>{/if}
{/snippet}

{#snippet ended(event: Event)}
	{@const said = outcome(event.outcome, event.detail)}
	<Badge tone={said.tone}>{said.word}</Badge>
{/snippet}

<DataTable
	rows={events}
	{columns}
	key={(event) => String(event.id)}
	label="Events on this node"
	size={50}
	empty="No events on this page"
/>
{#if newer || older}
	<nav class="flex justify-end gap-4 px-5 py-3 {stylex.attrs(type.soft).class}" aria-label="Pages">
		{#if newer}<a href={newer} class="underline">Newest</a>{/if}
		{#if older}<a href={older} class="underline">Older</a>{/if}
	</nav>
{/if}
