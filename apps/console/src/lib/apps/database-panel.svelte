<script lang="ts">
	/**
	 * The database on each node it runs on, as its keeper says: which node is the primary, how far
	 * each standby is behind, and whether backing up goes on. Asked again every EVERY while the
	 * page is open. See ./health.ts.
	 */
	import * as stylex from '@stylexjs/stylex';
	import Card from '../card.svelte';
	import { bytes, localTime } from '../format.ts';
	import { nodeLabel } from '../map/places.ts';
	import NodeName from '../nodes/node-name.svelte';
	import type { Node } from '../server/nodes.ts';
	import { surfaces, type } from '../style.ts';
	import Badge from '../ui/badge.svelte';
	import Skeleton from '../ui/skeleton.svelte';
	import { timeZone } from '../ui/time-zone.ts';
	import {
		type Health,
		type HealthReads,
		type Keeper,
		age,
		healthOf,
		mismatched,
		primaries,
		said,
		stopped,
		toneOf,
	} from './health.ts';

	let {
		reads,
		where,
		known = true,
		href,
	}: {
		/** The load's first read, streamed. */
		reads: Promise<HealthReads>;
		/** The nodes the app runs on, in node order, or every node where that is not known. */
		where: readonly Node[];
		/** Whether `where` is known, or every node, those without the app to be passed over. */
		known?: boolean;
		/** Where the browser asks again. */
		href: string;
	} = $props();

	const EVERY = 15_000;
	/** A node's block before its first read lands: its name, its role and three lines. */
	const BLOCK = 132;

	const zone = timeZone();
	let current: HealthReads | undefined = $state.raw();

	$effect(() => {
		let gone = false;
		const asked = href;
		void reads.then((landed) => {
			if (!gone) current = landed;
		});
		const timer = setInterval(async () => {
			try {
				const body = (await (await fetch(asked)).json()) as {
					status?: string;
					data?: HealthReads;
				};
				if (!gone && body.status === 'success' && body.data) current = body.data;
			} catch {
				// Kept at what was read last; the next round asks again.
			}
		}, EVERY);
		return () => {
			gone = true;
			clearInterval(timer);
		};
	});

	const healths = $derived(
		current
			? where
					.map((node): [Node, Health] => [node, healthOf(current?.[node])])
					.filter(([, health]) => known || health.kind !== 'absent')
			: [],
	);
	const leading = $derived(primaries(healths));
	const keepers = $derived(
		healths.flatMap(([, health]) => (health.kind === 'keeper' ? [health.keeper] : [])),
	);
	const halted = $derived(keepers.some(stopped));
</script>

