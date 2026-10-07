<script lang="ts">
	/** An app's deploys merged across its nodes, each linking to its run where it has one. */
	import * as stylex from '@stylexjs/stylex';
	import { moment } from '../chart/series.ts';
	import { shortImage } from '../format.ts';
	import { nodeLabel } from '../map/places.ts';
	import NodeName from '../nodes/node-name.svelte';
	import { scoped } from '../scope/context.ts';
	import { type } from '../style.ts';
	import DataTable from '../table/data-table.svelte';
	import type { Column } from '../table/table.ts';
	import Badge from '../ui/badge.svelte';
	import { timeZone } from '../ui/time-zone.ts';
	import { handCommand } from '../deployments/state.ts';
	import type { NodeEvent } from './apps.ts';

	let { events }: { events: NodeEvent[] } = $props();

	const { to } = scoped();

	const zone = timeZone();
	const TONES = { running: 'busy', succeeded: 'good', failed: 'bad', skipped: 'quiet' } as const;
	const tone = (outcome: string) => TONES[outcome as keyof typeof TONES] ?? 'quiet';
	/** A skip left for the operator says so; see ../deployments/state.ts. */
	const word = (event: NodeEvent) =>
		handCommand(event.outcome, event.detail) ? 'by hand' : event.outcome;

	const runOf = (event: NodeEvent) =>
		event.source.run === undefined ? undefined : to(`/deployments/${event.source.run}`);

	const columns: Column<NodeEvent>[] = [
		{
			key: 'started',
			label: 'Started',
			value: (event) => event.started_at,
			text: (event) => moment(Date.parse(event.started_at) / 1000, zone),
		},
		{ key: 'node', label: 'Node', value: (event) => nodeLabel(event.node), cell: node },
		{ key: 'action', label: 'Action', value: (event) => event.action },
		{ key: 'stage', label: 'Stage', value: (event) => event.stage ?? '', cell: stage },
		{ key: 'outcome', label: 'Outcome', value: word, cell: outcome },
		{
			key: 'image',
			label: 'Image',
			value: (event) => event.image ?? '',
			text: (event) => (event.image ? shortImage(event.image) : ''),
			cell: image,
		},
		{ key: 'detail', label: 'Detail', value: (event) => event.detail ?? '', cell: detail },
	];
</script>

{#snippet outcome(event: NodeEvent)}
	<Badge tone={tone(event.outcome)}>{word(event)}</Badge>
{/snippet}

{#snippet detail(event: NodeEvent)}
	{#if handCommand(event.outcome, event.detail)}{@render mono(
			event.detail ?? '',
		)}{:else}{event.detail ?? ''}{/if}
{/snippet}

{#snippet stage(event: NodeEvent)}
	{#if event.stage}<Badge tone="quiet">{event.stage}</Badge>{/if}
{/snippet}

{#snippet mono(text: string)}
	<span class={stylex.attrs(type.mono).class}>{text}</span>
{/snippet}

{#snippet node(event: NodeEvent)}<NodeName code={event.node} short />{/snippet}

{#snippet image(event: NodeEvent)}
	{@render mono(event.image ? shortImage(event.image) : '')}
{/snippet}

<DataTable
	rows={events}
	{columns}
	key={(event) => `${event.node}-${event.id}`}
	href={(event) => runOf(event)}
	label="Deploy history across nodes"
	sort={{ key: 'started', direction: 'descending' }}
	size={10}
	empty="No deploys recorded"
></DataTable>
