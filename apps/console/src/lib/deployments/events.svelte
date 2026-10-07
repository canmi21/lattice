<script lang="ts">
	/**
	 * Events as host kept them, one row each, newest first: on a run's page every event of the run,
	 * on the Deployments page what no run started. Filtered and paged in the table.
	 */
	import * as stylex from '@stylexjs/stylex';
	import { duration } from '../chart/numbers.ts';
	import { moment } from '../chart/series.ts';
	import { shortImage } from '../format.ts';
	import type { FleetEvent } from '../server/fleet.ts';
	import { type } from '../style.ts';
	import DataTable from '../table/data-table.svelte';
	import type { Column } from '../table/table.ts';
	import Badge from '../ui/badge.svelte';
	import { timeZone } from '../ui/time-zone.ts';
	import { TONE, markOf, said } from './state.ts';

	let { events, label, empty }: { events: FleetEvent[]; label: string; empty: string } = $props();

	const zone = timeZone();
	const started = (event: FleetEvent) => Date.parse(event.started_at);
	const took = (event: FleetEvent) =>
		event.finished_at ? Date.parse(event.finished_at) - started(event) : Number.NaN;
	/** An outcome host added since is written as host wrote it. */
	const word = (event: FleetEvent) => {
		const mark = markOf(event.outcome);
		return mark === 'unknown' ? event.outcome : said(mark, event.stage);
	};

	const columns: Column<FleetEvent>[] = [
		{
			key: 'started',
			label: 'Started',
			value: started,
			text: (event) => moment(started(event) / 1000, zone),
		},
		{ key: 'node', label: 'Node', value: (event) => event.node },
		{ key: 'app', label: 'App', value: (event) => event.app },
		{ key: 'action', label: 'Action', value: (event) => event.action },
		{ key: 'source', label: 'Source', value: (event) => event.source.kind },
		{ key: 'outcome', label: 'Outcome', value: word, cell: outcomeCell },
		{
			key: 'duration',
			label: 'Duration',
			kind: 'number',
			value: took,
			text: (event) => duration(took(event) / 1000),
		},
		{ key: 'image', label: 'Image', value: (event) => shortImage(event.image ?? '') },
		{ key: 'detail', label: 'Detail', value: (event) => event.detail ?? '', cell: detailCell },
	];
	const styles = stylex.create({ detail: { maxWidth: '28rem' } });
</script>

{#snippet outcomeCell(event: FleetEvent)}
	<Badge tone={TONE[markOf(event.outcome)]}>{word(event)}</Badge>
{/snippet}

{#snippet detailCell(event: FleetEvent)}
	<span class="block truncate {stylex.attrs(styles.detail, type.soft).class}" title={event.detail}
		>{event.detail ?? ''}</span
	>
{/snippet}

<DataTable rows={events} {columns} key={(event) => `${event.node}/${event.id}`} {label} {empty} />