{#snippet line(label: string, value: string, title?: string)}
	<dt class={stylex.attrs(type.label).class}>{label}</dt>
	<dd class={stylex.attrs(type.figure).class} {title}>{value}</dd>
{/snippet}

{#snippet primary(keeper: Keeper)}
	{@const backup = keeper.backup}
	<dl class="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-1.5">
		{#each keeper.standbys ?? [] as standby (standby.name)}
			<dt class={stylex.attrs(type.label).class}><NodeName code={standby.name} short /></dt>
			<dd class="flex flex-wrap items-center gap-2">
				<Badge tone={toneOf(standby.state)}>{said(standby.state)}</Badge>
				<span class={stylex.attrs(type.figure).class}>
					{standby.lag_bytes === undefined ? 'Lag unknown' : `${bytes(standby.lag_bytes)} behind`}
				</span>
			</dd>
		{:else}
			{@render line('Standbys', keeper.standbys ? 'None' : 'Unknown')}
		{/each}
		<dt class={stylex.attrs(type.label).class}>Backup</dt>
		<dd>
			<Badge tone={toneOf(backup?.state)}>
				{backup?.state === 'stopped' ? 'Stopped' : said(backup?.state)}
			</Badge>
		</dd>
		<dt class={stylex.attrs(type.label).class}>Archiving</dt>
		<dd class="flex flex-wrap items-center gap-2">
			<Badge tone={toneOf(backup?.archiving)}>{said(backup?.archiving)}</Badge>
			{#if backup?.oldest_waiting}
				<span class={stylex.attrs(type.mono).class} title={backup.oldest_waiting}>
					{backup.oldest_waiting_seconds === undefined
						? 'a segment waiting'
						: `waiting ${age(backup.oldest_waiting_seconds / 3600)}`}
				</span>
			{/if}
		</dd>
		{@render line(
			'Last base backup',
			backup?.last_base_backup_age_hours === undefined
				? backup?.last_base_backup
					? localTime(backup.last_base_backup, zone)
					: 'Unknown'
				: `${age(backup.last_base_backup_age_hours)} ago`,
			backup?.last_base_backup && localTime(backup.last_base_backup, zone),
		)}
	</dl>
{/snippet}

{#snippet standby(keeper: Keeper)}
	<dl class="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-1.5">
		<dt class={stylex.attrs(type.label).class}>Replication</dt>
		<dd>
			{#if keeper.streaming === undefined}
				<Badge tone="quiet">Unknown</Badge>
			{:else}
				<Badge tone={keeper.streaming ? 'good' : 'warn'}>
					{keeper.streaming ? 'Streaming' : 'Not streaming'}
				</Badge>
			{/if}
		</dd>
		{@render line(
			'Behind',
			[
				keeper.lag_bytes === undefined ? undefined : bytes(keeper.lag_bytes),
				keeper.lag_seconds === undefined ? undefined : `${keeper.lag_seconds.toFixed(1)} s`,
			]
				.filter(Boolean)
				.join(', ') || 'Unknown',
		)}
	</dl>
{/snippet}

{#snippet node(code: Node, health: Health)}
	<div class="flex min-w-0 flex-col gap-3 px-4 py-3.5 {stylex.attrs(surfaces.well).class}">
		<div class="flex items-center justify-between gap-2">
			<span class={stylex.attrs(type.name).class}><NodeName {code} /></span>
			{#if health.kind === 'keeper'}
				<span class={stylex.attrs(type.soft).class}>{said(health.keeper.role)}</span>
			{/if}
		</div>
		{#if health.kind === 'keeper'}
			{#if mismatched(health.keeper)}
				<div class="flex"><Badge tone="warn">Configured as {health.keeper.configured}</Badge></div>
			{/if}
			{#if health.keeper.role === 'primary'}
				{@render primary(health.keeper)}
			{:else if health.keeper.role === 'standby'}
				{@render standby(health.keeper)}
			{:else}
				<p class={stylex.attrs(type.soft).class}>Role unknown.</p>
			{/if}
		{:else if health.kind === 'unwell'}
			<div class="flex"><Badge tone="warn">Not ready</Badge></div>
			<p class={stylex.attrs(type.soft).class}>
				{health.message}
				{#if health.code}<span class={stylex.attrs(type.mono).class}>{health.code}</span>{/if}
			</p>
		{:else if health.kind === 'silent'}
			<div class="flex"><Badge tone="bad">Not answering</Badge></div>
			<p class={stylex.attrs(type.soft).class}>{health.error}</p>
		{:else if health.kind === 'unavailable'}
			<p class={stylex.attrs(type.soft).class}>Not available yet.</p>
		{:else if health.kind === 'absent'}
			<p class={stylex.attrs(type.soft).class}>Not deployed here.</p>
		{:else}
			<p class={stylex.attrs(type.soft).class}>
				Could not be read. {health.message}
				<span class={stylex.attrs(type.mono).class}>{health.code}</span>
			</p>
		{/if}
		{#if 'checked_at' in health && health.checked_at}
			<span class={stylex.attrs(type.soft).class}>
				Checked {localTime(health.checked_at, zone)}
			</span>
		{/if}
	</div>
{/snippet}

<Card title="Replication and backup">
	{#snippet aside()}
		<span class="flex flex-wrap items-center gap-2">
			{#if halted}<Badge tone="bad">Backups stopped</Badge>{/if}
			{#if leading.length > 1}
				<Badge tone="bad">{leading.length} primaries</Badge>
			{:else if leading.length === 1}
				<span class={stylex.attrs(type.soft).class}
					>Primary on {nodeLabel(leading[0] ?? '', 'lead')}</span
				>
			{:else if keepers.length}
				<Badge tone="warn">No primary</Badge>
			{/if}
		</span>
	{/snippet}
	<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
		{#if !current}
			{#each where as code (code)}<Skeleton height={BLOCK} />{/each}
		{:else}
			{#each healths as [code, health] (code)}{@render node(code, health)}{/each}
		{/if}
	</div>
</Card>
