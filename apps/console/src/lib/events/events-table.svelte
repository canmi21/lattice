<script lang="ts">
	/**
	 * The log in a DataTable: sorting within the page is the table's, filtering and paging are the
	 * URL's, so its own filter row is off and it holds the whole page at once.
	 */
	import * as stylex from '@stylexjs/stylex';
	import { moment } from '../chart/series.ts';
	import { scoped } from '../scope/context.ts';
	import type { FleetEvent } from '../server/fleet.ts';
	import { type, type Tone } from '../style.ts';
	import DataTable from '../table/data-table.svelte';
	import type { Column } from '../table/table.ts';
	import Badge from '../ui/badge.svelte';
	import { timeZone } from '../ui/time-zone.ts';
	import { took } from './duration.ts';

	let { events }: { events: FleetEvent[] } = $props();

	const { to } = scoped();

	const zone = timeZone();
	let open: string[] = $state([]);

	const TONES: Record<string, Tone> = {
		succeeded: 'good',
		failed: 'bad',
		running: 'busy',
		skipped: 'quiet',
	};
	const key = (event: FleetEvent) => `${event.node}/${event.id}`;
	const at = (event: FleetEvent) => Date.parse(event.started_at);
	const commit = (event: FleetEvent) => event.source.commit?.slice(0, 7) ?? '';
	const source = (event: FleetEvent) =>
		event.source.kind === 'run' && event.source.run !== undefined
			? `run #${event.source.run}`
			: event.source.kind;
	const toggle = (id: string) =>
		(open = open.includes(id) ? open.filter((one) => one !== id) : [...open, id]);

	const columns: Column<FleetEvent>[] = [
		{
			key: 'time',
			label: 'Time',
			value: at,
			text: (event) => moment(at(event) / 1000, zone),
		},
		{ key: 'node', label: 'Node', value: (event) => event.node },
		{ key: 'app', label: 'App', value: (event) => event.app },
		{ key: 'action', label: 'Action', value: (event) => event.action },
		{
			key: 'source',
			label: 'Source',
			value: source,
			text: (event) => `${source(event)} ${commit(event)}`.trim(),
			cell: sourceCell,
		},
		{ key: 'outcome', label: 'Outcome', value: (event) => event.outcome, cell: outcomeCell },
		{ key: 'stage', label: 'Stage', value: (event) => event.stage ?? '' },
		{
			key: 'duration',
			label: 'Duration',
			kind: 'number',
			value: (event) =>
				event.finished_at ? Date.parse(event.finished_at) - at(event) : Number.NaN,
			text: (event) => took(event.started_at, event.finished_at),
		},
		{ key: 'detail', label: 'Detail', value: (event) => event.detail ?? '', cell: detailCell },
	];
	const styles = stylex.create({
		link: { color: { default: 'var(--color-text-strong)', ':hover': 'var(--color-text)' } },
		more: { backgroundColor: 'transparent', borderWidth: 0, color: 'var(--color-text)' },
	});
</script>

{#snippet sourceCell(event: FleetEvent)}
	{#if event.source.kind === 'run' && event.source.run !== undefined}
		<a
			href={to(`/deployments/${event.source.run}`)}
			class={stylex.attrs(styles.link, type.mono).class}>run #{event.source.run}</a
		>
	{:else}
		{event.source.kind}
	{/if}
	{#if commit(event)}<span class={stylex.attrs(type.mono).class}>{commit(event)}</span>{/if}
{/snippet}

{#snippet outcomeCell(event: FleetEvent)}
	<Badge tone={TONES[event.outcome] ?? 'quiet'}>{event.outcome}</Badge>
{/snippet}

{#snippet detailCell(event: FleetEvent)}
	{#if event.detail}
		{@const wide = open.includes(key(event))}
		<button
			type="button"
			class="block w-full max-w-96 min-w-48 text-left {wide
				? 'break-words whitespace-pre-wrap'
				: 'truncate'} {stylex.attrs(styles.more, type.body).class}"
			title={event.detail}
			aria-expanded={wide}
			onclick={() => toggle(key(event))}>{event.detail}</button
		>
	{/if}
{/snippet}

<DataTable
	rows={events}
	{columns}
	{key}
	label="Events across every node, newest first"
	filterable={false}
	size={Math.max(1, events.length)}
	empty="No events match the filters."
/>
