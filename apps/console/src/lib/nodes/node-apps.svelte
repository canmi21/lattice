<script lang="ts">
	/** The apps one node runs, as its host lists them, each leading to the app's page. */
	import { ago, bytes, shortImage } from '../format.ts';
	import type { AppDetail } from '../host.ts';
	import { scoped } from '../scope/context.ts';
	import type { Tone } from '../style.ts';
	import DataTable from '../table/data-table.svelte';
	import type { Column } from '../table/table.ts';
	import Badge from '../ui/badge.svelte';

	let { apps, now }: { apps: AppDetail[]; now: number } = $props();

	const { app: toApp } = scoped();

	const name = (app: AppDetail) => app.manifest.name;
	const STATES: Record<string, { word: string; tone: Tone }> = {
		running: { word: 'Running', tone: 'good' },
		held: { word: 'Held', tone: 'warn' },
		stopped: { word: 'Stopped', tone: 'bad' },
		driver: { word: 'Driver', tone: 'quiet' },
	};
	/** A driver has no container to run, and a held app is kept from starting on purpose. */
	const stateOf = (app: AppDetail) =>
		app.driver ? 'driver' : app.held ? 'held' : app.running ? 'running' : 'stopped';
	const kind = (app: AppDetail) => (app.platform ? 'Platform' : app.driver ? 'Driver' : 'App');

	const columns: Column<AppDetail>[] = [
		{ key: 'name', label: 'App', value: name },
		{
			key: 'state',
			label: 'State',
			value: (app) => STATES[stateOf(app)]?.word ?? '',
			cell: state,
		},
		{ key: 'kind', label: 'Kind', value: kind },
		{ key: 'image', label: 'Image', value: (app) => shortImage(app.image) },
		{
			key: 'deployed',
			label: 'Deployed',
			kind: 'number',
			value: (app) => Date.parse(app.deployed_at),
			text: (app) => ago(app.deployed_at, now),
		},
		{
			key: 'previous',
			label: 'Previous image',
			value: (app) => (app.previous ? shortImage(app.previous.image) : ''),
		},
		{
			key: 'memory',
			label: 'Memory limit',
			kind: 'number',
			value: (app) => app.manifest.container?.memory_mb ?? Number.NaN,
			text: (app) => {
				const limit = app.manifest.container?.memory_mb;
				return limit ? bytes(limit * 2 ** 20) : '';
			},
		},
	];
</script>

{#snippet state(app: AppDetail)}
	{@const said = STATES[stateOf(app)]}
	{#if said}<Badge tone={said.tone}>{said.word}</Badge>{/if}
{/snippet}

<DataTable
	rows={apps}
	{columns}
	key={name}
	href={(app) => toApp(name(app))}
	label="Apps on this node"
	sort={{ key: 'name', direction: 'ascending' }}
	empty="This node runs no apps"
/>
