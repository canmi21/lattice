<script lang="ts">
	/**
	 * Every run the nodes hold, newest first, each row leading to the run: its commit, when it
	 * started, how long it took or has taken so far, its state, its apps, where each node is with
	 * it, and its placements by outcome. Sorted, filtered and paged by the table.
	 */
	import * as stylex from '@stylexjs/stylex';
	import { duration } from '../chart/numbers.ts';
	import { moment } from '../chart/series.ts';
	import { scoped } from '../scope/context.ts';
	import type { Node } from '../server/nodes.ts';
	import type { Run } from '../server/runs.ts';
	import { type } from '../style.ts';
	import DataTable from '../table/data-table.svelte';
	import type { Column } from '../table/table.ts';
	import Badge from '../ui/badge.svelte';
	import { timeZone } from '../ui/time-zone.ts';
	import Progress from './progress.svelte';
	import { TONE, nodeMark, runState, said } from './state.ts';

	let {
		runs,
		nodes,
		unknown,
		now,
	}: { runs: Run[]; nodes: Node[]; unknown: ReadonlySet<Node>; now: number } = $props();

	const { to } = scoped();

	const zone = timeZone();
	const started = (run: Run) => Date.parse(run.first_start);
	/** Milliseconds: the run's own while it is done, so far while anything runs. */
	const took = (run: Run) => run.duration ?? Math.max(0, now - started(run));
	const marks = (run: Run) => nodes.map((node) => nodeMark(run, node, unknown));
	const placed = (run: Run) =>
		marks(run)
			.filter((one) => one.mark !== 'absent')
			.map((one) => `${one.node} ${said(one.mark, one.stage)}`)
			.join(', ');

	const columns: Column<Run>[] = [
		{
			key: 'run',
			label: 'Run',
			kind: 'number',
			value: (run) => run.run,
			text: (run) => `#${run.run}`,
		},
		{
			key: 'commit',
			label: 'Commit',
			value: (run) => run.commit?.slice(0, 7) ?? '',
			cell: commitCell,
		},
		{
			key: 'started',
			label: 'Started',
			value: started,
			text: (run) => moment(started(run) / 1000, zone),
		},
		{
			key: 'duration',
			label: 'Duration',
			kind: 'number',
			value: took,
			text: (run) => duration(took(run) / 1000) + (run.running ? ' so far' : ''),
		},
		{
			key: 'state',
			label: 'State',
			value: (run) => said(runState(run)),
			cell: stateCell,
		},
		{ key: 'apps', label: 'Apps', value: (run) => run.apps.join(', ') },
		{ key: 'nodes', label: 'Nodes', value: placed, sortable: false, cell: nodesCell },
		{ key: 'succeeded', label: 'Succeeded', kind: 'number', value: (run) => run.succeeded },
		{ key: 'failed', label: 'Failed', kind: 'number', value: (run) => run.failed },
		{ key: 'skipped', label: 'Skipped', kind: 'number', value: (run) => run.skipped },
	];
</script>

{#snippet commitCell(run: Run)}
	<span class={stylex.attrs(type.mono).class}>{run.commit?.slice(0, 7) ?? ''}</span>
{/snippet}

{#snippet stateCell(run: Run)}
	{@const state = runState(run)}
	<Badge tone={TONE[state]}>{said(state)}</Badge>
{/snippet}

{#snippet nodesCell(run: Run)}
	<Progress marks={marks(run)} />
{/snippet}

<DataTable
	rows={runs}
	{columns}
	key={(run) => String(run.run)}
	href={(run) => to(`/deployments/${run.run}`)}
	label="Runs the nodes hold, newest first"
	empty="No node holds an event from a CI run."
/>
